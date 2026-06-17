import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FolderOpen, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { ExportMenu } from '@/components/projects/ExportMenu'
import { ProjectCard } from '@/components/projects/ProjectCard'
import {
  ProjectFormModal,
  type ProjectFormValues,
} from '@/components/projects/ProjectFormModal'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'
import type { Project, TeamMember } from '@/data/types'

type Tab = 'active' | 'archived'
type Confirm = { kind: 'archive' | 'delete'; project: Project } | null

export default function ProjectsPage() {
  useDocumentTitle('Projects')
  const { isPM } = useAuth()
  const {
    projects,
    tasks,
    teamMembers,
    createProject,
    updateProject,
    deleteProject,
    dataSource,
    snapshotIndex,
    projectDataSources,
  } = useData()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  // Auto-open the New Project modal when arriving from the command palette
  // ("Create project" action) or any other deep link with ?new=1. Strip the
  // query param immediately so a refresh doesn't re-open the modal.
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !isPM) return
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, isPM])

  const tasksByProject = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      const list = map.get(t.projectId) ?? []
      list.push(t)
      map.set(t.projectId, list)
    }
    return map
  }, [tasks])

  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)
  const visible = tab === 'active' ? active : archived

  const handleCreate = async (values: ProjectFormValues) => {
    await createProject(values)
    setCreateOpen(false)
    toast.success('Project created.')
  }

  const handleSave = async (values: ProjectFormValues) => {
    if (!editing) return
    await updateProject(editing.id, values)
    setEditing(null)
    toast.success('Project updated.')
  }

  const handleArchiveConfirm = async () => {
    if (!confirm || confirm.kind !== 'archive') return
    await updateProject(confirm.project.id, { archived: true })
    setConfirm(null)
    setEditing(null)
    toast.success('Project archived.')
  }

  const handleUnarchive = async () => {
    if (!editing) return
    await updateProject(editing.id, { archived: false })
    setEditing(null)
    toast.success('Project unarchived.')
  }

  const handleDeleteConfirm = async () => {
    if (!confirm || confirm.kind !== 'delete') return
    await deleteProject(confirm.project.id)
    setConfirm(null)
    setEditing(null)
    toast.success('Project deleted.')
  }

  if (projects.length === 0) {
    return <EmptyProjects isPM={isPM} onCreate={() => setCreateOpen(true)} createOpen={createOpen} closeCreate={() => setCreateOpen(false)} onSubmit={handleCreate} members={teamMembers} />
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Projects</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Click any project to open its board.
          </p>
        </div>
        {isPM && (
          <div className="flex items-center gap-2">
            <ExportMenu />
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={dataSource === 'atlas'}
              title={
                dataSource === 'atlas'
                  ? 'Projects are managed in Atlas'
                  : undefined
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--accent-primary)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Project
            </button>
          </div>
        )}
      </header>

      {archived.length > 0 && (
        <div className="flex gap-1 border-b border-[var(--border-subtle)]" role="tablist">
          <TabButton
            active={tab === 'active'}
            onClick={() => setTab('active')}
            count={active.length}
          >
            Active
          </TabButton>
          <TabButton
            active={tab === 'archived'}
            onClick={() => setTab('archived')}
            count={archived.length}
          >
            Archived
          </TabButton>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {tab === 'archived'
              ? 'No archived projects.'
              : 'No active projects.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              tasks={tasksByProject.get(p.id) ?? []}
              members={teamMembers}
              canEdit={isPM}
              onSettingsClick={() => setEditing(p)}
              isAtlasManaged={
                dataSource === 'atlas' && snapshotIndex.projectsById.has(p.id)
              }
              isSheetsManaged={
                projectDataSources.some(
                  (s) => s.projectId === p.id && s.source === 'google-sheets',
                )
              }
            />
          ))}
        </div>
      )}

      <ProjectFormModal
        open={createOpen}
        mode="create"
        members={teamMembers}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <ProjectFormModal
        open={editing !== null}
        mode="edit"
        initial={editing ?? undefined}
        members={teamMembers}
        onClose={() => setEditing(null)}
        onSubmit={handleSave}
        onArchive={() =>
          editing && setConfirm({ kind: 'archive', project: editing })
        }
        onUnarchive={handleUnarchive}
        onDelete={() =>
          editing && setConfirm({ kind: 'delete', project: editing })
        }
      />

      <ConfirmModal
        open={confirm?.kind === 'archive'}
        title="Archive project?"
        message={
          confirm?.kind === 'archive' ? (
            <>
              Archive <strong className="text-[var(--text-primary)]">{confirm.project.name}</strong>?
              It will be hidden from the main view.
            </>
          ) : null
        }
        confirmLabel="Archive"
        onConfirm={handleArchiveConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmModal
        open={confirm?.kind === 'delete'}
        title="Delete project?"
        message={
          confirm?.kind === 'delete' ? (
            <>
              Delete <strong className="text-[var(--text-primary)]">{confirm.project.name}</strong>{' '}
              and all its tasks? This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] rounded-t',
        active
          ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
      <span className="text-xs text-[var(--text-muted)] tabular-nums">({count})</span>
    </button>
  )
}

function EmptyProjects({
  isPM,
  onCreate,
  createOpen,
  closeCreate,
  onSubmit,
  members,
}: {
  isPM: boolean
  onCreate: () => void
  createOpen: boolean
  closeCreate: () => void
  onSubmit: (values: ProjectFormValues) => Promise<void>
  members: TeamMember[]
}) {
  return (
    <>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <FolderOpen
          className="h-12 w-12 text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 className="mt-4 text-base font-medium text-[var(--text-secondary)]">
          No projects yet
        </h2>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
          {isPM
            ? 'Create your first project to start organizing work.'
            : 'Your PM will set them up.'}
        </p>
        {isPM && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create your first project
          </button>
        )}
      </div>

      <ProjectFormModal
        open={createOpen}
        mode="create"
        members={members}
        onClose={closeCreate}
        onSubmit={onSubmit}
      />
    </>
  )
}
