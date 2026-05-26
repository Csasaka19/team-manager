import { useMemo, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { InviteMemberModal } from '@/components/team/InviteMemberModal'
import { TeamMemberCard } from '@/components/team/TeamMemberCard'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import type { Role, Task, TeamMember } from '@/data/types'

const ACTIVE_STATUSES = ['todo', 'in_progress', 'in_review'] as const

export default function TeamPage() {
  const { currentUser, isPM } = useAuth()
  const { teamMembers, tasks, inviteTeamMember, removeTeamMember } = useData()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null)

  const tasksByMember = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.assigneeId) continue
      const list = map.get(t.assigneeId) ?? []
      list.push(t)
      map.set(t.assigneeId, list)
    }
    return map
  }, [tasks])

  const sortedMembers = useMemo(() => {
    return [...teamMembers].sort((a, b) => {
      // PMs first, then alphabetical.
      if (a.role !== b.role) return a.role === 'pm' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [teamMembers])

  const handleInvite = async (input: { name: string; email: string; role: Role }) => {
    await inviteTeamMember(input)
    setInviteOpen(false)
    toast.success(`Invite sent to ${input.email}.`)
  }

  const activeCountFor = (id: string) =>
    (tasksByMember.get(id) ?? []).filter((t) =>
      ACTIVE_STATUSES.includes(t.status as (typeof ACTIVE_STATUSES)[number]),
    ).length

  const handleRemoveConfirm = async () => {
    if (!confirmRemove) return
    const name = confirmRemove.name
    await removeTeamMember(confirmRemove.id)
    setConfirmRemove(null)
    setExpandedId(null)
    toast.success(`${name} removed.`)
  }

  if (!currentUser) return null

  const showSoloHint = isPM && teamMembers.length === 1

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Team</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'} in this workspace.
          </p>
        </div>
        {isPM && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite Member
          </button>
        )}
      </header>

      {showSoloHint && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]/40 px-4 py-3">
          <Users
            className="h-5 w-5 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--text-secondary)]">
            Invite your team to get started.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sortedMembers.map((m) => {
          const isExpanded = expandedId === m.id
          const memberTasks = tasksByMember.get(m.id) ?? []
          // PM can remove anyone except themselves.
          const canRemove = isPM && m.id !== currentUser.id
          return (
            <div
              key={m.id}
              className={isExpanded ? 'lg:col-span-2' : undefined}
            >
              <TeamMemberCard
                member={m}
                tasks={memberTasks}
                expanded={isExpanded}
                onToggle={() =>
                  setExpandedId((prev) => (prev === m.id ? null : m.id))
                }
                canRemove={canRemove}
                onRemove={() => setConfirmRemove(m)}
              />
            </div>
          )
        })}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        existingEmails={teamMembers.map((m) => m.email)}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
      />

      <ConfirmModal
        open={confirmRemove !== null}
        title="Remove member?"
        message={
          confirmRemove ? (
            <>
              Remove{' '}
              <strong className="text-[var(--text-primary)]">{confirmRemove.name}</strong>?{' '}
              {(() => {
                const count = activeCountFor(confirmRemove.id)
                if (count === 0) return 'They have no active tasks.'
                return (
                  <>
                    Their <strong className="text-[var(--text-primary)]">{count}</strong> active{' '}
                    {count === 1 ? 'task' : 'tasks'} will become unassigned.
                  </>
                )
              })()}
            </>
          ) : null
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemoveConfirm}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}
