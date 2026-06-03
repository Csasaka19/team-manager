# Team Manager

A project- and task-management web app for small-to-medium teams (2–20 people).
Project managers get strategic oversight across every workstream. Team members
get a focused personal queue. Everyone gets clarity on priorities, progress,
and who's doing what.

Built as a fully-functional **MVP frontend** with mock data — no backend
required to demo. Drop in a real API later and the UI doesn't need to change.

> **Status:** MVP. All eight pages from the product spec are implemented.
> Data lives in React Context, persisted settings live in `localStorage`,
> mutations have an artificial 800ms delay so loading states are visible.

---

## Table of contents

- [Highlights](#highlights)
- [Demo accounts](#demo-accounts)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Pages](#pages)
- [Architecture notes](#architecture-notes)
- [Mock data & the "demo now" anchor](#mock-data--the-demo-now-anchor)
- [Responsive design](#responsive-design)
- [Accessibility](#accessibility)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Quick Create](#quick-create)
- [Task templates](#task-templates)
- [Subtasks](#subtasks)
- [PM dashboard](#pm-dashboard)
- [Polish & a11y](#polish--a11y)
- [Bulk actions](#bulk-actions)
- [Board view modes](#board-view-modes)
- [Due dates](#due-dates)
- [Activity feed](#activity-feed)
- [Discord integration](#discord-integration)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- **Two roles, gated routes.** PMs can do everything. Members can only update
  their own tasks. The Dashboard route is PM-only; a Member hitting it is
  redirected with a toast.
- **Drag-and-drop kanban** powered by `@dnd-kit/core`. Cards reflow optimistically;
  PMs can drag anywhere, Members can only drag cards assigned to them.
- **Inline-edit task detail** with autosaving description, DnD-reorderable
  subtasks, @mention dropdown in comments, status/priority/assignee/due-date
  controls, tags, and a combined activity + comment feed.
- **PM dashboard** with summary cards, a "Needs attention" surface (overdue /
  unassigned / stale / open questions), and a 20-item activity feed.
- **Command palette** (`Cmd`/`Ctrl` + `K` or `/`) groups Actions, Tasks, and
  Projects in one debounced search. Pair it with the global shortcut layer —
  `G` then `D`/`B`/`M`/`P`/`T` for navigation, `C` to create a task, `?` to see
  the full reference. See [Keyboard shortcuts](#keyboard-shortcuts).
- **Quick Create** — a compact 5-field modal (title, project, priority,
  assignee, due date) reachable via `C`, the command palette, the board's
  `+ New Task` button, or a mobile-only floating `+` FAB. Smart project
  defaulting, session-remembered last project, **Create** vs **Create & Open**
  submit modes. See [Quick Create](#quick-create).
- **Task templates** — PM-curated presets (title, priority, default
  subtasks, default tags) for repetitive task shapes. Three ship by
  default — Bug Report, Feature Request, Documentation — and Quick
  Create exposes them in a "Use template" dropdown that pre-fills the
  form and materializes the subtasks on submit. See
  [Task templates](#task-templates).
- **Subtask experience** — drag handles appear on hover for reordering,
  a fat progress bar with `done / total (%)` overlay (and a pulse +
  "All subtasks complete ✓" at 100%), 20px assignee avatars on every
  row with a click-to-pick popover, Tab to chain rapid entry, and a
  collapse toggle once more than three are checked off. Subtask
  assignments surface in the assignee's My Tasks list with a "Subtask
  assigned to you" caption. See [Subtasks](#subtasks).
- **PM dashboard panels** — Projects-at-a-Glance ring widgets, a
  Mon–Sun "This Week" column timeline, and a per-section collapse
  state persisted to `localStorage` so each PM customizes their
  density. See [PM dashboard](#pm-dashboard).
- **Bulk actions on the board** — Ctrl/Cmd-click cards to multi-select,
  Shift-click to extend a range within a column, then a floating bar lets
  you set priority / assignee / due date / status, or delete, on every
  selected card at once. Discord receives one summary message instead of N.
  See [Bulk actions](#bulk-actions).
- **Board ↔ List view toggle** — flip `/board` into a sortable
  spreadsheet-style list with inline-edit popovers on every cell, a
  checkbox to mark done, and responsive column-hiding. See
  [Board view modes](#board-view-modes).
- **Smart due dates** — relative labels everywhere ("Today",
  "Wednesday", "Next Tuesday", "Overdue — 3 days"), seven preset buttons
  in every date picker, overdue rows/cards visually flagged across
  Board / My Tasks / Dashboard, and a once-per-session Discord digest
  of every overdue task. See [Due dates](#due-dates).
- **Rich activity feed** — every meaningful mutation (creation, status,
  assignment, priority, subtask, comment, due-date, deletion, project,
  team) emits a typed activity. Dashboard shows a filterable
  paginated feed; task detail interleaves big comment cards with
  compact system rows. Per-item timestamp toggle. See
  [Activity feed](#activity-feed).
- **Discord integration** — relay task events (created / status changed /
  assigned / completed / commented) to a Discord channel via webhook, with
  rich embeds and per-event toggles in Settings. See
  [Discord integration](#discord-integration).
- **In-app notifications** with a bell + badge in the top bar, auto-emitted on
  assignment / comment / @mention / status change, with per-user preferences
  that actually gate emission.
- **Persisted workspace settings** — workspace name, column rename, and column
  reorder all live in `localStorage` and survive a reload.
- **Mobile-first.** Works at 375px viewport without horizontal scroll. 44px
  touch targets in the top bar.
- **Industrial-clean light & dark themes** with a toggle in the top bar.
  All colors flow through CSS variables — no hardcoded palette values in
  components. Defaults follow `prefers-color-scheme`; explicit choice is
  remembered and applied pre-paint so there's no flash on reload.

---

## Demo accounts

Two seeded accounts ship with the mock data. Pick one on the login page:

| Role | Email | Password | Lands on |
|---|---|---|---|
| Project Manager | `pm@team.com` | `demo1234` | `/dashboard` |
| Team Member | `member@team.com` | `demo1234` | `/my-tasks` |

The PM (Alex Morgan) has visibility on every project and the full Settings
panel. The Member (Sam Chen) sees only their own queue and a simplified
Settings panel.

---

## Tech stack

| Layer | Pick | Why |
|---|---|---|
| Build tool | **Vite 8** | Fast HMR, native ESM, zero webpack config |
| UI framework | **React 19** | Concurrent features, automatic batching |
| Language | **TypeScript 6** (strict + `noUncheckedIndexedAccess`) | Catches the bugs that eat afternoons |
| Styling | **Tailwind CSS v4** | Utility-first; design tokens via CSS variables |
| Components | **shadcn/ui** primitives + `lucide-react` icons | You own the source |
| Routing | **React Router v7** | One `<Routes>` tree in `App.tsx` |
| State | **React Context** (Auth + Data) | No Redux/Zustand/Jotai — Context is enough at this size |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Tree-shakeable, accessible |
| Toasts | `sonner` | Follows the active theme, bottom-right, auto-dismiss |
| Date math | Custom utils in `src/lib/date-utils.ts` | Demo "now" is anchored — see [below](#mock-data--the-demo-now-anchor) |

The bundle is **~520 KB JS / ~148 KB gzipped** at the moment — under the
typical lazy-loading threshold so all routes load eagerly.

---

## Quick start

**Requirements:** Node 20+ (Vite 8 needs it).

```bash
git clone https://github.com/<you>/team-manager.git
cd team-manager
npm install
npm run dev
```

The dev server boots on **http://localhost:5173**. Log in with one of the
[demo accounts](#demo-accounts) and you're off.

To build for production:

```bash
npm run build
npm run preview   # serve the production build locally
```

---

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then produce a production build in `dist/` |
| `npm run lint` | Type-check only (no emit) |
| `npm run eslint` | Run ESLint over the source tree |
| `npm run preview` | Serve the `dist/` build for a final sanity check |

---

## Project structure

```
src/
├── main.tsx                    # Entry — wraps the app in AuthProvider + DataProvider + BrowserRouter
├── App.tsx                     # Single <Routes> tree — every URL is defined here
├── index.css                   # Tailwind import + design-brief CSS variables
│
├── pages/                      # One file per route (default-exported)
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx       # /dashboard  (PM only)
│   ├── BoardPage.tsx           # /board      (kanban with DnD + filters)
│   ├── MyTasksPage.tsx         # /my-tasks   (personal queue by due-date bucket)
│   ├── TaskDetailPage.tsx      # /tasks/:taskId
│   ├── ProjectsPage.tsx        # /projects
│   ├── TeamPage.tsx            # /team
│   ├── SettingsPage.tsx        # /settings
│   └── NotFoundPage.tsx        # *
│
├── components/
│   ├── auth/                   # ProtectedRoute (gates everything)
│   ├── layout/                 # Sidebar, TopBar, UserMenu, Layout
│   ├── shared/                 # Avatar, AvatarStack, PriorityBadge, StatusPill, ConfirmModal
│   ├── dashboard/              # SummaryCard, NeedsAttention, ActivityFeed
│   ├── board/                  # BoardColumn, TaskCard, FilterBar
│   ├── my-tasks/               # TaskRow, TaskSection
│   ├── task-detail/            # TaskHeader, DescriptionEditor, SubtaskSection,
│   │                           #   SubtaskRow, TagsSection, CommentInput,
│   │                           #   ActivityCommentFeed
│   ├── quick-create/           # QuickCreateModal (compact task creation)
│   ├── projects/               # ProjectCard, ProjectFormModal
│   ├── team/                   # TeamMemberCard, InviteMemberModal
│   ├── settings/               # WorkspaceSection, TagsSection,
│   │                           #   NotificationsSection, AccountSection,
│   │                           #   DiscordSection
│   ├── command-palette/        # CommandPalette (Cmd+K search + actions)
│   └── notifications/          # NotificationBell
│
├── data/
│   ├── types.ts                # Every domain type — Task, Project, Subtask, etc.
│   ├── mock-data.ts            # Seeded fixtures anchored to 2026-05-22
│   ├── store.ts                # DataProvider — single source of truth
│   └── auth.ts                 # AuthProvider — login, logout, role checks
│
├── services/
│   └── discord.ts              # Discord webhook integration (embeds + send)
│
└── lib/
    ├── utils.ts                # cn() — tailwind-merge + clsx
    └── date-utils.ts           # startOfWeek, endOfWeek, relativeTime, isOverdue, etc.

docs/
├── product-spec.md             # What we're building (read this first)
├── design-brief.md             # Visual direction (colors, spacing, components)
├── design-system.md            # (alternate longer reference)
└── react-stack.md              # The default stack rules these projects follow
```

---

## Pages

| Page | Route | Default for | Status |
|---|---|---|---|
| Login | `/login` | Unauthenticated | ✅ |
| Dashboard | `/dashboard` | PM | ✅ PM-only, summary cards + needs-attention + activity |
| Board | `/board` | All | ✅ kanban + list view toggle, filters, `?project=` deep links, PM-only `+ New Task` |
| My Tasks | `/my-tasks` | Member | ✅ Due Today / This Week / Upcoming / Completed buckets |
| Task Detail | `/tasks/:taskId` | All | ✅ full edit surface; 404 for invalid IDs |
| Projects | `/projects` | All | ✅ grid, archived tab, PM-only CRUD |
| Team | `/team` | All | ✅ expandable cards with workload + velocity charts; PM invite/remove |
| Settings | `/settings` | All | 🟡 workspace name + column rename + reorder persist; column add/remove not implemented |
| 404 | `*` | All | ✅ |

🟡 = Settings' "add/remove column" controls aren't wired because `Task.status`
is a fixed union (`'todo' | 'in_progress' | 'in_review' | 'done'`). Rename and
reorder are real and persisted.

---

## Architecture notes

**State layering.** Two contexts, no library:

- `AuthProvider` — current user, `login`, `logout`, `updateCurrentUser`. Persists
  the logged-in user ID to `localStorage` under `team-manager.auth.userId`.
- `DataProvider` — every domain collection (`tasks`, `projects`, etc.) plus
  every mutation. Reads `currentUser` from `AuthProvider` to attribute
  actions, so `AuthProvider` must be mounted above `DataProvider`.

**Mutations.** Every mutation in the store is wrapped in `withMutation()`,
which:

1. Increments an in-flight counter (drives the global `mutating` flag).
2. Awaits an artificial 800 ms delay so loading/disabled states are visible.
3. Runs the actual state update.
4. Decrements the counter.

When you swap to a real backend, replace `withMutation` with your `fetch`
call — every caller already handles the Promise.

**Auto-activity & auto-notifications.** Status changes, assignments, priority
changes, and subtask completions push synthetic `Activity` entries. Assignments,
comments, and `@mentions` also push `Notification` entries — gated by the
recipient's saved preferences (see Settings → Notifications).

**Permission gating** is enforced in three places, deliberately:

1. **Route level** — `ProtectedRoute requirePM` redirects Members away from
   `/dashboard`.
2. **UI level** — Members don't see the Dashboard link in the sidebar, the
   `+ New Task` button on the board, the gear icon on project cards, the
   trash icon on the task header, etc.
3. **Action level** — Even if a Member crafted a `canDragTask`-bypass, the
   drag handler still checks before calling `updateTask`.

Defense in depth, but with a real backend you'd want server-side enforcement
to be the source of truth.

**CSS variables, not Tailwind config.** All colors live as CSS variables in
`src/index.css` and are consumed via `text-[var(--text-primary)]` /
`bg-[var(--bg-surface)]`. This makes theming a one-file change and keeps the
component code free of hex values. The only hex literals in components are
the 8-color **data** palette used for project dots, tag pills, and avatar
hashing.

---

## Mock data & the "demo now" anchor

`src/lib/date-utils.ts` defines a fixed `DEMO_NOW = 2026-05-22T18:00:00Z` and
every "now-relative" computation goes through `now()`. This keeps seeded
fixtures alive forever — dashboard buckets, overdue badges, "this week" lists
all behave the same regardless of when you open the app.

The seeded dataset has:

- **2 team members** — Alex (PM) and Sam (Member)
- **3 projects** — Website Redesign (blue), Mobile App (green), API Migration (amber)
- **6 tags** — bug, feature, urgent, documentation, design, backend
- **19 tasks** — 3 overdue, 5 due this week, 6 done this week, 2 unassigned-high, 4 with subtasks
- **25 activities** — across status changes, comments, assignments, etc.
- **~12 notifications per user**

To swap to real wall-clock time, change one line:

```ts
// src/lib/date-utils.ts
export function now(): Date {
  return new Date()   // was: return new Date(DEMO_NOW)
}
```

---

## Responsive design

Mobile-first throughout. Tested layout assumptions:

- **375 px (iPhone SE):** sidebar is a slide-in overlay with backdrop; top-bar
  buttons are 44 px tap targets; modals are `w-full max-w-[XXX]` with `px-4`
  outer padding; the kanban board scrolls horizontally inside an edge-bleed
  container.
- **768 px (iPad portrait):** sidebar collapses to 64 px icon-only; card grids
  go 2-up; board columns still horizontal-scroll if 4 × 280 px exceeds the
  content area.
- **1024 px+ (desktop):** sidebar at full 240 px; Dashboard summary becomes
  4-up; Projects grid becomes 3-up; Team grid becomes 2-up.

**Light & dark themes.** A `Sun` / `Moon` button in the top bar toggles between
them. The icon shown is the theme you'd switch _to_, which is the convention
most users intuit. Implementation notes:

- Initial theme resolves in order: `localStorage` → `prefers-color-scheme` →
  dark fallback. The chosen palette is applied via a synchronous `<script>`
  in `<head>` before React mounts, so there's no flash of the wrong theme
  on reload.
- Only surface/border/text tokens flip between modes — accent blue, priority
  colors (red/amber/blue/gray), status pills, and destructive red stay
  constant so brand meaning doesn't drift between modes.
- `color-scheme: light` / `dark` is set on each root so native form controls
  (date picker, scrollbars) follow the chosen theme.
- The toggle uses `role="switch"` + `aria-checked` and a dynamic `aria-label`
  so screen-reader users hear the destination state on focus.

---

## Accessibility

- All interactive elements have visible focus rings (`focus-visible:ring-2 ring-[var(--accent-focus)]`).
- Color is never the sole information channel — priority and status both have
  text labels and colors.
- `--text-primary` on `--bg-base` exceeds 7:1 contrast; `--text-secondary`
  exceeds 4.5:1.
- Keyboard navigation: Tab through every interactive element; Enter / Space
  to activate; Escape to close modals, dropdowns, and the command palette;
  arrow keys to navigate result lists and `@mention` lists. A full power-user
  shortcut layer is documented in [Keyboard shortcuts](#keyboard-shortcuts).
- ARIA labels on every icon-only button; `aria-expanded` on disclosure
  triggers; `aria-modal` and `role="dialog"` on every modal.

---

## Keyboard shortcuts

Press `?` from anywhere in the app to see this list in a modal. All
shortcuts are disabled while focus is in an `<input>`, `<textarea>`,
`<select>`, or `contenteditable` element, so they never conflict with
typing — the one exception is `Cmd`/`Ctrl` + `K`, which always summons
the palette.

A floating `?` button sits in the bottom-right of every page (on
desktop) for users who prefer to discover shortcuts visually.

### Global

| Shortcut | Action |
|---|---|
| `Cmd` / `Ctrl` + `K` | Open the command palette |
| `/` | Open the command palette (single-key) |
| `?` | Show the keyboard-shortcut reference |
| `C` | Open [Quick Create](#quick-create) (PM only) |
| `G` then `D` | Go to Dashboard (PM only) |
| `G` then `B` | Go to Board |
| `G` then `M` | Go to My Tasks |
| `G` then `P` | Go to Projects |
| `G` then `T` | Go to Team |

The `G`-prefixed navigation accepts the follow-up letter within 1.5 s
of the `G` keypress; after that the sequence resets.

### Board (`/board`)

| Shortcut | Action |
|---|---|
| `←` `↑` `→` `↓` | Move the selection ring between cards. Up/Down moves within a column, Left/Right jumps to the same row in the next non-empty column. |
| `Enter` | Open the selected task |
| `1` / `2` / `3` / `4` | Set priority to Critical / High / Medium / Low (PM only) |
| `Esc` | Clear the multi-select set (see [Bulk actions](#bulk-actions)) |
| `Ctrl` / `Cmd` + click | Toggle multi-select on a card (PM only) |
| `Shift` + click | Range-select within a column (PM only) |

The selected card auto-scrolls into view, so navigation works on long
columns without needing to scroll first.

### Task detail (`/tasks/:taskId`)

| Shortcut | Action |
|---|---|
| `A` | Focus the assignee dropdown |
| `P` | Focus the priority dropdown |
| `S` | Focus the status dropdown |
| `D` | Focus the due-date picker |
| `M` | Jump to the comment input |

Focus-only — the dropdown opens with Space / Alt-Down once focused,
which keeps the shortcuts dependable across browsers (programmatic
`select` opening isn't portable).

### Command palette

The palette groups results into three sections, max 5 rows per group:

- **Actions** — Create task, Create project, the five `G`-prefixed
  navigations, Go to Settings, Log out. Each row shows the keyboard
  shortcut next to its label so it's discoverable.
- **Tasks** — fuzzy match against title and description. Each row shows
  the project dot, project name, assignee, and a status pill.
- **Projects** — fuzzy match against name and description. Selecting a
  project navigates to `/board?project=<id>`.

`↑` / `↓` move within the merged result list, `Enter` selects, `Esc`
closes.

---

## Quick Create

The fastest way to add a task — open the modal, name the thing, pick a
project, hit `Enter`. No description, no subtasks, no tags. Those live on
the task detail page; Quick Create is optimized for capture.

Four entry points, all PM-only:

- The `C` keyboard shortcut (disabled while typing in any input).
- The **Create task** action in the command palette (`Cmd`/`Ctrl` + `K`).
- The **+ New Task** button in the board header.
- A floating **+** FAB in the bottom-right corner on viewports below
  768 px, so touch users have a discoverable creation surface without
  reaching for a keyboard.

The form is five fields:

| Field | Notes |
|---|---|
| Title | Required, autofocused, 200-char limit. `Enter` submits. |
| Project | Required dropdown. Pre-selected from context — see below. |
| Priority | 4-button radio row (Critical / High / Medium / Low). Default: Medium. |
| Assignee | Avatar chip → click to open the team-member list. Default: unassigned. |
| Due date | Calendar chip → presets Today / Tomorrow / Next week / No date, plus a custom date input. Default: none. |

### Default-project resolution

When the modal opens it tries to pre-select a sensible project, in this
order:

1. Explicit `projectId` from the caller — the board's **+ New Task**
   button passes the active filter.
2. URL context — `?project=<id>` on `/board`, or the parent task's
   project if you triggered Quick Create from a task detail page.
3. The last project you picked in this tab. Reset on full reload —
   nothing's persisted to `localStorage`, which is deliberate (session
   memory only, per the spec).
4. Nothing — the dropdown shows "Select project…" and the submit
   buttons stay disabled until you choose one.

### Submit modes

| Button | Behavior |
|---|---|
| **Create** (primary) | Creates the task, closes the modal, shows a toast with an **Open** link to jump to the new task detail. Optimal for batch entry. |
| **Create & Open** (secondary) | Creates the task and navigates straight to `/tasks/:id`. The toast appears without an action since you're already on the task. |
| `Enter` | Same as **Create**. |
| `Esc` / backdrop click | Closes without creating. |

The new card appears immediately in the appropriate board column (and
in the assignee's My Tasks list, if applicable) — no manual refresh,
since the in-memory store updates synchronously after the artificial
800 ms mutation delay.

---

## Task templates

Settings → **Task Templates** (PM only) is where the team's repeated
task shapes live. Three ship by default; PMs can add, edit, or delete
freely.

### What ships out of the box

| Template | Title format | Priority | Subtasks | Tags |
|---|---|---|---|---|
| **Bug Report** | `Bug: [description]` | High | Reproduce · Identify root cause · Implement fix · Write regression test · Verify fix in staging | `bug` |
| **Feature Request** | `[Feature name]` | Medium | Define requirements · Design solution · Implement · Write tests · Code review · Deploy | `feature` |
| **Documentation** | `Document: [topic]` | Low | Draft content · Peer review · Publish | `documentation` |

Templates live in `localStorage` under `team-manager.task-templates`.
The seeded defaults only get written when nothing is stored yet — once
the user edits or deletes any of them, the stored array takes over and
the seeds don't reappear on refresh.

### Editor

The "New template" / edit modal collects:

- **Template name** — what shows up in the dropdown and the Settings list
- **Task title** — supports `[brackets]` to mark placeholders; Quick
  Create auto-selects the first one for fast over-typing
- **Description** — optional, lands in the new task's description field
- **Default priority**
- **Default subtasks** — repeating input rows with `+` / `×` controls
- **Default tags** — toggle-chips picked from the live tag list (stored
  by **name** so renamed/deleted tags degrade gracefully)

## Subtasks

The Task Detail page's subtask block was rebuilt for rapid editing.

### Layout

| Element | Notes |
|---|---|
| **Drag handle** | `GripVertical` on the left, hidden by default and revealed on row hover. Drag-and-drop via `@dnd-kit/sortable`; reorders persist via `reorderSubtasks` in the store. |
| **Checkbox** | Toggles `done`. |
| **Assignee** | 20px Avatar button (or a dashed `User+` placeholder when unassigned). Click opens a popover with Unassigned + every team member. Independent from the parent task's assignee. |
| **Title** | Inline-edit on click; `Enter` commits, `Esc` reverts. Completed rows render in `--text-muted` with a strikethrough. |
| **Delete** | `×` that fades in on row hover; PM or the subtask's assignee can delete. |

### Progress bar

A full-width 24px bar replaces the old "3 of 5 complete" caption:

- `--border-subtle` background, `--status-done` fill animating from
  the left as items are checked.
- Centered overlay text: `3 of 5 complete (60%)`.
- At 100% the bar pulses gently (`pulseSubtaskComplete`, 2s green
  box-shadow cycle) and the text flips to `All subtasks complete ✓`.

The pulse only fires when there's at least one subtask — empty ≠ done.

### Tab-to-create

Both inputs short-circuit a long click trail:

- **Add subtask field (bottom):** `Tab` (with a non-empty value)
  submits, clears, creates another empty row, and focuses **its** edit
  input.
- **Inline-edit input:** `Tab` commits the current edit, materializes
  a new empty placeholder below, and drops focus into it.

Empty-title subtasks deliberately **do not** emit a `subtask_created`
activity, so chaining Tab-creates doesn't pollute the feed. The first
real edit a few seconds later updates the title in place (no further
activity entry, by design).

### Completed sort + collapse

Checked items always sort to the bottom of the visible list. When more
than three are checked off, a `Show N completed subtasks` toggle
appears — defaults to hidden so the active items stay focused. The
toggle preserves the drag-reorder behavior across the full sortOrder,
so moving a row when completed are collapsed still produces a
consistent global ordering.

### Subtask assignments in My Tasks

When a subtask is assigned to someone who **isn't** the parent task's
assignee, that user sees the parent task in their **My Tasks** queue
with a small blue "Subtask assigned to you" caption above the title.
The parent task's done-checkbox is disabled for those users — only the
parent assignee (or a PM) can mark the whole task complete. If the
user is also the parent assignee, no caption shows and the row
behaves normally.

---

## Task templates / Quick Create wiring (cont.)

### Quick Create wiring

When at least one template exists, Quick Create gains a "Use template"
dropdown above the title field. Picking one:

1. Pre-fills the **title** (with the placeholder text selected — typing
   replaces it).
2. Pre-fills the **priority**.
3. Shows a small caption ("+5 subtasks · +1 tag · replace the
   [placeholder] in the title") so the user knows what's coming.
4. On **Create** or **Create & Open**, the new task carries the
   template's subtasks and the resolved tag IDs. Subtasks materialize
   in the same store mutation as the parent task — the artificial
   800 ms delay fires **once**, not once per subtask.

Subtask emissions are deliberately silent for template-created tasks:
the parent `creation` activity covers them, so the feed isn't drowned
in `subtask_created` rows when a 6-subtask feature template lands.

### Where the code lives

- `src/data/types.ts` — `TaskTemplate` interface
- `src/data/store.ts` — `templates` state, `createTemplate` /
  `updateTemplate` / `deleteTemplate`, the `DEFAULT_TASK_TEMPLATES`
  seed, and the `CreateTaskInput.subtasks` extension that lets a single
  `createTask` call materialize child subtasks atomically
- `src/components/settings/TaskTemplatesSection.tsx` — list + Add /
  Edit / Delete controls
- `src/components/settings/TaskTemplateFormModal.tsx` — the editor modal
- `src/components/quick-create/QuickCreateModal.tsx` — "Use template"
  dropdown + placeholder-selection focus behavior

---

## PM dashboard

The `/dashboard` route (PM-only) is built out of five collapsible
panels. The order top-to-bottom: **Summary**, **Projects at a Glance**,
**This Week**, **Needs Attention**, **This Week's Activity**.

### Collapsible sections

Each section is wrapped in `CollapsibleSection`, which renders the
title, an optional subtitle, an optional right-side controls slot
(e.g. the Activity filter dropdown), and a chevron toggle. State is
per-section, persisted at `team-manager.dashboard-section.<id>`
(`1` collapsed, `0` open, missing = open). Sections mount open by
default.

### Projects at a Glance

A horizontally-scrolling strip of 200px mini cards, one per active
project. Each card:

- Color dot + project name
- SVG progress ring (r=16, `--accent-primary` stroke over a
  `--border-subtle` track) with the percentage centered. Projects
  with zero tasks render `—%` instead of `0%` so a brand-new project
  doesn't look like failed work.
- `N open · M overdue` caption — `M overdue` flips to
  `--priority-critical` when greater than zero.
- The whole card is a `<Link>` to `/board?project=<id>`, so the
  Board view opens already filtered.

Archived projects are excluded — the strip is for live work.

### This Week

A Mon–Sun column grid (`grid-cols-7` on `lg+`, horizontal scroll
below) showing tasks **due** each day:

- Today's column carries a 3px `--accent-primary` left border.
- Past days fade slightly. If every task due that day is done, the
  column header shows a green check badge; if any open task is
  overdue, it shows a red `AlertTriangle` badge instead.
- Cards in each column are compact: 6px priority dot, title, 20px
  assignee avatar. Done tasks are filtered out — the header badge
  carries that signal so the body stays focused on outstanding work.
- Past-day cards render their title in red so the eye picks up the
  backlog at a glance.

Tasks without a due date don't show up in the timeline — they belong
in the regular board / list views.

### Where the code lives

- `src/components/dashboard/CollapsibleSection.tsx`
- `src/components/dashboard/ProjectsGlance.tsx` (mini card + ring)
- `src/components/dashboard/WeekTimeline.tsx` (column grid + day cells)
- `src/pages/DashboardPage.tsx` (composition + persisted activity
  filter / paginate controls slot into the Activity section)

---

## Polish & a11y

The full polish pass shipped in `9cf...`. Highlights:

### Skeleton loaders

`DataProvider` exposes an `isInitialLoading` boolean that flips from
`true` to `false` ~500 ms after mount. Three pages opt in:

- **Dashboard** — skeleton header + 4 summary cards + the projects-glance strip
- **Board** — column headers + 3 skeleton cards per column
- **My Tasks** — section headers + 3 skeleton rows per section

The shared primitives in `src/components/shared/Skeleton.tsx`
(`<SkeletonLine>`, `<SkeletonCard>`) are reusable for whatever future
fetches land.

### Transitions

- Page-to-page: `<Outlet />` is keyed on `pathname` inside a wrapper
  with `animate-[fadeIn_150ms_ease-out]` — content fades in on every
  navigation; the sidebar and top bar stay still.
- Modals: every dialog panel gets `animate-[modalIn_200ms_ease-out]`
  (opacity 0 → 1, scale 0.95 → 1). Backdrop opacity is instant.
- Toasts: sonner's default slide-in-from-right, theme-bound.

### Error boundaries

`src/components/shared/ErrorBoundary.tsx` wraps the `<Outlet />` inside
`Layout`. A crashing page falls back to a centered "Something went
wrong on this page." + `Reload` button (full page reload). The
sidebar, top bar, command palette, notifications bell, and modals
keep working — the user is never stranded.

### Page titles & favicon

`useDocumentTitle(title)` (`src/hooks/useDocumentTitle.ts`) sets
`document.title = "<title> — Team Manager"` per page:

| Page | Title |
|---|---|
| Login | `Login — Team Manager` |
| Dashboard | `Dashboard — Team Manager` |
| Board | `Board — Team Manager` |
| My Tasks | `My Tasks — Team Manager` |
| Task detail | `<Task title> — Team Manager` |
| Projects | `Projects — Team Manager` |
| Team | `Team — Team Manager` |
| Settings | `Settings — Team Manager` |
| 404 | `Not found — Team Manager` |

Favicon: a 32 × 32 SVG with "TM" white on the accent blue, served via
`/favicon.svg`.

### Sticky headers

| Surface | Sticks at |
|---|---|
| Board column header (status + count) | `top-14` |
| Task detail header (title, status, priority, assignee, due date) | `top-14` |
| My Tasks section heading (`Due Today`, `This Week`, `Upcoming`) | `top-14` |

`top-14` = under the 56 px top bar. Each sticky header gets the page
background so cards don't ghost through.

### Focus management

- **`useFocusTrap`** (`src/hooks/useFocusTrap.ts`) — caches the
  previously-focused element on modal open, focuses the first
  focusable inside the dialog, traps Tab / Shift+Tab, restores focus
  on close. Wired into the four most-used modals: `ConfirmModal`,
  `QuickCreateModal`, `CommandPalette`, `ShortcutsHelp`.
- **Heading focus on route change** — Layout uses a
  `queueMicrotask` after each navigation to set focus on the new
  page's `h1` (with `tabindex=-1` so it's reachable without entering
  the Tab order). Screen readers announce the page change cleanly.

### Debounced inputs

The command palette debounces its search input at **300 ms** (raised
from 200), matching the spec's threshold for fast-typist filtering.

---

## Bulk actions

The fastest way to triage a board. Pick a handful of cards, then change
priority / assignee / due date / status (or delete) on all of them in
one click. PM-only — bulk selection mirrors the gating on the
`+ New Task` button.

### Selecting

| Gesture | Result |
|---|---|
| `Ctrl` / `Cmd` + click on a card | Toggle that card in or out of the selection set. |
| `Shift` + click on a card | Range select within the **same column** — fills everything between the last-toggled anchor and the clicked card, in column-sort order. Across columns, just toggles the target. |
| Plain click on a card | Navigates to task detail as usual (selection unchanged for the next page). |
| Plain click on the board background | Clears the selection. |
| `Esc` | Clears the selection. |

Selected cards get a thick blue ring plus a checkmark badge in the
top-left corner. Drag-and-drop is **disabled site-wide while any card
is selected** — so a stray pointer-down can't grab a card instead of
toggling. To resume dragging, clear the selection.

### The bulk bar

When two or more cards are selected, a floating toolbar slides up from
the bottom of the screen (200ms ease-out). It's rounded 12 px,
`var(--bg-elevated)`, with a soft shadow, anchored 16 px above the
viewport bottom.

| Button | Picker | Notes |
|---|---|---|
| **Set Priority** | Critical / High / Medium / Low | Color-coded icons in the menu. |
| **Assign to** | Unassigned + every team member | First row is Unassigned. |
| **Set Due Date** | Today / Tomorrow / Next week / No date + custom date input | Same presets as Quick Create. |
| **Move to** | Every status in `columnOrder` (respects your Settings rename / reorder) | |
| **Delete** | Confirm modal | Cascades activity + notifications, matching single-task delete. |
| **Clear selection** | — | Also wired to `Esc`. |

After every action a toast confirms `Updated N tasks.` (or
`Deleted N tasks.` for delete), and the selection clears so you can move
on to the next batch.

### Discord summary, not spam

If [Discord integration](#discord-integration) is enabled, a bulk action
emits **one** summary embed instead of one per task — gated by the
event toggle that best matches the action:

| Bulk action | Discord toggle | Summary title |
|---|---|---|
| Move to **Done** | `task_completed` | ✅ Bulk update: tasks completed |
| Move to any other status | `task_status_changed` | 🔄 Bulk update: status changed |
| Assign to a person | `task_assigned` | 👤 Bulk update: tasks assigned |
| Priority / due date / delete / unassign | — | _No Discord message_ (matches single-task behavior — no events exist for those). |

The summary lists the count, the new value, and the actor — same shape
as a single-task embed, just count-scaled.

### Where the code lives

- `src/data/store.ts` — `bulkUpdateTasks(ids, patch)` and `bulkDeleteTasks(ids)`.
  Per-task activity + notifications are pushed in a loop; Discord emits
  once via `buildBulkUpdateEmbed`. Side-effects run outside the `setTasks`
  updater so StrictMode's development double-invocation never doubles them.
- `src/components/board/BulkActionBar.tsx` — the toolbar + its menus.
- `src/components/board/TaskCard.tsx` — modifier-aware click handler,
  checkbox badge, `selectionActive` prop that disables drag.
- `src/pages/BoardPage.tsx` — selection state, Shift-range logic, the
  document-level click listener that clears on background tap, and the
  `Esc` keyboard binding.

---

## Board view modes

The `/board` page renders in one of two layouts. A segmented icon
toggle in the page header switches between them; the choice is
persisted per browser at `team-manager.board-view`.

| Mode | Strength |
|---|---|
| **Kanban** (default) | Spatial — see WIP at a glance, drag between columns. |
| **List** | Dense — scan many tasks, sort and inline-edit without leaving the page. |

The same FilterBar (project, assignee, priority, search) drives both
modes; switching the view never resets your filters.

### List view columns

| Column | Visibility | Sortable | Editable |
|---|---|---|---|
| ✓ (mark done) | always | — | yes (checkbox) |
| Title | always | yes | open task detail |
| Project | `md+` (hidden on mobile) | yes | — |
| Status | always | yes | yes (pill popover) |
| Priority | always | yes | yes (pill popover) |
| Assignee | always | yes | yes (avatar popover) |
| Due date | always | yes | yes (presets + custom date) |
| Subtasks | `lg+` (hidden on tablet + mobile) | yes (by % done) | — |

**Default sort** is priority ascending (critical first), then due date
ascending (soonest first, nulls last). Clicking a column header
overrides with a single-column sort; clicking the same header again
flips direction. Aria-sort on the header announces the state.

### Inline editing

Click any editable cell to open a small popover, pick a value, and
the change saves immediately (optimistic UI). The cell briefly flashes
a blue background for ~600 ms via the `cellFlash` keyframe in
`src/index.css` to confirm the write landed. Permissions match the
task-detail page: priority + assignee are PM-only; status + due date
are PM-or-assignee.

### Mark done

Checking the checkbox flips the task to **Done** instantly. The title
gets a left-to-right strikethrough animation (`strikeIn` keyframe,
300 ms), and the whole row holds full opacity for 1 second before
fading to muted (`opacity-50`, 700 ms ease-out). Unchecking flips back
to **To Do**.

### What still works in list mode

- Filters (the shared FilterBar)
- Quick Create (the `C` shortcut, palette action, and `+ New Task` button)
- Global shortcuts (palette, navigation, help)
- Task detail navigation on row click

### What's kanban-only

- Drag-and-drop
- Multi-select + the bulk action bar (Ctrl/Cmd-click is a no-op in list mode)
- Arrow / Enter / 1–4 keyboard shortcuts (they target the kanban's
  visual focus ring, which doesn't apply to a flat list)

---

## Due dates

A small but cross-cutting feature — every surface that talks about a
due date now uses the same vocabulary and the same picker.

### Relative date display

`formatRelativeDueDate(iso)` (`src/lib/date-utils.ts`) is the single
source of truth. It returns a `{ label, tone, overdue, diffDays }`
shape; the `tone` maps to a CSS-variable text color via
`DUE_TONE_CLASS`.

| Date relative to today | Label | Tone | Notes |
|---|---|---|---|
| Past | `Overdue — N day(s)` | critical (red) | Paired with an `AlertTriangle` icon |
| Today | `Today` | today (blue) | |
| Tomorrow | `Tomorrow` | primary | |
| Rest of this calendar week | day name (`Wednesday`) | primary | |
| Anywhere in next calendar week | `Next [day]` (`Next Tuesday`) | primary | |
| Beyond next week | `Jun 15` (locale `month short` + day) | secondary | |
| `null` | _(nothing)_ | — | The card / row renders no chip at all |

The board's task cards, the list view's Due column, the My Tasks
queue, and the task-detail Due field all consume this helper, so
"Wednesday" means the same thing everywhere.

### Seven canonical presets

`DUE_DATE_PRESETS` exports the same set used by every picker:

`Today` · `Tomorrow` · `Next Monday` · `Next Friday` · `In 1 week` ·
`In 2 weeks` · `No date`

"Next Monday" / "Next Friday" are always at least one day in the
future — if today is Monday, "Next Monday" resolves to +7 days.

The presets render as a 2-column grid above a custom date input in a
single shared component, `src/components/shared/DueDatePicker.tsx`.
The Quick Create modal, the bulk action bar's "Set Due Date" menu, the
list view's inline edit cell, and the task-detail Due Date field all
mount the same component — so adding a new preset is one edit in one
file.

### Overdue affordances

Each page that surfaces tasks calls out overdue ones differently,
chosen for the layout's information density:

| Surface | Treatment |
|---|---|
| Board (kanban) | 2px red left border on each overdue card; "Overdue — N days" chip with an `AlertTriangle` icon |
| My Tasks | 5% red background tint behind the row; same chip in the badge row |
| List view | Due cell text rendered in red with the `AlertTriangle` icon |
| Dashboard | The Overdue summary card pulses (subtle red box-shadow, 5s cycle) when its count > 0 |
| Task detail | Due-date button gets a red left border when overdue |

Completed tasks are never read as overdue, even when their stored due
date is in the past — the urgency drops the moment status flips to
**Done**.

### Daily Discord digest

When the user first lands on an authenticated page, `Layout` checks:

1. Is a Discord webhook URL configured?
2. Is the **Task overdue** event toggle enabled in Settings?
3. Are there any overdue tasks right now?
4. Has the digest already been sent this session?
   (sessionStorage flag `team-manager.overdue-summary-sent`)

If all four hold, a single embed fires (`buildOverdueSummaryEmbed`):

```
⚠️ Overdue Tasks Summary
N tasks are overdue
  • [Task Title] — Assigned to [Name] · [N] days overdue
  • … (up to 10 fields; the description count reflects the real total)
```

The flag clears when the tab closes, so opening the app fresh the
next day re-sends. For an actual daily cadence with multiple users you
still want the production backend proxy — see
[Discord integration](#discord-integration).

---

## Activity feed

Every mutation that changes user-visible state pushes a typed
`Activity` entry. The Dashboard surfaces them in a paginated,
filterable feed; the Task Detail page interleaves them with comments
for a focused conversation view.

### Activity types

| Type | When it fires | Icon |
|---|---|---|
| `creation` | A task is created | `Plus` |
| `status_change` | A task moves between columns (records `fromValue` / `toValue`) | `ArrowRight` |
| `assignment` | A task's assignee changes (records `fromMemberId` / `toMemberId`) | `UserPlus` |
| `priority_change` | A task's priority changes (records `fromValue` / `toValue`) | `Flag` |
| `due_date_change` | A task's due date is set, changed, or cleared | `Calendar` |
| `subtask_created` | A subtask is added (records `subtaskTitle`) | `CheckSquare` |
| `subtask_complete` | A subtask is checked off (records `subtaskTitle`) | `CheckSquare` |
| `comment` | Someone posts a comment | `MessageSquare` |
| `task_deleted` | A task is deleted (snapshots the title) | `Trash2` |
| `project_created` | A new project is created | `Plus` |
| `member_added` | A team member joins | `UserPlus` |
| `member_removed` | A team member is removed | `Trash2` |

Workspace-scoped types (`task_deleted`, `project_created`,
`member_*`) have `taskId === null` — they show up on the dashboard
but not on any task detail page. All other types attach to a task.

### Phrase formatting

`src/components/shared/ActivityItem.tsx` composes the verb phrase from
the activity's structured metadata, falling back to the seeded
`content` string when older entries don't carry the new fields.
Examples:

> *Alex* **created** "Fix checkout bug" *in Website Redesign · 2 hours ago*
> *Sam* **moved** "Design landing page" *from To Do to In Progress · 45 minutes ago*
> *Alex* **assigned** "Set up CI/CD" *to Sam · yesterday*
> *Sam* **completed subtask** "Write unit tests" *on "API Migration" · 3 hours ago*

### Dashboard feed

- Shows the 30 most recent activities, with a **Load more** button
  that reveals 30 more each click.
- A filter dropdown above the feed scopes to **All activity**,
  **Status changes**, **Comments**, or **Assignments**. Changing the
  filter resets pagination so each filter has its own 30-item window.
- Each row links to the relevant task (when there is one). Workspace-
  scoped entries render as plain rows.

### Task detail feed

- Shows **every** activity for the current task, no pagination.
- Comments render as large left-bordered cards with the full body and
  any `@mention` highlights.
- System events (status, priority, assignment, subtask, due-date) are
  compact one-line rows between the comment cards — easy to scan
  without drowning the conversation.

### Per-item timestamp toggle

Every relative timestamp (e.g. `2 hours ago`) is clickable. One click
flips it to the absolute form (`May 28, 2026 at 2:34 PM`), another
flips it back. The state is local to that item — clicking one row
doesn't affect any others, and refreshing the page resets everything
to relative.

---

## Discord integration

Settings → **Discord Integration** (PM only) lets you paste a Discord
webhook URL and pick which task events get relayed. The team sees task
updates land in the channel without anyone opening the app.

### Configure

1. In Discord, **Server Settings → Integrations → Webhooks → New
   Webhook**, pick the channel, copy the URL.
2. In Team Manager, paste it into the **Webhook URL** field. The input
   masks the URL by default (it contains a secret token) — click the
   eye icon to reveal.
3. Optionally add a **Channel name** label so future-you remembers
   where this posts (Discord ignores it).
4. Toggle the events you want relayed.
5. Click **Test webhook** to fire a sample embed — a green
   `Webhook connected` card should appear in the channel within a
   second or two.
6. **Save** to persist. Settings live in `localStorage` under
   `team-manager.discord-settings`.

### Events and embed shapes

| Event | Color | Fields |
|---|---|---|
| 📋 Task created | Blue | Project · Priority · Assignee |
| 🔄 Status updated | Purple | From · To · By |
| 👤 Task assigned | Amber | Assigned to · Priority · Due |
| ✅ Task completed | Green | Project · Completed by |
| 💬 New comment | Blue | By · Comment (first 200 chars) |
| ⏰ Overdue (daily summary) | — | _Not wired in this MVP — needs a backend scheduler._ |

All embeds include a `timestamp` so Discord renders the relative time
under the card.

### Where the code lives

- **`src/services/discord.ts`** — types (`DiscordSettings`,
  `DiscordEvent`, `DiscordEmbed`), per-event embed builders, and a
  fire-and-forget `sendDiscordWebhook(url, body)` that swallows errors
  and `console.warn`s them. Callers never block on Discord.
- **Store wiring** — `DataProvider` keeps the latest state slices
  (`projects`, `teamMembers`, `discordSettings`, …) in refs so a stable
  `emitDiscord(event, builder)` callback can read them without
  recreating itself. `createTask`, `updateTask`, and `addComment` call
  `emitDiscord` after their primary state mutations, and emits run
  exactly once even under React StrictMode's double-invoking development
  setters.
- **Settings UI** — `src/components/settings/DiscordSection.tsx`.

### Production: proxy through your backend

Discord webhook URLs are essentially API keys. Shipping them to the
browser means anyone with devtools can copy the URL and spam the channel.
For a real deployment:

1. Stand up an endpoint like `POST /api/discord-relay` on your
   backend that reads the webhook from server config (env var, secret
   manager) and forwards the body to Discord.
2. Change one line in `sendDiscordWebhook` — the `fetch(url, …)` call —
   to hit your proxy with the body shape unchanged. The embed builders
   and emit hooks need no other changes.

Browser-direct posts also have practical limits (CORS works in
practice for Discord, but you don't get rate-limit headers back, and
you can't add per-channel HMAC signing). A proxy fixes both.

---

## Known limitations

These are intentional MVP cutoffs — the spec calls them out as out-of-scope
or the underlying data model would need to change to support them properly:

- **No backend.** All data lives in React state. Reload = back to seeded
  fixtures. The auth user ID, notification preferences, workspace name, and
  board column overrides are the only things that persist (via `localStorage`).
- **`Task.status` is a fixed four-value union**, so adding or removing board
  columns from Settings isn't implemented. Rename and reorder are.
- **Notification preferences gate emission, not display** — preferences
  applied before today's seeded notifications were generated still show those
  notifications in the bell. Future emissions respect the prefs.
- **`@mention` of a removed team member** still renders the raw handle text
  instead of a grayed-out display name.
- **Real password change** isn't implemented — the mock auth model doesn't
  store passwords, just compares against a hardcoded credential table.
- **Project columns aren't customizable per-project** — column config is
  workspace-wide.
- **No real-time collaboration**, no `fetch`-based loading skeletons (because
  there's no network), no file attachments, no Gantt charts. All explicitly
  out of scope per the spec.

---

## Contributing

This started as a personal portfolio MVP. If you'd like to extend it:

1. **Read `docs/product-spec.md` first.** It's the source of truth for what
   every page should do, including the edge-case bullet lists.
2. **Read `docs/design-brief.md`** before touching any UI. Colors, spacing,
   and component patterns are all enumerated.
3. **Run `npm run build` after every change.** TypeScript strict + zero
   warnings is the bar.
4. **Don't introduce new top-level dependencies** without a one-paragraph
   justification — the stack rules in `docs/react-stack.md` exist for a reason.

---

## License

[MIT](./LICENSE) © 2026 Clive Sasaka
