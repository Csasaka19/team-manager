# React Stack

How React apps are built across every Forge project. Read this before scaffolding pages, adding routes, or reaching for a state library. Every `/build-feature` command runs against these defaults — deviating means documenting why in the project's `CLAUDE.md`.

## Stack

| Pick | Why |
|---|---|
| **Vite** | Fast HMR, native ESM, no webpack config. Not CRA (dead). Not Next.js — use Next only when you genuinely need SSR/RSC/edge routes; an SPA on Vite is simpler. |
| **React 18+ with TypeScript (strict)** | Concurrent features, Suspense, automatic batching. TS strict catches the classes of bugs that eat afternoons. |
| **Tailwind CSS v3+** | Utility-first, design tokens via theme config. Pair with `tailwind-merge` + `clsx` (the `cn()` helper) for conditional classes. |
| **shadcn/ui** | Copy-in component primitives — you own the source, not a dependency contract. Not MUI, not Chakra, not Mantine — those lock you into their theme system and add hundreds of KB. |
| **React Router v6** | File-routed parity with Next on the client side. `createBrowserRouter` for new projects; `<BrowserRouter>` is fine for MVPs. |

Anything else is a deliberate choice that goes into `docs/decisions.md` with reasoning.

## Project Structure

```
src/
├── main.tsx              # Entry point — renders App
├── App.tsx               # Router setup — ALL routes defined here
├── pages/                # One file per route (e.g., DashboardPage.tsx)
├── components/           # Shared components
│   ├── ui/               # shadcn/ui primitives (don't edit these)
│   ├── layout/           # Header, Footer, Sidebar, PageContainer
│   └── [feature]/        # Feature-specific components
├── hooks/                # Custom hooks
├── lib/                  # Utilities (cn(), api client, constants)
├── data/                 # Mock data files and TypeScript types
├── types/                # Shared type definitions
└── styles/
    └── globals.css       # Tailwind directives + CSS variables
```

Rules that prevent drift:

- **`pages/`** holds one file per route. Filename matches the route concept — `DashboardPage.tsx`, not `Dashboard.tsx`. The suffix makes grep work.
- **`components/ui/`** is shadcn output. Don't hand-edit; if you need a variant, extend it from a feature folder or wrap it. Re-running `npx shadcn add` should be safe.
- **`components/[feature]/`** is where most components actually live. Group by feature, not by type (`components/buttons/` is a smell).
- **`lib/`** is the catch-all for non-React utilities — `cn()`, an `apiClient`, constants. If something is React-aware (uses hooks), it belongs in `hooks/`.
- **`types/`** holds shared shapes. Component-local types stay in the component file.

## Component Patterns

Functional components only. No class components. No `React.FC` — TypeScript infers return type from JSX.

Named exports for shared components, default exports for pages. The default-export-for-pages rule pairs with React Router's lazy loading — `lazy(() => import('./pages/DashboardPage'))` expects a default export.

Define props interface above the component, not inline:

```tsx
interface TaskCardProps {
  task: Task
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

export function TaskCard({ task, onComplete, onDelete }: TaskCardProps) {
  // ...
}
```

Destructure props in the signature, not in the body. `function Foo(props: Props) { const { x } = props }` is a smell — costs a line for nothing.

**Every component handles four states**: default (happy path), loading (data not ready), empty (data is ready but the list is empty), error (something failed). A list view that only shows the happy path is incomplete. Add the empty state before declaring a component done — that's usually what users actually see on first visit.

```tsx
if (loading) return <Spinner />
if (error) return <ErrorState message={error} onRetry={refetch} />
if (tasks.length === 0) return <EmptyState title="No tasks yet" />
return <TaskList tasks={tasks} />
```

## State Management Rules

Pick the smallest tool that fits. In priority order:

1. **Local state (`useState`)** — anything used by one component or a tight tree.
2. **URL state (`useSearchParams`)** — anything that should survive refresh and be shareable via link. Filter selections, sort order, pagination, active tab. The URL is free persistence.
3. **Lifted state + props** — when two siblings need the same value, lift to the nearest common parent. Most "we need a state library" pressure comes from skipping this step.
4. **Context (`createContext` + `useContext`)** — only for genuinely global state: theme, auth, locale, current-user. **Max 3 contexts per app.** Beyond that, you're using Context as a state manager — it isn't one.
5. **`useReducer` for complex local state** — when one state variable has 4+ updater functions, switch to a reducer before reaching for a library.

**No Redux, no Zustand, no Jotai for MVP.** Add a library only after you've hit a real wall with Context + useReducer and can explain in one paragraph what the library buys you. Most apps ship without one.

## Data Fetching

Use `useEffect` + `fetch` for MVP. No TanStack Query until the app has 5+ API endpoints or you need real caching semantics. Premature TanStack adds a learning gradient for solo contributors.

Always handle loading, error, and empty:

```tsx
const [data, setData] = useState<Task[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  let cancelled = false
  fetchTasks()
    .then((tasks) => { if (!cancelled) { setData(tasks); setLoading(false) } })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false) } })
  return () => { cancelled = true }
}, [])
```

The `cancelled` flag prevents the "set state on unmounted component" warning when the user navigates away mid-request.

For mock data (before the backend exists), create files in `src/data/`:

```tsx
// src/data/tasks.ts
export const mockTasks: Task[] = [
  { id: '1', text: 'Review PRs', completed: false, createdAt: '2026-05-20' },
  // ... 5-10 realistic items
]
```

Make the data realistic, not `'foo'` / `'bar'`. Real-feeling fixtures expose UI problems (long strings overflow, empty fields render blank) earlier.

Simulate API latency in development so loading states actually show in dev:

```tsx
async function fetchTasks(): Promise<Task[]> {
  await new Promise((r) => setTimeout(r, 800))
  return mockTasks
}
```

When you wire a real backend, replace the body of `fetchTasks` — the call site doesn't change.

## Routing

All routes defined in `App.tsx`, in one `<Routes>` tree:

```tsx
<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<HomePage />} />
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="tasks/:id" element={<TaskDetailPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Routes>
```

Rules:

- **One route table.** Don't split routes across feature files; one source of truth makes the app's surface area immediately legible.
- **Always include `path="*"`** for a 404. Otherwise a bad URL renders blank with no error.
- **Layout routes use `<Outlet />`** for child route content. Header, footer, sidebar live in `Layout`; pages render through `<Outlet />`.
- **Internal navigation uses `<Link>`**, never `<a href>` — `<a>` triggers a full page reload, kills client-side state, and breaks the SPA contract.
- **Programmatic navigation uses `useNavigate()`**, not `window.location.href`.

For lazy-loaded routes:

```tsx
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
// wrap routes in <Suspense fallback={<PageSpinner />}>
```

Lazy-load routes once the bundle exceeds ~200 KB gzipped; not earlier.

## Styling Rules

Mobile-first. Write base classes for a 375px viewport, then add `sm:` / `md:` / `lg:` overrides as the viewport widens. Reversing — desktop-first with `max-md:` overrides — produces mobile bugs nobody catches until production.

Use the `cn()` utility for conditional classes:

```tsx
import { cn } from '@/lib/utils'

<div className={cn('p-4 rounded-lg', isActive && 'bg-primary text-white')} />
```

`cn` is the tailwind-merge + clsx combo (`lib/utils.ts` from shadcn init). It resolves conflicts: `cn('p-4', condition && 'p-6')` correctly drops `p-4` when `condition` is true. Plain `clsx` doesn't, and you end up with both classes in the DOM.

**Never use inline styles. Never use CSS modules.** Tailwind only. The single exception is CSS variables for runtime-dynamic values that can't be precomputed — a brand color picked at runtime, a chart bar width:

```tsx
<div style={{ '--bar-width': `${pct}%` } as React.CSSProperties} className="w-[var(--bar-width)]" />
```

Static styling that's known at build time always belongs in a utility class.

## TypeScript Rules

`strict: true` in `tsconfig.json`. Non-negotiable. Also enable `noUncheckedIndexedAccess` — saves you from the class of bugs where `array[i]` is typed as `T` when it could be `undefined`.

**No `any`.** Use `unknown` and narrow with type guards:

```tsx
function isTask(value: unknown): value is Task {
  return typeof value === 'object' && value !== null && 'id' in value
}
```

**`interface` for object shapes** (better merging, better IDE error messages). **`type` for unions, intersections, mapped types, tuples** (`type Status = 'idle' | 'loading' | 'done'`).

**API response types live in `src/types/`** and get imported into every fetch site. When the backend schema changes, the compiler tells you every component that broke.

Path alias: `@/*` → `./src/*` configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). Use it: `import { Button } from '@/components/ui/button'`. Relative paths past two `../` are a smell.

## Build Verification

The non-negotiable feedback loop:

- **After every file change**: `npm run dev` must reload cleanly. No HMR red overlay.
- **After every feature**: `npm run build` must pass — `tsc -b && vite build` with zero errors.
- **After every page**: open at 375px viewport (Chrome DevTools "iPhone SE"). No horizontal scroll. Tap targets ≥ 44px. Text legible.

If `npm run build` fails, stop — don't keep adding features on a broken foundation. The first failure is always cheaper to fix than the third.

## Common Mistakes

1. **Routes scattered across feature files.** One `<Routes>` tree in `App.tsx` — that's the app's whole surface area in one place.
2. **`key={index}` in lists.** Use `item.id`. Index keys break React's reconciliation when items reorder or get inserted in the middle — you get re-mounted components and lost form state.
3. **Fetching in a component that re-renders frequently.** A `useEffect` with a missing dependency, or one that runs on every keystroke, hammers the API. If a fetch needs an input, debounce or move it to a parent.
4. **No empty state.** "No items yet" is the *first* thing every new user sees. If it's missing, the app feels broken on day one.
5. **Pixel values instead of the spacing scale.** `p-[15px]` shows up in PRs — replace with `p-4`. The grid exists so values stay consistent across components.
6. **Forgetting to add the new page to the router.** Component built, route never registered, page exists at no URL. Add the route in `App.tsx` *first*, then build the page — a 404 fallback prevents you from forgetting.
7. **Wrapping default-exported pages in `memo`.** Pages re-render on route change anyway. Memo adds noise without measurable benefit. Memo at the leaf-component level if the profiler points there.
8. **`useEffect` for derived data.** If the value can be computed from existing state, compute it inline or with `useMemo`. Setting state from `useEffect` is a common cause of render loops.
