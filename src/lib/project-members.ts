import type { Task, TeamMember } from '@/data/types'

/**
 * Collect every team member who actually has a task in the given
 * project. Used by:
 *   - the Board page's assignee filter when a project is selected,
 *   - the Project Detail board tab's assignee filter,
 *   - the project card's avatar stack on /projects.
 *
 * The full project roster (`Project.memberIds`) intentionally is NOT
 * consulted here — a member listed on the project but with no tasks
 * in it shouldn't clutter the filter dropdown or the avatar stack.
 *
 * Members whose slug appears on a task but is missing from
 * `teamMembers` (e.g., dropped from KNOWN_MEMBERS) are synthesized so
 * the task isn't quietly hidden. The synthesized member's name is the
 * slug title-cased.
 */
export function getProjectMembers(
  projectId: string,
  tasks: Task[],
  teamMembers: TeamMember[],
): TeamMember[] {
  const ids = new Set<string>()
  for (const t of tasks) {
    if (t.projectId !== projectId) continue
    if (t.assigneeId) ids.add(t.assigneeId)
  }
  if (ids.size === 0) return []

  const byId = new Map(teamMembers.map((m) => [m.id, m]))
  const out: TeamMember[] = []
  for (const id of ids) {
    const found = byId.get(id)
    out.push(found ?? synthesizeMember(id))
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * Whether the project has any task without an assignee. The board's
 * filter bar uses this to decide whether the "Unassigned" option is
 * meaningful for the scope.
 */
export function projectHasUnassignedTasks(
  projectId: string,
  tasks: Task[],
): boolean {
  return tasks.some(
    (t) => t.projectId === projectId && t.assigneeId === null,
  )
}

/** "rebeccah" → "Rebeccah", "brian-p" → "Brian P". Matches the
 *  display-name heuristic used in the atlas mapper for unknown slugs. */
function slugToDisplayName(slug: string): string {
  if (!slug) return ''
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function synthesizeMember(id: string): TeamMember {
  return {
    id,
    name: slugToDisplayName(id) || id,
    email: `${id}@team.com`,
    role: 'member',
    avatarUrl: null,
    createdAt: '',
  }
}
