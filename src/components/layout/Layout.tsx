import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { ShortcutsButton } from '@/components/shared/ShortcutsButton'
import { ShortcutsHelp } from '@/components/shared/ShortcutsHelp'
import {
  CreateTaskModal,
  type CreateTaskValues,
} from '@/components/task-detail/CreateTaskModal'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const G_SEQUENCE_WINDOW_MS = 1500

export interface LayoutOutletContext {
  /**
   * Open the Create Task modal. If a projectId is provided, the form's project
   * field is pre-selected and locked. Falling back to the URL's ?project= param
   * is handled inside Layout so callers don't have to.
   */
  openCreateTask: (projectId?: string) => void
  openCommandPalette: () => void
  openShortcutsHelp: () => void
}

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { isPM, currentUser } = useAuth()
  const { projects, teamMembers, createTask } = useData()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultProjectId, setCreateDefaultProjectId] = useState<
    string | undefined
  >()

  // Tracks the timestamp of the most recent G keypress for two-key navigation
  // sequences (G D → Dashboard, G B → Board, etc.). Cleared when consumed or
  // after G_SEQUENCE_WINDOW_MS.
  const gPressedAt = useRef<number>(0)

  // Close mobile drawer when the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const openCreateTask = (projectId?: string) => {
    if (!isPM) return
    const explicit = projectId
    const fromUrl =
      location.pathname === '/board' ? searchParams.get('project') ?? undefined : undefined
    setCreateDefaultProjectId(explicit ?? fromUrl)
    setCreateOpen(true)
  }

  const handleCreateSubmit = async (values: CreateTaskValues) => {
    await createTask(values)
    setCreateOpen(false)
    toast.success('Task created.')
  }

  const consumeG = (target: string) => {
    if (Date.now() - gPressedAt.current > G_SEQUENCE_WINDOW_MS) return false
    gPressedAt.current = 0
    navigate(target)
    return true
  }

  useKeyboardShortcuts([
    // Command palette — works even when an input is focused, so the user can
    // always summon it.
    {
      key: 'k',
      meta: true,
      allowInInput: true,
      handler: () => setPaletteOpen(true),
    },
    {
      key: 'k',
      ctrl: true,
      allowInInput: true,
      handler: () => setPaletteOpen(true),
    },
    // Single-key palette + help — disabled while typing.
    {
      key: '/',
      handler: () => setPaletteOpen(true),
    },
    {
      key: '?',
      shift: true,
      handler: () => setHelpOpen(true),
    },
    // Create Task — PM only; falls back to ?project= on the board.
    {
      key: 'c',
      handler: () => openCreateTask(),
    },
    // G then X — two-key navigation. The first G stamps the timestamp; the
    // follow-up letter consumes it if pressed within the window.
    {
      key: 'g',
      handler: () => {
        gPressedAt.current = Date.now()
      },
    },
    { key: 'd', handler: () => consumeG('/dashboard') },
    { key: 'b', handler: () => consumeG('/board') },
    { key: 'm', handler: () => consumeG('/my-tasks') },
    { key: 'p', handler: () => consumeG('/projects') },
    { key: 't', handler: () => consumeG('/team') },
  ])

  const outletContext: LayoutOutletContext = {
    openCreateTask,
    openCommandPalette: () => setPaletteOpen(true),
    openShortcutsHelp: () => setHelpOpen(true),
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <TopBar
        onMobileMenuClick={() => setMobileOpen(true)}
        onSearchClick={() => setPaletteOpen(true)}
      />

      <main className="md:pl-16 lg:pl-60 pt-14">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <Outlet context={outletContext} />
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCreateTask={() => openCreateTask()}
      />

      <CreateTaskModal
        open={createOpen}
        projects={projects}
        members={teamMembers}
        defaultProjectId={createDefaultProjectId}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <ShortcutsHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        isPM={isPM}
      />

      {/* Hide the floating help button when a modal is open so it doesn't sit on top of them. */}
      {currentUser && !paletteOpen && !createOpen && !helpOpen && (
        <ShortcutsButton onClick={() => setHelpOpen(true)} />
      )}
    </div>
  )
}
