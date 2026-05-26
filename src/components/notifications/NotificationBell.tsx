import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Bell,
  Calendar,
  MessageSquare,
  UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/data/auth'
import { useData } from '@/data/store'
import { relativeTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType, Task, TeamMember } from '@/data/types'

const ICON_BY_TYPE: Record<NotificationType, LucideIcon> = {
  assigned: UserPlus,
  comment: MessageSquare,
  mention: AtSign,
  status_change: ArrowRight,
  due_tomorrow: Calendar,
  overdue: AlertTriangle,
}

const ICON_COLOR_BY_TYPE: Record<NotificationType, string> = {
  assigned: '--accent-primary',
  comment: '--text-secondary',
  mention: '--accent-primary',
  status_change: '--status-progress',
  due_tomorrow: '--priority-high',
  overdue: '--priority-critical',
}

export function NotificationBell() {
  const { currentUser } = useAuth()
  const { notifications, tasks, teamMembers, markNotificationRead, markAllNotificationsRead } =
    useData()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const myNotifications = useMemo(() => {
    if (!currentUser) return []
    return notifications
      .filter((n) => n.recipientId === currentUser.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
  }, [notifications, currentUser])

  const unreadCount = useMemo(
    () => myNotifications.filter((n) => !n.read).length,
    [myNotifications],
  )

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const membersById = useMemo(
    () => new Map(teamMembers.map((m) => [m.id, m])),
    [teamMembers],
  )

  useEffect(() => {
    if (!open) return
    const handlePointer = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (!currentUser) return null

  const handleClick = (n: Notification) => {
    markNotificationRead(n.id)
    setOpen(false)
    navigate(`/tasks/${n.taskId}`)
  }

  const handleMarkAll = () => {
    markAllNotificationsRead(currentUser.id)
    toast.success('All notifications marked as read.')
  }

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : 'Notifications'
        }
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)] md:h-9 md:w-9"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-semibold text-white tabular-nums"
            aria-hidden="true"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="rounded text-xs font-medium text-[var(--accent-primary)] transition-colors hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
              >
                Mark all as read
              </button>
            )}
          </header>

          {myNotifications.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="max-h-[400px] overflow-y-auto">
              {myNotifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  task={tasksById.get(n.taskId)}
                  actor={n.actorId ? membersById.get(n.actorId) ?? null : null}
                  onClick={() => handleClick(n)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

interface NotificationRowProps {
  notification: Notification
  task: Task | undefined
  actor: TeamMember | null
  onClick: () => void
}

function NotificationRow({ notification, task, actor, onClick }: NotificationRowProps) {
  const Icon = ICON_BY_TYPE[notification.type]
  const iconColorVar = ICON_COLOR_BY_TYPE[notification.type]
  const description = describeNotification(notification.type, actor?.name, task?.title)

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:bg-[var(--bg-surface)]',
          notification.read
            ? 'border-l-transparent'
            : 'border-l-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,transparent)]',
        )}
      >
        <span
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, var(${iconColorVar}) 15%, transparent)`,
          }}
        >
          <Icon
            className="h-3.5 w-3.5"
            style={{ color: `var(${iconColorVar})` }}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm leading-snug',
              notification.read
                ? 'text-[var(--text-secondary)]'
                : 'text-[var(--text-primary)]',
            )}
          >
            {description}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {relativeTime(notification.createdAt)}
          </p>
        </div>
        {!notification.read && (
          <span
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent-primary)]"
            aria-label="unread"
          />
        )}
      </button>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Bell
        className="h-8 w-8 text-[var(--text-muted)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
        All caught up
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        You&apos;ll see notifications here when there&apos;s something to know.
      </p>
    </div>
  )
}

function describeNotification(
  type: NotificationType,
  actorName: string | undefined,
  taskTitle: string | undefined,
): string {
  const actor = actorName ?? 'Someone'
  const title = taskTitle ?? '(deleted task)'
  switch (type) {
    case 'assigned':
      return `${actor} assigned you to '${title}'`
    case 'comment':
      return `${actor} commented on '${title}'`
    case 'mention':
      return `${actor} mentioned you in '${title}'`
    case 'status_change':
      return `'${title}' moved to a new column`
    case 'due_tomorrow':
      return `'${title}' is due tomorrow`
    case 'overdue':
      return `'${title}' is overdue`
  }
}
