# Team Manager — Design Brief

## Aesthetic Direction

**Industrial-clean.** Think of a well-organized workshop — everything has a place, tools are within reach, nothing is decorative for decoration's sake. The interface should feel efficient, sturdy, and calm. Not playful, not corporate, not trendy. Functional with quiet confidence.

**Reference feel:** Linear meets Notion — dense information, clean lines, no visual noise. Dark mode default with excellent contrast.

---

## Color Palette

**Background layers (dark mode):**
- `--bg-base`: `#0F1117` — deepest background (page body)
- `--bg-surface`: `#161921` — card and panel backgrounds
- `--bg-elevated`: `#1C1F2B` — modals, dropdowns, hover states
- `--bg-input`: `#1A1D28` — input field backgrounds
- `--border-subtle`: `#262A36` — dividers, card borders
- `--border-default`: `#363B4A` — input borders, active dividers

**Text:**
- `--text-primary`: `#E8EAF0` — primary content, headings
- `--text-secondary`: `#8B90A0` — labels, timestamps, secondary info
- `--text-muted`: `#5A5F72` — placeholders, disabled text
- `--text-inverse`: `#0F1117` — text on colored backgrounds

**Priority colors (badges and accents):**
- `--priority-critical`: `#EF4444` — red, used sparingly
- `--priority-high`: `#F59E0B` — amber
- `--priority-medium`: `#3B82F6` — blue
- `--priority-low`: `#6B7280` — gray

**Status colors (board columns, status pills):**
- `--status-todo`: `#6B7280` — gray
- `--status-progress`: `#3B82F6` — blue
- `--status-review`: `#A855F7` — purple
- `--status-done`: `#22C55E` — green

**Interactive elements:**
- `--accent-primary`: `#3B82F6` — primary buttons, active states, links
- `--accent-hover`: `#2563EB` — button hover
- `--accent-focus`: `rgba(59, 130, 246, 0.25)` — focus ring glow
- `--destructive`: `#EF4444` — delete actions
- `--destructive-hover`: `#DC2626` — delete hover

**Project colors (assigned to projects, shown as dots):**
Preset palette of 8 colors for project identification:
`#3B82F6` (blue), `#22C55E` (green), `#F59E0B` (amber), `#EF4444` (red), `#A855F7` (purple), `#EC4899` (pink), `#14B8A6` (teal), `#F97316` (orange)

---

## Typography

**Font stack:**
- Headings: `"IBM Plex Sans", sans-serif` — weight 600 for headings, 500 for subheadings
- Body: `"IBM Plex Sans", sans-serif` — weight 400 for body, 500 for emphasis
- Monospace (code blocks, IDs): `"IBM Plex Mono", monospace` — weight 400

**Scale:**
- Page title: 24px / 600 weight / `--text-primary`
- Section heading: 18px / 600 weight / `--text-primary`
- Card title: 15px / 500 weight / `--text-primary`
- Body text: 14px / 400 weight / `--text-primary`
- Small text (labels, timestamps): 12px / 400 weight / `--text-secondary`
- Badge text: 11px / 600 weight / uppercase / letter-spacing 0.5px

**Line heights:**
- Headings: 1.3
- Body: 1.5
- Small text: 1.4

---

## Spacing System

Base unit: 4px. All spacing is multiples of 4.

- `--space-xs`: 4px — inside badges, between icon and text
- `--space-sm`: 8px — between related elements (label and input)
- `--space-md`: 12px — padding inside cards, between list items
- `--space-lg`: 16px — between sections within a card
- `--space-xl`: 24px — between cards, between page sections
- `--space-2xl`: 32px — page padding, major section gaps
- `--space-3xl`: 48px — between major page areas

---

## Layout

**Sidebar:**
- Width: 240px, fixed on desktop
- Background: `--bg-surface` with a right border of `--border-subtle`
- Collapses to 64px icon-only mode on screens below 1024px
- On mobile (below 768px): hidden by default, slides in as an overlay from the left with a hamburger trigger
- Active nav item: `--bg-elevated` background with a 2px left border in `--accent-primary`
- Nav items: 14px, `--text-secondary`, hover → `--text-primary`

**Top bar:**
- Height: 56px, fixed
- Background: `--bg-surface` with a bottom border of `--border-subtle`
- Contains: workspace name (left), search + notifications + avatar (right)

**Content area:**
- Max width: 1200px, centered with auto margins
- Padding: 32px on desktop, 16px on mobile
- Background: `--bg-base`

**Responsive breakpoints:**
- Mobile: < 768px — single column, sidebar as overlay, cards stack vertically
- Tablet: 768px–1024px — sidebar collapsed to icons, 2-column grids where applicable
- Desktop: > 1024px — full sidebar, multi-column layouts

---

## Components

**Cards (task cards, project cards, team member cards):**
- Background: `--bg-surface`
- Border: 1px solid `--border-subtle`
- Border-radius: 8px
- Padding: 12px–16px
- Hover: border color transitions to `--border-default`, subtle box-shadow `0 2px 8px rgba(0,0,0,0.2)`
- No heavy shadows at rest. Clean and flat.

**Buttons:**
- Primary: `--accent-primary` background, `--text-inverse` text, 8px 16px padding, border-radius 6px. Hover: `--accent-hover`. Focus: `--accent-focus` ring.
- Secondary: transparent background, 1px border `--border-default`, `--text-primary` text. Hover: `--bg-elevated` background.
- Destructive: `--destructive` background, white text. Used only for delete confirmations.
- Ghost: no background, no border, `--text-secondary` text. Hover: `--bg-elevated`. Used for icon buttons.
- All buttons: 14px font, 500 weight, 32px min-height.

**Badges / Pills:**
- Priority badges: filled background with matching priority color at 15% opacity, text in the full priority color. Border-radius: 4px. Padding: 2px 8px.
- Status pills: same pattern with status colors.
- Tag pills: colored background at 15% opacity, text in full tag color. Border-radius: 12px (fully rounded). Padding: 2px 10px.

**Inputs:**
- Background: `--bg-input`
- Border: 1px solid `--border-subtle`
- Border-radius: 6px
- Padding: 8px 12px
- Font: 14px
- Focus: border changes to `--accent-primary`, focus ring glow `--accent-focus`
- Placeholder text: `--text-muted`

**Dropdowns:**
- Trigger looks like an input or a ghost button depending on context
- Dropdown panel: `--bg-elevated`, border `--border-default`, border-radius 8px, shadow `0 4px 16px rgba(0,0,0,0.3)`
- Items: 14px, `--text-primary`, hover `--bg-surface`, 8px 12px padding
- Selected item: `--accent-primary` text with a check icon

**Modals:**
- Overlay: `rgba(0, 0, 0, 0.6)` backdrop
- Modal: `--bg-surface`, border-radius 12px, max-width 480px, padding 24px
- Close button: X icon in top-right corner
- Destructive modals: red-tinted header area

**Avatars:**
- Circular, 32px default size (28px in compact views, 40px in detail views)
- If no image: show initials on a deterministic color background (hash the user's name to pick from the project color palette)
- Stacked avatars: overlap by 8px, 2px white border between them

**Toast notifications:**
- Position: bottom-right, 16px from edges
- Background: `--bg-elevated`, border-left with accent color (green for success, red for error, blue for info)
- Auto-dismiss after 4 seconds
- Compact: icon + single line of text

---

## Kanban Board Specific

**Columns:**
- Background: transparent (the cards provide the visual structure)
- Column header: status name in 12px uppercase `--text-secondary`, card count next to it
- Column width: flexible, min 280px, evenly distributed
- Horizontal scroll on mobile if columns exceed viewport

**Drag and drop:**
- Card being dragged: slightly raised shadow `0 8px 24px rgba(0,0,0,0.3)`, rotated 2deg, opacity 0.9
- Drop target column: highlighted with a dashed border in `--accent-primary` at 30% opacity
- Smooth 200ms transition on card insertion

---

## Dashboard Specific

**Summary cards:**
- 4 across on desktop, 2×2 grid on tablet, stacked on mobile
- Each card: icon (24px, `--text-secondary`), large number (28px, 600 weight, `--text-primary`), label below (12px, `--text-secondary`)
- Overdue card: number in `--priority-critical` when count > 0

**Needs Attention list:**
- Each item: left border 3px colored by type (red for overdue, orange for unassigned, gray for stale, blue for questions)
- Compact layout: task title, project, assignee, reason — all on one or two lines

**Activity feed:**
- Simple list with timestamp on the right
- Avatar (24px) + "Name action description" pattern
- Alternating subtle background: every other item gets `--bg-surface`

---

## Transitions & Motion

- Page transitions: none (instant route changes)
- Card hover: 150ms ease border-color and box-shadow
- Dropdown open/close: 150ms ease opacity + translateY(-4px to 0)
- Modal: 200ms ease opacity + scale(0.95 to 1)
- Toast: slide in from right 200ms, slide out 150ms
- Drag: 200ms spring-like easing for card insertion
- Sidebar collapse: 200ms ease width transition
- Status pill color change: 200ms ease background-color

Keep animations functional, not decorative. No bounce effects, no elastic easing, no parallax. Everything should feel snappy and responsive.

---

## Empty States

Every list and section needs an empty state. Pattern:
- Centered in the available space
- An icon (from Lucide) at 48px in `--text-muted`
- A heading in `--text-secondary` at 16px: descriptive, not cute
- A subtext in `--text-muted` at 14px: tells the user what to do next
- A CTA button if the user can take action (e.g., "Create a project")

Examples:
- No projects: FolderOpen icon, "No projects yet", "Create your first project to start organizing work."
- No tasks on board: LayoutGrid icon, "No tasks on the board", "Tasks you create in your projects will appear here."
- No notifications: Bell icon, "All caught up", "You'll see notifications here when there's something to know."

---

## Accessibility

- All interactive elements have visible focus states (2px ring in `--accent-focus`)
- Color is never the only way to convey information (priority has text labels AND colors)
- Contrast ratios: `--text-primary` on `--bg-base` must be at least 7:1, `--text-secondary` on `--bg-base` must be at least 4.5:1
- Keyboard navigation: Tab through all interactive elements, Enter/Space to activate, Escape to close modals/dropdowns
- ARIA labels on icon-only buttons
- Screen reader text for status badges and priority indicators

---

## Iconography

Use Lucide icons throughout. 20px default size, 16px in compact contexts, 24px for empty states and dashboard cards.

Key icons:
- Dashboard: `LayoutDashboard`
- Board: `Columns3`
- My Tasks: `CheckSquare`
- Projects: `FolderOpen`
- Team: `Users`
- Settings: `Settings`
- Search: `Search`
- Notifications: `Bell`
- Priority Critical: `AlertTriangle`
- Priority High: `ArrowUp`
- Priority Medium: `Minus`
- Priority Low: `ArrowDown`
- Add: `Plus`
- Delete: `Trash2`
- Edit: `Pencil`
- Calendar: `Calendar`
- Comment: `MessageSquare`
- Drag handle: `GripVertical`
