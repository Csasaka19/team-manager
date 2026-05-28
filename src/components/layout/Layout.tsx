import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import {
  QuickCreateModal,
  type QuickCreateValues,
} from '@/components/quick-create/QuickCreateModal'
import { ShortcutsButton } from '@/components/shared/ShortcutsButton'
import { ShortcutsHelp } from '@/components/shared/ShortcutsHelp'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { QuickCreateFab } from './QuickCreateFab'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const G_SEQUENCE_WINDOW_MS = 1500

export interface LayoutOutletContext {
  /**
   * Open the Quick Create task modal. If a projectId is provided, the form's
   * project field is pre-selected (still editable). Falling back to the URL
   * context (/board ?project= or the active /tasks/:id task's project) and
   * the session-remembered last selection is handled inside Layout so callers
   * don't have to.
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
  const { tasks, projects, teamMembers, createTask } = useData()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultProjectId, setCreateDefaultProjectId] = useState<
    string | undefined
  >()

  // Session-only memory of the last project the user picked in Quick Create.
  // Survives modal opens/closes within the tab; not persisted to localStorage
  // (deliberately — the spec calls for "current session" only).
  const lastUsedProjectId = useRef<string | undefined>(undefined)

  // Tracks the timestamp of the most recent G keypress for two-key navigation
  // sequences (G D → Dashboard, G B → Board, etc.). Cleared when consumed or
  // after G_SEQUENCE_WINDOW_MS.
  const gPressedAt = useRef<number>(0)

  // Close mobile drawer when the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  /**
   * Resolves the project to pre-select in Quick Create.
   * Priority: explicit arg → URL context → session memory → undefined.
   */
  const resolveDefaultProject = (explicit?: string): string | undefined => {
    if (explicit) return explicit
    if (location.pathname === '/board') {
      const fromUrl = searchParams.get('project')
      if (fromUrl) return fromUrl
    } else if (location.pathname.startsWith('/tasks/')) {
      const taskId = location.pathname.slice('/tasks/'.length)
      const task = tasks.find((t) => t.id === taskId)
      if (task) return task.projectId
    }
    return lastUsedProjectId.current
  }

  const openCreateTask = (projectId?: string) => {
    if (!isPM) return
    setCreateDefaultProjectId(resolveDefaultProject(projectId))
    setCreateOpen(true)
  }

  const handleCreateSubmit = async (
    values: QuickCreateValues,
    openAfter: boolean,
  ) => {
    const created = await createTask(values)
    lastUsedProjectId.current = values.projectId
    setCreateOpen(false)

    if (openAfter) {
      navigate(`/tasks/${created.id}`)
      toast.success('Task created.')
    } else {
      toast.success('Task created.', {
        action: {
          label: 'Open',
          onClick: () => navigate(`/tasks/${created.id}`),
        },
      })
    }
  }

  const consumeG = (target: string) => {
    if (Date.now() - gPressedAt.current > G_SEQUENCE_WINDOW_MS) return false
    gPressedAt.current = 0
    navigate(target)
    return true
  }

  useKeyboardShortcuts([
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
    { key: '/', handler: () => setPaletteOpen(true) },
    { key: '?', shift: true, handler: () => setHelpOpen(true) },
    { key: 'c', handler: () => openCreateTask() },
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

  const anyModalOpen = paletteOpen || createOpen || helpOpen

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

      <QuickCreateModal
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

      {currentUser && isPM && !anyModalOpen && (
        <QuickCreateFab onClick={() => openCreateTask()} />
      )}
      {currentUser && !anyModalOpen && (
        <ShortcutsButton onClick={() => setHelpOpen(true)} />
      )}
    </div>
  )
}
