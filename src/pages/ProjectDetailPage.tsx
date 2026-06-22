import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Columns3, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MeetingList } from '@/components/meetings/MeetingList'
import { RecordingsSection } from '@/components/recordings/RecordingsSection'
import { buildRecordingDateSet } from '@/components/recordings/RecordingsSection'
import { useZoomBot } from '@/hooks/useZoomBot'
import {
  MeetingFormModal,
  type MeetingFormValues,
} from '@/components/meetings/MeetingFormModal'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { isPM } = useAuth()
  const { projects, meetings, teamMembers, createMeeting, dataSource } = useData()
  const { recordings } = useZoomBot()
  const recordingDateSet = useMemo(
    () => buildRecordingDateSet(recordings),
    [recordings],
  )
  const [newMeetingOpen, setNewMeetingOpen] = useState(false)

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  useDocumentTitle(project?.name ?? 'Project not found')

  const projectMeetings = useMemo(
    () => meetings.filter((m) => m.projectId === projectId),
    [meetings, projectId],
  )

  if (!projectId) return <Navigate to="/projects" replace />
  if (!project) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h2 className="text-base font-medium text-[var(--text-secondary)]">
          Project not found
        </h2>
        <Link
          to="/projects"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  const handleCreate = async (values: MeetingFormValues) => {
    await createMeeting({ ...values, projectId })
    setNewMeetingOpen(false)
    toast.success('Meeting created.')
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 rounded text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Projects
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="truncate text-2xl font-semibold text-[var(--text-primary)]">
              {project.name}
            </h1>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {project.description}
            </p>
          )}
        </div>
        {isPM && (
          <button
            type="button"
            onClick={() => setNewMeetingOpen(true)}
            disabled={dataSource === 'atlas'}
            title={
              dataSource === 'atlas'
                ? 'Meetings are extracted from Atlas manifests'
                : undefined
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--accent-primary)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Meeting
          </button>
        )}
      </header>

      {/* Tab strip. Board navigates away to the existing /board route with
          the project filter pre-selected — see comment in ProjectDetailPage.
          Meetings stays on this page and renders below. */}
      <div
        role="tablist"
        className="-mb-px flex gap-1 border-b border-[var(--border-subtle)]"
      >
        <Link
          to={`/board?project=${projectId}`}
          role="tab"
          aria-selected={false}
          className={cn(
            'inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]',
          )}
        >
          <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
          Board
        </Link>
        <span
          role="tab"
          aria-selected={true}
          className="inline-flex items-center gap-1.5 border-b-2 border-[var(--accent-primary)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Meetings
          {projectMeetings.length > 0 && (
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              ({projectMeetings.length})
            </span>
          )}
        </span>
      </div>

      <MeetingList
        meetings={projectMeetings}
        members={teamMembers}
        hrefForMeeting={(m) => `/projects/${projectId}/meetings/${m.id}`}
        recordingDates={recordingDateSet}
      />

      <RecordingsSection />

      <MeetingFormModal
        open={newMeetingOpen}
        members={teamMembers}
        projectName={project.name}
        onClose={() => setNewMeetingOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
