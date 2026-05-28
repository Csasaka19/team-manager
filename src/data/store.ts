import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_DISCORD_SETTINGS,
  buildCommentPostedEmbed,
  buildTaskAssignedEmbed,
  buildTaskCompletedEmbed,
  buildTaskCreatedEmbed,
  buildTaskStatusChangedEmbed,
  buildTestEmbed,
  sendDiscordWebhook,
  type DiscordEvent,
  type DiscordSettings,
} from '@/services/discord'
import { useAuth } from './auth'
import {
  mockActivities,
  mockNotifications,
  mockProjects,
  mockTags,
  mockTasks,
  mockTeamMembers,
} from './mock-data'
import {
  STATUS_LABELS,
  type Activity,
  type ActivityType,
  type Notification,
  type NotificationType,
  type Priority,
  type Project,
  type Role,
  type Subtask,
  type Tag,
  type Task,
  type TaskStatus,
  type TeamMember,
} from './types'

const MUTATION_DELAY_MS = 800

const WORKSPACE_NAME_KEY = 'team-manager.workspace-name'
const STATUS_LABEL_OVERRIDES_KEY = 'team-manager.status-label-overrides'
const COLUMN_ORDER_KEY = 'team-manager.column-order'
const NOTIF_PREFS_PREFIX = 'team-manager.notif-prefs.'
const DISCORD_SETTINGS_KEY = 'team-manager.discord-settings'

const DEFAULT_WORKSPACE_NAME = 'Team Manager'
const DEFAULT_COLUMN_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

/** Map a NotificationType to the pref key shown in Settings. */
const NOTIF_TYPE_PREF_KEY: Record<NotificationType, string> = {
  assigned: 'assigned',
  comment: 'comment',
  mention: 'mention',
  status_change: 'status_change',
  due_tomorrow: 'due_tomorrow',
  overdue: 'overdue',
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode / quota — ignore
  }
}

/** True when the recipient has the given notification type enabled (default: true). */
function notifTypeEnabled(recipientId: string, type: NotificationType): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(NOTIF_PREFS_PREFIX + recipientId)
    if (!raw) return true
    const parsed = JSON.parse(raw) as Record<string, boolean>
    const value = parsed[NOTIF_TYPE_PREF_KEY[type]]
    return value !== false
  } catch {
    return true
  }
}

function uid(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function memberName(members: TeamMember[], id: string | null | undefined): string {
  if (!id) return 'Unassigned'
  return members.find((m) => m.id === id)?.name ?? 'Unknown'
}

export interface CreateTaskInput {
  title: string
  projectId: string
  description?: string
  assigneeId?: string | null
  priority?: Priority
  status?: TaskStatus
  dueDate?: string | null
  tags?: string[]
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  assigneeId?: string | null
  priority?: Priority
  status?: TaskStatus
  dueDate?: string | null
  tags?: string[]
}

export interface CreateProjectInput {
  name: string
  description?: string
  color: string
  memberIds?: string[]
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  color?: string
  memberIds?: string[]
  archived?: boolean
}

export interface DataStore {
  // State
  teamMembers: TeamMember[]
  projects: Project[]
  tasks: Task[]
  tags: Tag[]
  activities: Activity[]
  notifications: Notification[]
  /** True while at least one mutation is in flight. */
  mutating: boolean
  /** Workspace settings — persisted to localStorage so changes outlive a reload. */
  workspaceName: string
  /** Display labels for each canonical status, merged from defaults + user overrides. */
  statusLabels: Record<TaskStatus, string>
  /** Display order of the board columns. */
  columnOrder: TaskStatus[]

  // Workspace settings
  setWorkspaceName: (name: string) => void
  setStatusLabel: (status: TaskStatus, label: string) => void
  setColumnOrder: (order: TaskStatus[]) => void

  // Discord integration (PM-managed)
  discordSettings: DiscordSettings
  setDiscordSettings: (next: DiscordSettings) => void
  /** Sends a sample embed to the configured webhook and resolves with the result. */
  testDiscordWebhook: () => Promise<{ ok: boolean; error?: string }>

  // Task CRUD
  createTask: (input: CreateTaskInput) => Promise<Task>
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>
  deleteTask: (id: string) => Promise<void>

  // Project CRUD
  createProject: (input: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, patch: UpdateProjectInput) => Promise<Project>
  deleteProject: (id: string) => Promise<void>

  // Subtasks
  createSubtask: (
    taskId: string,
    title: string,
    assigneeId?: string | null,
  ) => Promise<Subtask>
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>
  updateSubtask: (
    taskId: string,
    subtaskId: string,
    patch: { title?: string; assigneeId?: string | null },
  ) => Promise<void>
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>
  reorderSubtasks: (taskId: string, orderedIds: string[]) => Promise<void>

  // Comments + raw activity
  addComment: (
    taskId: string,
    content: string,
    mentions?: string[],
  ) => Promise<Activity>
  addActivity: (
    taskId: string,
    type: ActivityType,
    content: string,
    mentions?: string[],
  ) => Activity

  // Team members
  inviteTeamMember: (input: { name: string; email: string; role: Role }) => Promise<TeamMember>
  removeTeamMember: (id: string) => Promise<void>
  updateTeamMember: (id: string, patch: { name?: string }) => Promise<void>

  // Tags
  createTag: (input: { name: string; color: string }) => Promise<Tag>
  updateTag: (id: string, patch: { name?: string; color?: string }) => Promise<void>
  deleteTag: (id: string) => Promise<void>

  // Notifications
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (recipientId?: string) => void
}

const DataContext = createContext<DataStore | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(mockTeamMembers)
  const [tags, setTags] = useState<Tag[]>(mockTags)
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [tasks, setTasks] = useState<Task[]>(mockTasks)
  const [activities, setActivities] = useState<Activity[]>(mockActivities)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [inflight, setInflight] = useState(0)

  // Persisted workspace settings.
  const [workspaceName, setWorkspaceNameState] = useState<string>(() =>
    loadJSON<string>(WORKSPACE_NAME_KEY, DEFAULT_WORKSPACE_NAME),
  )
  const [statusLabelOverrides, setStatusLabelOverrides] = useState<
    Partial<Record<TaskStatus, string>>
  >(() => loadJSON(STATUS_LABEL_OVERRIDES_KEY, {}))
  const [columnOrder, setColumnOrderState] = useState<TaskStatus[]>(() => {
    const saved = loadJSON<TaskStatus[]>(COLUMN_ORDER_KEY, DEFAULT_COLUMN_ORDER)
    // Sanity check: ensure all canonical statuses are present and no extras.
    const allPresent = DEFAULT_COLUMN_ORDER.every((s) => saved.includes(s))
    return allPresent && saved.length === DEFAULT_COLUMN_ORDER.length
      ? saved
      : DEFAULT_COLUMN_ORDER
  })

  const statusLabels = useMemo<Record<TaskStatus, string>>(
    () => ({
      todo: statusLabelOverrides.todo ?? STATUS_LABELS.todo,
      in_progress: statusLabelOverrides.in_progress ?? STATUS_LABELS.in_progress,
      in_review: statusLabelOverrides.in_review ?? STATUS_LABELS.in_review,
      done: statusLabelOverrides.done ?? STATUS_LABELS.done,
    }),
    [statusLabelOverrides],
  )

  const setWorkspaceName = useCallback<DataStore['setWorkspaceName']>((name) => {
    setWorkspaceNameState(name)
    saveJSON(WORKSPACE_NAME_KEY, name)
  }, [])

  const setStatusLabel = useCallback<DataStore['setStatusLabel']>(
    (status, label) => {
      setStatusLabelOverrides((prev) => {
        const next = { ...prev, [status]: label }
        saveJSON(STATUS_LABEL_OVERRIDES_KEY, next)
        return next
      })
    },
    [],
  )

  const setColumnOrder = useCallback<DataStore['setColumnOrder']>((order) => {
    setColumnOrderState(order)
    saveJSON(COLUMN_ORDER_KEY, order)
  }, [])

  // Discord settings — persisted to localStorage. The webhook URL is sensitive
  // (contains a secret token); in production you'd keep it server-side.
  const [discordSettings, setDiscordSettingsState] = useState<DiscordSettings>(
    () => {
      const saved = loadJSON<Partial<DiscordSettings>>(DISCORD_SETTINGS_KEY, {})
      return {
        ...DEFAULT_DISCORD_SETTINGS,
        ...saved,
        events: { ...DEFAULT_DISCORD_SETTINGS.events, ...(saved.events ?? {}) },
      }
    },
  )

  const setDiscordSettings = useCallback<DataStore['setDiscordSettings']>(
    (next) => {
      setDiscordSettingsState(next)
      saveJSON(DISCORD_SETTINGS_KEY, next)
    },
    [],
  )

  const actorId = currentUser?.id ?? 'system'

  /** Push a synthetic Activity entry (used both by external callers and by mutations). */
  const pushActivity = useCallback(
    (
      taskId: string,
      type: ActivityType,
      content: string,
      mentions: string[] = [],
    ): Activity => {
      const entry: Activity = {
        id: uid('act'),
        taskId,
        actorId,
        type,
        content,
        mentions,
        createdAt: new Date().toISOString(),
      }
      setActivities((prev) => [...prev, entry])
      return entry
    },
    [actorId],
  )

  /** Push a synthetic Notification (does not deduplicate). */
  const pushNotification = useCallback(
    (input: {
      recipientId: string
      type: NotificationType
      taskId: string
      actor?: string | null
    }) => {
      // Don't notify yourself about your own action.
      if (input.recipientId === actorId) return
      // Respect the recipient's notification preferences (set on the Settings page).
      if (!notifTypeEnabled(input.recipientId, input.type)) return
      const entry: Notification = {
        id: uid('notif'),
        recipientId: input.recipientId,
        type: input.type,
        taskId: input.taskId,
        actorId: input.actor ?? actorId,
        read: false,
        createdAt: new Date().toISOString(),
      }
      setNotifications((prev) => [entry, ...prev])
    },
    [actorId],
  )

  async function withMutation<T>(fn: () => T | Promise<T>): Promise<T> {
    setInflight((n) => n + 1)
    try {
      await delay(MUTATION_DELAY_MS)
      return await fn()
    } finally {
      setInflight((n) => Math.max(0, n - 1))
    }
  }

  // ---- Discord emit ------------------------------------------------------
  //
  // Mutation callbacks (createTask / updateTask / addComment) are wrapped in
  // useCallback for stable identity. To avoid forcing them to depend on every
  // slice of state the embed builders need (projects, members, workspaceName,
  // discordSettings…), we mirror those into refs and read from the refs at
  // emit time. `emitDiscord` itself is therefore stable (empty deps) and
  // doesn't churn its parent callbacks.
  const tasksRef = useRef(tasks)
  const projectsRef = useRef(projects)
  const teamMembersRef = useRef(teamMembers)
  const statusLabelsRef = useRef(statusLabels)
  const workspaceNameRef = useRef(workspaceName)
  const discordSettingsRef = useRef(discordSettings)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    projectsRef.current = projects
  }, [projects])
  useEffect(() => {
    teamMembersRef.current = teamMembers
  }, [teamMembers])
  useEffect(() => {
    statusLabelsRef.current = statusLabels
  }, [statusLabels])
  useEffect(() => {
    workspaceNameRef.current = workspaceName
  }, [workspaceName])
  useEffect(() => {
    discordSettingsRef.current = discordSettings
  }, [discordSettings])

  const emitDiscord = useCallback(
    (
      event: DiscordEvent,
      builder: () => import('@/services/discord').DiscordEmbed,
    ) => {
      const settings = discordSettingsRef.current
      if (!settings.webhookUrl) return
      if (!settings.events[event]) return
      const embed = builder()
      void sendDiscordWebhook(settings.webhookUrl, { embeds: [embed] })
    },
    [],
  )

  const testDiscordWebhook = useCallback<DataStore['testDiscordWebhook']>(
    async () => {
      const settings = discordSettingsRef.current
      if (!settings.webhookUrl) {
        return { ok: false, error: 'Add a webhook URL before testing.' }
      }
      const result = await sendDiscordWebhook(settings.webhookUrl, {
        embeds: [buildTestEmbed(workspaceNameRef.current)],
      })
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error ?? 'Unknown error.' }
    },
    [],
  )

  const createTask = useCallback<DataStore['createTask']>(
    (input) =>
      withMutation(() => {
        const now = new Date().toISOString()
        const task: Task = {
          id: uid('task'),
          title: input.title,
          description: input.description ?? '',
          projectId: input.projectId,
          assigneeId: input.assigneeId ?? null,
          priority: input.priority ?? 'medium',
          status: input.status ?? 'todo',
          dueDate: input.dueDate ?? null,
          tags: input.tags ?? [],
          subtasks: [],
          createdAt: now,
          updatedAt: now,
          createdBy: actorId,
        }
        setTasks((prev) => [...prev, task])
        pushActivity(task.id, 'creation', 'created this task')
        if (task.assigneeId) {
          pushActivity(
            task.id,
            'assignment',
            `assigned this to ${memberName(teamMembers, task.assigneeId)}`,
          )
          pushNotification({
            recipientId: task.assigneeId,
            type: 'assigned',
            taskId: task.id,
          })
        }
        emitDiscord('task_created', () =>
          buildTaskCreatedEmbed({
            task,
            project: projectsRef.current.find((p) => p.id === task.projectId),
            members: teamMembersRef.current,
          }),
        )
        return task
      }),
    [actorId, pushActivity, pushNotification, teamMembers, emitDiscord],
  )

  const updateTask = useCallback<DataStore['updateTask']>(
    (id, patch) =>
      withMutation(() => {
        // Capture the prior task once, outside the setter, so side effects
        // (activity / notification / Discord) run exactly once even when
        // React StrictMode invokes the updater twice in development.
        const prev = tasksRef.current.find((t) => t.id === id)
        if (!prev) {
          throw new Error(`Task ${id} not found`)
        }
        const next: Task = {
          ...prev,
          ...patch,
          updatedAt: new Date().toISOString(),
        }
        setTasks((cur) => cur.map((t) => (t.id === id ? next : t)))

        const actorName = memberName(teamMembersRef.current, actorId)

        if (patch.status !== undefined && patch.status !== prev.status) {
          pushActivity(
            id,
            'status_change',
            `moved this to ${statusLabels[patch.status]}`,
          )
          if (prev.assigneeId && prev.assigneeId !== actorId) {
            pushNotification({
              recipientId: prev.assigneeId,
              type: 'status_change',
              taskId: id,
            })
          }
          emitDiscord('task_status_changed', () =>
            buildTaskStatusChangedEmbed({
              task: next,
              fromStatus: prev.status,
              toStatus: patch.status!,
              actorName,
              statusLabels: statusLabelsRef.current,
            }),
          )
          if (patch.status === 'done' && prev.status !== 'done') {
            emitDiscord('task_completed', () =>
              buildTaskCompletedEmbed({
                task: next,
                project: projectsRef.current.find(
                  (p) => p.id === next.projectId,
                ),
                actorName,
              }),
            )
          }
        }
        if (
          patch.assigneeId !== undefined &&
          patch.assigneeId !== prev.assigneeId
        ) {
          pushActivity(
            id,
            'assignment',
            patch.assigneeId
              ? `assigned this to ${memberName(teamMembers, patch.assigneeId)}`
              : 'unassigned this task',
          )
          if (patch.assigneeId) {
            pushNotification({
              recipientId: patch.assigneeId,
              type: 'assigned',
              taskId: id,
            })
            emitDiscord('task_assigned', () =>
              buildTaskAssignedEmbed({
                task: next,
                assigneeName: memberName(
                  teamMembersRef.current,
                  patch.assigneeId,
                ),
              }),
            )
          }
        }
        if (patch.priority !== undefined && patch.priority !== prev.priority) {
          pushActivity(
            id,
            'priority_change',
            `set priority to ${patch.priority.charAt(0).toUpperCase() + patch.priority.slice(1)}`,
          )
        }
        return next
      }),
    [
      actorId,
      pushActivity,
      pushNotification,
      teamMembers,
      statusLabels,
      emitDiscord,
    ],
  )

  const deleteTask = useCallback<DataStore['deleteTask']>(
    (id) =>
      withMutation(() => {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        setActivities((prev) => prev.filter((a) => a.taskId !== id))
        setNotifications((prev) => prev.filter((n) => n.taskId !== id))
      }),
    [],
  )

  const createProject = useCallback<DataStore['createProject']>(
    (input) =>
      withMutation(() => {
        const now = new Date().toISOString()
        const project: Project = {
          id: uid('proj'),
          name: input.name,
          description: input.description ?? '',
          color: input.color,
          memberIds: input.memberIds ?? [actorId],
          archived: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actorId,
        }
        setProjects((prev) => [...prev, project])
        return project
      }),
    [actorId],
  )

  const updateProject = useCallback<DataStore['updateProject']>(
    (id, patch) =>
      withMutation(() => {
        let updated: Project | null = null
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p
            const next: Project = {
              ...p,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
            updated = next
            return next
          }),
        )
        if (!updated) throw new Error(`Project ${id} not found`)
        return updated
      }),
    [],
  )

  const deleteProject = useCallback<DataStore['deleteProject']>(
    (id) =>
      withMutation(() => {
        setProjects((prev) => prev.filter((p) => p.id !== id))
        // Cascade: drop tasks (and their activities/notifications) belonging to this project.
        setTasks((prev) => {
          const removedTaskIds = new Set(
            prev.filter((t) => t.projectId === id).map((t) => t.id),
          )
          setActivities((acts) =>
            acts.filter((a) => !removedTaskIds.has(a.taskId)),
          )
          setNotifications((notifs) =>
            notifs.filter((n) => !removedTaskIds.has(n.taskId)),
          )
          return prev.filter((t) => t.projectId !== id)
        })
      }),
    [],
  )

  const createSubtask = useCallback<DataStore['createSubtask']>(
    (taskId, title, assigneeId = null) =>
      withMutation(() => {
        let created: Subtask | null = null
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t
            const subtask: Subtask = {
              id: uid('sub'),
              taskId,
              title,
              assigneeId: assigneeId ?? null,
              done: false,
              sortOrder: t.subtasks.length,
              createdAt: new Date().toISOString(),
              completedAt: null,
            }
            created = subtask
            return {
              ...t,
              subtasks: [...t.subtasks, subtask],
              updatedAt: new Date().toISOString(),
            }
          }),
        )
        if (!created) throw new Error(`Task ${taskId} not found`)
        return created
      }),
    [],
  )

  const toggleSubtask = useCallback<DataStore['toggleSubtask']>(
    (taskId, subtaskId) =>
      withMutation(() => {
        let completedTitle: string | null = null
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t
            return {
              ...t,
              subtasks: t.subtasks.map((s) => {
                if (s.id !== subtaskId) return s
                const willBeDone = !s.done
                if (willBeDone) completedTitle = s.title
                return {
                  ...s,
                  done: willBeDone,
                  completedAt: willBeDone ? new Date().toISOString() : null,
                }
              }),
              updatedAt: new Date().toISOString(),
            }
          }),
        )
        if (completedTitle) {
          pushActivity(
            taskId,
            'subtask_complete',
            `completed subtask '${completedTitle}'`,
          )
        }
      }),
    [pushActivity],
  )

  const updateSubtask = useCallback<DataStore['updateSubtask']>(
    (taskId, subtaskId, patch) =>
      withMutation(() => {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t
            return {
              ...t,
              subtasks: t.subtasks.map((s) =>
                s.id === subtaskId ? { ...s, ...patch } : s,
              ),
              updatedAt: new Date().toISOString(),
            }
          }),
        )
      }),
    [],
  )

  const deleteSubtask = useCallback<DataStore['deleteSubtask']>(
    (taskId, subtaskId) =>
      withMutation(() => {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t
            return {
              ...t,
              subtasks: t.subtasks
                .filter((s) => s.id !== subtaskId)
                .map((s, idx) => ({ ...s, sortOrder: idx })),
              updatedAt: new Date().toISOString(),
            }
          }),
        )
      }),
    [],
  )

  const reorderSubtasks = useCallback<DataStore['reorderSubtasks']>(
    (taskId, orderedIds) =>
      withMutation(() => {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t
            const byId = new Map(t.subtasks.map((s) => [s.id, s]))
            const reordered = orderedIds
              .map((id, idx) => {
                const s = byId.get(id)
                return s ? { ...s, sortOrder: idx } : null
              })
              .filter((s): s is Subtask => s !== null)
            // Tail any IDs not present in the orderedIds list (defensive).
            for (const s of t.subtasks) {
              if (!orderedIds.includes(s.id)) {
                reordered.push({ ...s, sortOrder: reordered.length })
              }
            }
            return {
              ...t,
              subtasks: reordered,
              updatedAt: new Date().toISOString(),
            }
          }),
        )
      }),
    [],
  )

  const addComment = useCallback<DataStore['addComment']>(
    (taskId, content, mentions = []) =>
      withMutation(() => {
        const activity = pushActivity(taskId, 'comment', content, mentions)
        const task = tasksRef.current.find((t) => t.id === taskId)
        if (task?.assigneeId && task.assigneeId !== actorId) {
          pushNotification({
            recipientId: task.assigneeId,
            type: 'comment',
            taskId,
          })
        }
        mentions.forEach((mentionedId) => {
          if (mentionedId !== actorId) {
            pushNotification({
              recipientId: mentionedId,
              type: 'mention',
              taskId,
            })
          }
        })
        if (task) {
          emitDiscord('comment_posted', () =>
            buildCommentPostedEmbed({
              task,
              authorName: memberName(teamMembersRef.current, actorId),
              comment: content,
            }),
          )
        }
        return activity
      }),
    [actorId, pushActivity, pushNotification, emitDiscord],
  )

  const inviteTeamMember = useCallback<DataStore['inviteTeamMember']>(
    (input) =>
      withMutation(() => {
        const member: TeamMember = {
          id: uid('member'),
          name: input.name,
          email: input.email,
          role: input.role,
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        }
        setTeamMembers((prev) => [...prev, member])
        return member
      }),
    [],
  )

  const removeTeamMember = useCallback<DataStore['removeTeamMember']>(
    (id) =>
      withMutation(() => {
        setTeamMembers((prev) => prev.filter((m) => m.id !== id))
        // Cascade: unassign tasks + subtasks; drop their notifications.
        setTasks((prev) =>
          prev.map((t) => ({
            ...t,
            assigneeId: t.assigneeId === id ? null : t.assigneeId,
            subtasks: t.subtasks.map((s) => ({
              ...s,
              assigneeId: s.assigneeId === id ? null : s.assigneeId,
            })),
          })),
        )
        setNotifications((prev) => prev.filter((n) => n.recipientId !== id))
        // Strip from project member lists.
        setProjects((prev) =>
          prev.map((p) =>
            p.memberIds.includes(id)
              ? { ...p, memberIds: p.memberIds.filter((mid) => mid !== id) }
              : p,
          ),
        )
      }),
    [],
  )

  const updateTeamMember = useCallback<DataStore['updateTeamMember']>(
    (id, patch) =>
      withMutation(() => {
        setTeamMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        )
      }),
    [],
  )

  const createTag = useCallback<DataStore['createTag']>(
    (input) =>
      withMutation(() => {
        const tag: Tag = {
          id: uid('tag'),
          name: input.name,
          color: input.color,
        }
        setTags((prev) => [...prev, tag])
        return tag
      }),
    [],
  )

  const updateTag = useCallback<DataStore['updateTag']>(
    (id, patch) =>
      withMutation(() => {
        setTags((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        )
      }),
    [],
  )

  const deleteTag = useCallback<DataStore['deleteTag']>(
    (id) =>
      withMutation(() => {
        setTags((prev) => prev.filter((t) => t.id !== id))
        // Cascade: strip the tag ID from every task that references it.
        setTasks((prev) =>
          prev.map((t) =>
            t.tags.includes(id)
              ? { ...t, tags: t.tags.filter((tid) => tid !== id) }
              : t,
          ),
        )
      }),
    [],
  )

  const markNotificationRead = useCallback<DataStore['markNotificationRead']>(
    (id) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      )
    },
    [],
  )

  const markAllNotificationsRead = useCallback<
    DataStore['markAllNotificationsRead']
  >((recipientId) => {
    setNotifications((prev) =>
      prev.map((n) =>
        !recipientId || n.recipientId === recipientId ? { ...n, read: true } : n,
      ),
    )
  }, [])

  const value = useMemo<DataStore>(
    () => ({
      teamMembers,
      projects,
      tasks,
      tags,
      activities,
      notifications,
      mutating: inflight > 0,
      workspaceName,
      statusLabels,
      columnOrder,
      setWorkspaceName,
      setStatusLabel,
      setColumnOrder,
      discordSettings,
      setDiscordSettings,
      testDiscordWebhook,
      createTask,
      updateTask,
      deleteTask,
      createProject,
      updateProject,
      deleteProject,
      createSubtask,
      toggleSubtask,
      updateSubtask,
      deleteSubtask,
      reorderSubtasks,
      addComment,
      addActivity: pushActivity,
      inviteTeamMember,
      removeTeamMember,
      updateTeamMember,
      createTag,
      updateTag,
      deleteTag,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      teamMembers,
      projects,
      tasks,
      tags,
      activities,
      notifications,
      inflight,
      workspaceName,
      statusLabels,
      columnOrder,
      setWorkspaceName,
      setStatusLabel,
      setColumnOrder,
      discordSettings,
      setDiscordSettings,
      testDiscordWebhook,
      createTask,
      updateTask,
      deleteTask,
      createProject,
      updateProject,
      deleteProject,
      createSubtask,
      toggleSubtask,
      updateSubtask,
      deleteSubtask,
      reorderSubtasks,
      addComment,
      pushActivity,
      inviteTeamMember,
      removeTeamMember,
      updateTeamMember,
      createTag,
      updateTag,
      deleteTag,
      markNotificationRead,
      markAllNotificationsRead,
    ],
  )

  return createElement(DataContext.Provider, { value }, children)
}

export function useData(): DataStore {
  const ctx = useContext(DataContext)
  if (!ctx) {
    throw new Error('useData must be used inside a <DataProvider>')
  }
  return ctx
}
