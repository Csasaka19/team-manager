# Team Manager — Product Specification

> A web application for managing projects, tasks, subtasks, and team members. Project managers get strategic oversight of all work. Team members get a focused personal queue. Everyone gets clarity on priorities, progress, and who's doing what.

---

## Product Overview

**What it does:** A project and task management tool for small-to-medium teams (2–20 people). It organizes work into projects, breaks projects into tasks, breaks tasks into subtasks, assigns people, tracks status, and surfaces what needs attention.

**Who uses it:**
- **Project Managers (PMs)** — create projects, assign tasks, set priorities, track progress across the team, unblock work.
- **Team Members** — view their assigned tasks, update status, check off subtasks, leave comments, see what teammates are working on.

**Core problem:** Teams lose track of what's been assigned, what's in progress, what's blocked, and what's done. PMs spend too much time chasing status updates instead of getting them at a glance.

---

## User Roles & Permissions

| Role | Can do |
|------|--------|
| **PM** | Everything: create/edit/delete projects, tasks, subtasks. Assign and reassign team members. Change priorities. View all projects and all team members' work. Manage workspace settings. Invite/remove team members. |
| **Member** | View all projects they're assigned to. Update status on tasks assigned to them. Create and check off subtasks on their tasks. Leave comments. View teammates' tasks (read-only). Cannot delete projects, cannot change task assignments (only PM can). |

---

## Features by Page

### Page 1: Dashboard (PM Home)

**Route:** `/dashboard`
**Who sees it:** PM (this is the PM's default landing page after login)

**What it shows:**

**Summary Cards (top row, 4 cards):**
- Total open tasks (all projects combined, statuses: to-do + in-progress + in-review)
- Overdue tasks (due date has passed, not in "done" status) — red accent if > 0
- Due this week (due date falls within current Mon–Sun)
- Completed this week (moved to "done" status within current Mon–Sun)

**Needs Attention Section (below cards):**
A list of items requiring PM action, sorted by urgency:
- Overdue tasks — task title, assignee, project, how many days overdue
- Unassigned tasks with high or critical priority — task title, project, created date
- Stale tasks — tasks that haven't changed status in more than 5 days — task title, assignee, current status, days since last update
- Recent comments with questions — comments ending in "?" posted in the last 48 hours — task title, commenter, comment preview

Each item in "Needs Attention" is clickable and navigates to the task detail page.

**Weekly Activity Feed (bottom section):**
A chronological list of the last 20 activities across all projects:
- "[Name] completed [Task Title] in [Project]"
- "[Name] moved [Task Title] to In Review"
- "[Name] commented on [Task Title]"
- "[Name] created [Task Title] in [Project]"
- "New task [Task Title] assigned to [Name]"

Each activity shows a timestamp (relative: "2 hours ago", "yesterday"). Clicking an activity navigates to the relevant task.

**Edge cases:**
- No projects exist yet — show an empty state with a "Create your first project" CTA button.
- All tasks are done — show a congratulatory message in the Needs Attention section: "Nothing needs your attention. Nice work."
- A task has no assignee and no due date — it still appears in "Total open tasks" but not in "Overdue" or "Due this week."
- PM has view of ALL projects, not just ones they created.

---

### Page 2: Board View (Kanban)

**Route:** `/board`
**Who sees it:** PM and Members

**What it shows:**

A drag-and-drop kanban board. Default columns:
1. **To Do** — task created but work hasn't started
2. **In Progress** — someone is actively working on it
3. **In Review** — work is done, awaiting review or approval
4. **Done** — complete

**Board controls (top bar):**
- Project filter dropdown — "All Projects" (default) or select a specific project
- Assignee filter — "Everyone" (default) or select a specific team member
- Priority filter — "All Priorities" (default) or select Critical / High / Medium / Low
- Search box — filters cards by task title (live filter as you type)

**Task Cards on the board:**
Each card shows:
- Task title (truncated to 2 lines max)
- Assignee avatar (circular, with initials if no image) — or "Unassigned" badge
- Priority badge: Critical (red), High (orange), Medium (blue), Low (gray)
- Due date — shown in relative format ("Tomorrow", "May 28", "Overdue" in red)
- Subtask progress — e.g., "3/5" with a small progress bar
- Project color dot — each project gets an assigned color, shown as a small circle on the card

**Drag and drop:**
- PM can drag any card between columns → updates the task status
- Member can only drag cards assigned to them
- Dragging triggers an optimistic UI update (card moves immediately, save happens in background)
- If save fails, card snaps back to original column with a toast error

**Column behavior:**
- Each column shows a count of cards in parentheses: "In Progress (7)"
- The "Done" column auto-collapses cards older than 7 days (show a "+ 12 older" toggle)
- Cards within a column are sorted by: priority (critical first) then due date (soonest first)

**Edge cases:**
- No tasks exist — show empty board with "Create a task to get started" in the To Do column.
- Over 50 cards in one column — paginate with "Show more" at the bottom (load 20 at a time).
- Filters result in no cards — show "No tasks match your filters" with a "Clear filters" link.
- Member drags a card not assigned to them — nothing happens (drag disabled visually for those cards for Members).
- Two people move the same card simultaneously — last write wins, refresh shows current state.

---

### Page 3: My Tasks (Member Home)

**Route:** `/my-tasks`
**Who sees it:** Members (this is the Member's default landing page after login)

**What it shows:**

A personal task list for the logged-in user. Three sections:

**Section 1: Due Today**
Tasks with a due date of today. Each task shows:
- Task title
- Project name (as a subtle label)
- Priority badge
- Subtask progress
- Checkbox to mark as done (marks the task itself as "Done" status)

If no tasks are due today: "Nothing due today" with a checkmark icon.

**Section 2: This Week**
Tasks due within the current Mon–Sun that are NOT due today. Same card format.

If no tasks due this week: "Clear week ahead."

**Section 3: Upcoming**
Tasks due after this week, or tasks with no due date. Sorted by due date (soonest first), then tasks with no due date at the bottom.

**Inline subtask expansion:**
Clicking a task card expands it in-place to show its subtasks as a checklist. Checking off a subtask updates the progress count without navigating away. Clicking the task title navigates to the full task detail.

**Completed toggle:**
A "Show completed" toggle at the top-right shows tasks marked "Done" in the last 7 days, with a strikethrough style. Off by default.

**Edge cases:**
- Member has no tasks assigned — show "No tasks assigned to you yet. Check with your PM or browse the board."
- A task has no due date — it appears in "Upcoming" at the bottom.
- A task is overdue — it appears at the very top of "Due Today" section with a red "Overdue — X days" label, regardless of its original due date.
- Subtask belongs to a task assigned to someone else but subtask is assigned to this member — the parent task still shows in their list with a note "(subtask assigned to you)".

---

### Page 4: Task Detail

**Route:** `/tasks/:taskId`
**Who sees it:** PM and Members

**What it shows:**

**Header section:**
- Task title — editable inline (click to edit, press Enter or blur to save). PM can always edit. Member can edit only if assigned to them.
- Status dropdown — To Do / In Progress / In Review / Done. PM can change any task. Member can change tasks assigned to them.
- Priority dropdown — Critical / High / Medium / Low. PM only.
- Assignee selector — avatar + name dropdown of all team members. PM only. Shows "Unassigned" if no one is assigned.
- Due date picker — calendar popup. PM can set on any task. Member can set on tasks assigned to them.
- Project label — shows which project this task belongs to (non-editable here, set at creation).
- Created/updated timestamps — "Created May 20 by [Name] · Updated 2 hours ago"

**Description section:**
Rich text area supporting basic formatting: bold, italic, bullet lists, numbered lists, code blocks, links. Editable by PM always, by Member if assigned. Auto-saves on blur with a "Saved" indicator.

**Subtasks section:**
A checklist of subtasks. Each subtask has:
- Checkbox — marks it done/undone
- Title — editable inline
- Assignee — avatar dropdown (optional, can be different from parent task assignee)
- Delete button (X icon) — PM always, Member if they created the subtask

"Add subtask" button at the bottom — PM can always add. Member can add to tasks assigned to them.
Subtasks can be reordered by drag-and-drop.
Progress shown as "3 of 5 subtasks complete" with a progress bar.

**Tags section:**
Horizontal list of tag pills. PM can add/remove tags from a predefined list (managed in Settings). Members can view but not edit. Tags are colored (each tag has a color assigned in Settings).

**Activity & Comments section (bottom):**
A combined, chronological feed showing:
- Status changes — "Alex moved this to In Review · 3 hours ago"
- Assignment changes — "Jordan assigned this to Sam · yesterday"
- Comments — avatar, name, timestamp, comment text. Comments support @mentions (type "@" to see team member dropdown). Mentioned members receive a notification.
- Subtask completions — "Casey completed subtask 'Write unit tests' · 1 hour ago"

Comment input at the bottom — all users can comment on any task.

**Delete task:**
A "Delete" button (trash icon) in the header area. PM only. Shows a confirmation modal: "Delete '[Task Title]'? This cannot be undone." Deleting a task also deletes all its subtasks and comments.

**Edge cases:**
- Task doesn't exist (bad URL) — show a 404 page: "Task not found. It may have been deleted."
- User is a Member viewing a task not assigned to them — everything is read-only except comments.
- Description is empty — show placeholder text: "Add a description..." clickable to start editing.
- Subtask list is empty — show "No subtasks yet. Break this task into smaller pieces."
- Long task title (100+ chars) — truncate with ellipsis in the header, show full title in a tooltip on hover.
- @mention a user who has been removed from the team — show the name grayed out, no notification sent.

---

### Page 5: Projects

**Route:** `/projects`
**Who sees it:** PM and Members

**What it shows:**

A grid or list of all projects. Each project card shows:
- Project name
- Project color dot (used on board cards to identify which project a task belongs to)
- Description — first 2 lines, truncated
- Task stats: "12 open · 3 overdue · 28 done"
- Progress bar — done / (done + open) as a percentage
- Team members — up to 4 stacked avatars, "+3 more" if more than 4
- Last activity — "Updated 2 hours ago"

**PM actions:**
- "New Project" button — opens a creation form: project name (required), description (optional), color (pick from 8 preset colors), assign team members (multi-select).
- Click project card → shows the Board View filtered to that project, with a project settings panel accessible via a gear icon.

**Project Settings (PM only, accessed from project detail):**
- Edit project name and description
- Change project color
- Manage project team members (add/remove)
- Archive project — moves it to an "Archived" tab, hides it from the main view and all filters. Archived projects are read-only.
- Delete project — confirmation required: "Delete '[Project Name]' and all its tasks? This cannot be undone."

**Member actions:**
- View all projects they are assigned to
- Click project card → board view filtered to that project (read-only project settings)

**Edge cases:**
- No projects exist — PM sees: "Create your first project to get started" with a button. Member sees: "No projects yet. Your PM will set them up."
- Project has no tasks — show "0 open · 0 done" and an empty progress bar.
- Project has been archived — it appears in a separate "Archived" tab, grayed out. Clicking it opens a read-only view.
- Member tries to access a project they're not assigned to — they can still see it in the list (read-only) but the board only shows tasks assigned to them.

---

### Page 6: Team

**Route:** `/team`
**Who sees it:** PM and Members

**What it shows:**

A list of all team members. Each member row/card shows:
- Avatar and name
- Role badge — "PM" or "Member"
- Current task count — number of tasks in to-do + in-progress + in-review statuses
- Completed this week — number of tasks moved to "Done" in the current Mon–Sun
- Current assignments — compact list of up to 3 task titles with status pills, "+ X more" if more

**Expandable detail (click a team member):**
- Full task list — all tasks assigned to them, grouped by status
- Workload chart — a horizontal stacked bar showing tasks by status (to-do, in-progress, in-review, done)
- Velocity — a small sparkline or bar chart showing tasks completed per week for the last 4 weeks

**PM actions from this page:**
- Click a task in someone's list → navigate to that task detail
- "Invite Member" button — enter email, select role (PM or Member). Sends an invite (mock for MVP — just adds them to the workspace).
- Remove member — appears as a button in the expanded view. Confirmation: "Remove [Name] from the workspace? Their tasks will become unassigned."

**Edge cases:**
- Team has only one person (the PM) — show the PM's own card plus a prompt: "Invite your team to get started."
- Member with zero tasks — show "No tasks assigned" in their row.
- Removing a member who has in-progress tasks — all their tasks become unassigned. Show a warning in the confirmation: "[Name] has 5 active tasks that will become unassigned."
- Velocity chart has no data (new member) — show "No history yet" placeholder.

---

### Page 7: Settings

**Route:** `/settings`
**Who sees it:** PM only (Members see a simplified version with only their own notification preferences)

**What it shows:**

**Workspace Settings (PM only):**
- Workspace name — editable text field
- Default board columns — manage the status columns used across all projects. Default: To Do, In Progress, In Review, Done. PM can rename, reorder, add (max 8), or delete columns (must have at least 2). Deleting a column moves all tasks in it to the first column.

**Tag Management (PM only):**
- List of tags with name and color. PM can create, rename, recolor, and delete tags. Deleting a tag removes it from all tasks that have it.

**Notification Preferences (PM and Members):**
- Toggle notifications for: task assigned to me, task I'm watching gets a comment, task I'm watching changes status, task due tomorrow (daily reminder), task overdue (daily reminder), @mentioned in a comment.
- Notification delivery: in-app only for MVP (no email).

**Account (PM and Members):**
- Edit own name and avatar
- Change password
- Log out

**Edge cases:**
- PM deletes a board column that has 30 tasks — all 30 move to the first column. Show a warning: "This column has 30 tasks. They will be moved to '[First Column Name]'."
- PM creates more than 8 columns — button disabled with tooltip: "Maximum 8 columns."
- PM renames a column — the rename is reflected everywhere (board, task detail dropdowns, filters).

---

## Pages & Routes Summary

| Page | Route | Default for | Primary user |
|------|-------|-------------|-------------|
| Login | `/login` | Unauthenticated users | Everyone |
| Dashboard | `/dashboard` | PM after login | PM |
| Board | `/board` | — | PM and Members |
| My Tasks | `/my-tasks` | Member after login | Members |
| Task Detail | `/tasks/:taskId` | — | PM and Members |
| Projects | `/projects` | — | PM and Members |
| Team | `/team` | — | PM and Members |
| Settings | `/settings` | — | PM (full), Members (limited) |
| 404 | `*` | Bad URLs | Everyone |

---

## Navigation

**Sidebar navigation (persistent on all authenticated pages):**
- Dashboard (PM only — hidden for Members)
- Board
- My Tasks
- Projects
- Team
- Settings (gear icon at bottom)

**Top bar:**
- Workspace name (left)
- Search icon — global search across task titles and descriptions
- Notification bell — shows unread notification count, dropdown with recent notifications
- User avatar — dropdown with "Settings" and "Log out"

---

## Data Model

### Project
```
id: string (UUID)
name: string (required, max 100 chars)
description: string (optional, max 500 chars)
color: string (hex, chosen from preset palette)
memberIds: string[] (references to TeamMember)
archived: boolean (default false)
createdAt: datetime
updatedAt: datetime
createdBy: string (reference to TeamMember)
```

### Task
```
id: string (UUID)
title: string (required, max 200 chars)
description: string (optional, rich text, max 5000 chars)
projectId: string (reference to Project)
assigneeId: string | null (reference to TeamMember)
priority: "critical" | "high" | "medium" | "low" (default "medium")
status: string (matches one of the board columns, default first column)
dueDate: date | null
tags: string[] (references to Tag ids)
subtasks: Subtask[]
createdAt: datetime
updatedAt: datetime
createdBy: string (reference to TeamMember)
```

### Subtask
```
id: string (UUID)
taskId: string (reference to Task)
title: string (required, max 200 chars)
assigneeId: string | null
done: boolean (default false)
sortOrder: number
createdAt: datetime
completedAt: datetime | null
```

### TeamMember
```
id: string (UUID)
name: string (required, max 100 chars)
email: string (required, unique)
role: "pm" | "member"
avatarUrl: string | null
createdAt: datetime
```

### Activity
```
id: string (UUID)
taskId: string (reference to Task)
actorId: string (reference to TeamMember)
type: "status_change" | "assignment" | "comment" | "creation" | "subtask_complete" | "priority_change"
content: string (comment text, or description of change)
mentions: string[] (TeamMember ids mentioned in comments)
createdAt: datetime
```

### Tag
```
id: string (UUID)
name: string (required, max 30 chars)
color: string (hex)
```

### Notification
```
id: string (UUID)
recipientId: string (reference to TeamMember)
type: "assigned" | "comment" | "mention" | "status_change" | "due_tomorrow" | "overdue"
taskId: string (reference to Task)
actorId: string | null (reference to TeamMember, null for system notifications)
read: boolean (default false)
createdAt: datetime
```

---

## Authentication

**Login page (`/login`):**
- Email and password fields
- "Log in" button
- For MVP: use mock authentication. Seed the database with 2 accounts:
  - PM: `pm@team.com` / password: `demo1234`
  - Member: `member@team.com` / password: `demo1234`
- After login, redirect PM to `/dashboard`, redirect Member to `/my-tasks`

**Session:**
- Store auth state in React context
- Persist across page refreshes using localStorage
- No token expiry for MVP

**Protected routes:**
- All routes except `/login` require authentication
- Unauthenticated users are redirected to `/login`
- PM-only routes (Dashboard, full Settings) redirect Members to `/my-tasks` with a toast: "You don't have access to that page."

---

## Global Search

**Triggered by:** clicking the search icon in the top bar, or pressing `Cmd+K` / `Ctrl+K`

**Behavior:** Opens a modal with a search input. As the user types (debounced 300ms), results appear below grouped by type:
- **Tasks** — matches on title and description. Shows: task title, project name, assignee, status.
- **Projects** — matches on name and description. Shows: project name, task count.

Clicking a result navigates to the task detail or project board view.

Max 10 results shown. "No results for '[query]'" if nothing matches.

---

## Notifications (In-App)

**Bell icon in top bar:**
- Shows a red badge with unread count (max "99+")
- Click opens a dropdown panel with the last 20 notifications, newest first
- Each notification shows: icon by type, description text, relative timestamp, unread dot
- Click a notification → navigate to the relevant task and mark as read
- "Mark all as read" link at the top of the panel

**Notification triggers:**
- Task assigned to you → "[PM Name] assigned you to '[Task Title]'"
- Comment on a task you're assigned to → "[Name] commented on '[Task Title]'"
- @mentioned → "[Name] mentioned you in '[Task Title]'"
- Task status changed (for tasks you're assigned to) → "'[Task Title]' moved to In Review by [Name]"
- Due tomorrow → "'[Task Title]' is due tomorrow" (generated at midnight)
- Overdue → "'[Task Title]' is overdue by [X] days" (generated daily at midnight)

---

## Out of Scope (MVP)

- Real email notifications (in-app only)
- File attachments on tasks or comments
- Time tracking beyond simple display
- Recurring tasks
- Gantt charts or timeline views
- Integrations with external tools (Slack, GitHub, etc.)
- Multiple workspaces
- Real user authentication (OAuth, SSO) — mock auth only
- Mobile native app (responsive web only)
- Real-time collaboration (WebSocket) — manual refresh or polling
- Task dependencies (blocking/blocked-by)
- Custom fields on tasks
