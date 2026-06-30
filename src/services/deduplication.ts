/**
 * Title similarity + duplicate detection for tasks.
 *
 * The same work item can show up multiple times in the store because we
 * pull from several sources that don't share an id space:
 *   - Atlas tasks (extracted from meeting transcripts by the LLM
 *     pipeline)
 *   - Meeting action items (carried on the manifest alongside Atlas's
 *     extracted tasks)
 *   - Google Sheets rows (the canonical source for `contracting-com`)
 *   - Locally-created tasks (user explicitly typed them)
 *
 * This module is **pure** — no React, no Supabase, no localStorage. The
 * store calls into it from the one mutation site where it's most
 * impactful today (`convertActionItemToTask`) and may expand to a
 * post-load pass later. Keeping it pure means it can be unit-tested in
 * isolation and reused by a future PM-facing "review duplicates" panel.
 *
 * The scoring is deliberately simple — Jaccard + contains check on
 * normalised tokens. It catches the cases we actually see ("Fix UI lag"
 * matching "Fix the UI lag when selecting profiles") without the cost
 * of a real embedding model.
 */

import type { Task } from '@/data/types'

// ── Similarity scoring ──────────────────────────────────────────────────────

/** Strip punctuation, lowercase, collapse whitespace. Returns the
 *  normalised form used for both the contains check and tokenisation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokenise into a Set of words. Short tokens (≤2 chars) are dropped —
 *  "a", "to", "is" carry no signal and would inflate the union and
 *  flatten the score. */
function tokenize(normalised: string): Set<string> {
  const out = new Set<string>()
  for (const t of normalised.split(' ')) {
    if (t.length > 2) out.add(t)
  }
  return out
}

/**
 * Title similarity in [0, 1]:
 *   1.0  — normalised strings are identical
 *   0.9  — one normalised string contains the other (substring)
 *   else — Jaccard similarity over the tokens (intersection / union)
 *
 * The contains check matters because Atlas often expands an action
 * item's text into a richer task title ("Fix lag" → "Fix the UI lag
 * when selecting profiles"). Pure Jaccard would score this around
 * 0.4 even though it's clearly the same item.
 */
export function calculateSimilarity(textA: string, textB: string): number {
  const a = normalize(textA)
  const b = normalize(textB)
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection += 1
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ── Duplicate detection ─────────────────────────────────────────────────────

/** Source tag attached to each task in a duplicate group. Distinct from
 *  the Task `source` enum (which the codebase doesn't have) so callers
 *  can pass whatever string identifies origin in their context. */
export type TaskSourceKind =
  | 'atlas'
  | 'google-sheets'
  | 'meeting-action-item'
  | 'local'
  | 'unknown'

export interface DuplicateMatch {
  task: Task
  source: TaskSourceKind
  similarity: number
}

export interface DuplicateGroup {
  primary: Task
  primarySource: TaskSourceKind
  duplicates: DuplicateMatch[]
}

/** Best-effort source classification when the caller doesn't supply
 *  one. Inspects fields the existing mapper layer fills in. */
export function inferSourceKind(task: Task): TaskSourceKind {
  if (task.sourceMeetingId || task.sourceActionItemId) return 'meeting-action-item'
  // Atlas / Sheets / local distinction lives in the snapshot layer
  // and isn't carried on the Task itself today. Callers that know the
  // source explicitly should pass it through.
  return 'unknown'
}

/**
 * Rank two task+source pairs and return the one that should be the
 * primary (the visible "canonical" task). Ordering — most preferred
 * first:
 *   1. Locally-created tasks (user typed it explicitly).
 *   2. Google Sheets, for the contracting-com project where Sheets
 *      is the source of truth (caller scopes this externally — we
 *      apply the rule generically when both sides are Sheets-vs-other).
 *   3. Atlas tasks (richer extraction than raw action items).
 *   4. Meeting action items.
 *   5. Unknown.
 * On a tie within the same tier, the earlier `createdAt` wins
 * (older entry is the "original").
 */
function rankSource(kind: TaskSourceKind): number {
  switch (kind) {
    case 'local':
      return 4
    case 'google-sheets':
      return 3
    case 'atlas':
      return 2
    case 'meeting-action-item':
      return 1
    default:
      return 0
  }
}

function preferPrimary(
  a: { task: Task; source: TaskSourceKind },
  b: { task: Task; source: TaskSourceKind },
): { task: Task; source: TaskSourceKind } {
  const ra = rankSource(a.source)
  const rb = rankSource(b.source)
  if (ra !== rb) return ra > rb ? a : b
  // Tie on source — earlier createdAt wins.
  return a.task.createdAt <= b.task.createdAt ? a : b
}

export interface DetectOptions {
  /** Minimum similarity to call two tasks duplicates. Default 0.6
   *  catches "Fix login bug" ≈ "Fix the login bug now" without
   *  matching unrelated tasks that happen to share one word. */
  threshold?: number
  /** When provided, only pairs within the same project are considered
   *  duplicates. Cross-project matches almost always trip on shared
   *  generic verbs ("Update docs") that aren't the same work item. */
  scopeByProject?: boolean
  /** Lookup from task id → source kind for ranking. Tasks not in the
   *  map use `inferSourceKind`. */
  sourceOf?: Map<string, TaskSourceKind>
}

/**
 * Group tasks into duplicate clusters. O(n²) on input size — fine for
 * the ~1k tasks we see, would need an n-gram index past that.
 *
 * Each output group contains one `primary` plus one or more
 * `duplicates`. A task never appears in two groups: once it's grouped,
 * it's consumed.
 */
export function detectDuplicates(
  tasks: Task[],
  opts: DetectOptions = {},
): DuplicateGroup[] {
  const threshold = opts.threshold ?? 0.6
  const scopeByProject = opts.scopeByProject ?? true
  const sourceOf = opts.sourceOf
  const sourceFor = (t: Task): TaskSourceKind =>
    sourceOf?.get(t.id) ?? inferSourceKind(t)

  const groups: DuplicateGroup[] = []
  const consumed = new Set<string>()

  for (let i = 0; i < tasks.length; i++) {
    const left = tasks[i]
    if (!left) continue
    if (consumed.has(left.id)) continue
    let bestPrimary = { task: left, source: sourceFor(left) }
    const matches: DuplicateMatch[] = []
    for (let j = i + 1; j < tasks.length; j++) {
      const right = tasks[j]
      if (!right) continue
      if (consumed.has(right.id)) continue
      if (scopeByProject && left.projectId !== right.projectId) continue
      const sim = calculateSimilarity(left.title, right.title)
      if (sim < threshold) continue
      const rightSource = sourceFor(right)
      matches.push({ task: right, source: rightSource, similarity: sim })
      consumed.add(right.id)
      bestPrimary = preferPrimary(bestPrimary, {
        task: right,
        source: rightSource,
      })
    }
    if (matches.length === 0) continue
    consumed.add(left.id)
    // If the chosen primary isn't `left`, re-shuffle: pull bestPrimary
    // out of matches (if it landed there) and demote `left` into the
    // duplicates list.
    const primary = bestPrimary.task
    const primarySource = bestPrimary.source
    const finalDuplicates: DuplicateMatch[] =
      primary === left
        ? matches
        : matches
            .filter((m) => m.task.id !== primary.id)
            .concat({
              task: left,
              source: sourceFor(left),
              similarity: 1, // self-pair vs primary: tracked just so it appears
            })
    groups.push({ primary, primarySource, duplicates: finalDuplicates })
  }
  return groups
}

/**
 * Find the single best match for `candidate` against `existing`.
 * Returns `null` when nothing meets the threshold. Used at decision
 * points where the caller wants "should I create this task or link to
 * an existing one?" — e.g. converting a meeting action item.
 */
export function findBestMatch(
  candidateTitle: string,
  candidateProjectId: string,
  existing: Task[],
  threshold = 0.7,
): { task: Task; similarity: number } | null {
  let best: { task: Task; similarity: number } | null = null
  for (const t of existing) {
    if (t.projectId !== candidateProjectId) continue
    const sim = calculateSimilarity(candidateTitle, t.title)
    if (sim < threshold) continue
    if (!best || sim > best.similarity) best = { task: t, similarity: sim }
  }
  return best
}
