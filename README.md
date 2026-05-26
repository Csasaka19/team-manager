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
- **Global search** (`Cmd`/`Ctrl` + `K`) with debounced grouped results across
  tasks and projects, full keyboard navigation.
- **In-app notifications** with a bell + badge in the top bar, auto-emitted on
  assignment / comment / @mention / status change, with per-user preferences
  that actually gate emission.
- **Persisted workspace settings** — workspace name, column rename, and column
  reorder all live in `localStorage` and survive a reload.
- **Mobile-first.** Works at 375px viewport without horizontal scroll. 44px
  touch targets in the top bar.
- **Industrial-clean dark theme**, all colors via CSS variables — no
  hardcoded palette values in components.

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
| Toasts | `sonner` | Dark-themed, bottom-right, auto-dismiss |
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
│   │                           #   ActivityCommentFeed, CreateTaskModal
│   ├── projects/               # ProjectCard, ProjectFormModal
│   ├── team/                   # TeamMemberCard, InviteMemberModal
│   ├── settings/               # WorkspaceSection, TagsSection,
│   │                           #   NotificationsSection, AccountSection
│   ├── search/                 # SearchModal
│   └── notifications/          # NotificationBell
│
├── data/
│   ├── types.ts                # Every domain type — Task, Project, Subtask, etc.
│   ├── mock-data.ts            # Seeded fixtures anchored to 2026-05-22
│   ├── store.ts                # DataProvider — single source of truth
│   └── auth.ts                 # AuthProvider — login, logout, role checks
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
| Board | `/board` | All | ✅ kanban with DnD, filters, `?project=` deep links, PM-only `+ New Task` |
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

No theme toggle — the app is dark-only by design (see the design brief).

---

## Accessibility

- All interactive elements have visible focus rings (`focus-visible:ring-2 ring-[var(--accent-focus)]`).
- Color is never the sole information channel — priority and status both have
  text labels and colors.
- `--text-primary` on `--bg-base` exceeds 7:1 contrast; `--text-secondary`
  exceeds 4.5:1.
- Keyboard navigation: Tab through every interactive element; Enter / Space
  to activate; Escape to close modals, dropdowns, and the search palette;
  arrow keys to navigate the search and `@mention` lists.
- ARIA labels on every icon-only button; `aria-expanded` on disclosure
  triggers; `aria-modal` and `role="dialog"` on every modal.

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
