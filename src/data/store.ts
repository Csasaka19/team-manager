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
  buildActionItemConvertedEmbed,
  buildBulkUpdateEmbed,
  buildCommentPostedEmbed,
  buildMeetingCompletedEmbed,
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
  applyOverlayList,
  emptyOverlay,
  loadFromAtlas,
  loadOverlay,
  mergeDiffIntoOverlay,
  saveOverlay,
  type AtlasSnapshot,
  type LocalOverlay,
} from './atlas-bridge'
import {
  ATLAS_CONFIG_CHANGED_EVENT,
  isAtlasConfigured,
} from '@/services/atlas/config'
import {
  mockActivities,
  mockMeetings,
  mockNotifications,
  mockProjects,
  mockTags,
  mockTasks,
  mockTeamMembers,
} from './mock-data'
import {
  STATUS_LABELS,
  type ActionItem,
  type Activity,
  type ActivityType,
  type CommentLabel,
  type Decision,
  type Meeting,
  type MeetingLink,
  type MeetingStatus,
  type Notification,
  type NotificationType,
  type Priority,
  type Project,
  type Role,
  type Subtask,
  type Tag,
  type Task,
  type TaskStatus,
  type TaskTemplate,
  type TeamMember,
} from './types'

const MUTATION_DELAY_MS = 800
const ATLAS_REFRESH_INTERVAL_MS = 60_000

/**
 * Brief artificial gate at provider mount so pages can render skeleton
 * loaders against a real signal. The mock data is otherwise synchronous,
 * which would make every page render instantly with no opportunity to
 * show a loading state.
 */
const INITIAL_LOAD_DELAY_MS = 500

const WORKSPACE_NAME_KEY = 'team-manager.workspace-name'
const STATUS_LABEL_OVERRIDES_KEY = 'team-manager.status-label-overrides'
const COLUMN_ORDER_KEY = 'team-manager.column-order'
const NOTIF_PREFS_PREFIX = 'team-manager.notif-prefs.'
const DISCORD_SETTINGS_KEY = 'team-manager.discord-settings'
const TASK_TEMPLATES_KEY = 'team-manager.task-templates'

const DEFAULT_WORKSPACE_NAME = 'Team Manager'
const DEFAULT_COLUMN_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

/**
 * Seeded templates shipped on first load. Once the user edits or deletes any,
 * the localStorage record takes over and these no longer reappear on refresh.
 * Deterministic IDs so the seeds don't drift across sessions.
 */
const DEFAULT_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tmpl-bug',
    name: 'Bug Report',
    title: 'Bug: [description]',
    description: '',
    priority: 'high',
    subtaskTitles: [
      'Reproduce the bug',
      'Identify root cause',
      'Implement fix',
      'Write regression test',
      'Verify fix in staging',
    ],
    tagNames: ['bug'],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-feature',
    name: 'Feature Request',
    title: '[Feature name]',
    description: '',
    priority: 'medium',
    subtaskTitles: [
      'Define requirements',
      'Design solution',
      'Implement',
      'Write tests',
      'Code review',
      'Deploy',
    ],
    tagNames: ['feature'],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-doc',
    name: 'Documentation',
    title: 'Document: [topic]',
    description: '',
    priority: 'low',
    subtaskTitles: ['Draft content', 'Peer review', 'Publish'],
    tagNames: ['documentation'],
    createdAt: '2026-05-01T00:00:00.000Z',
  },
]

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
  /** Subtask titles to materialize alongside the task — used by templates. */
  subtasks?: string[]
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

export interface AddCommentOptions {
  mentions?: string[]
  label?: CommentLabel
  /** When set, the new comment is a reply. Replies are normalized to one
   *  level deep — replying to an existing reply uses the reply's
   *  `parentCommentId` instead. */
  parentCommentId?: string | null
}

const PIN_LIMIT = 5

export interface CreateProjectInput {
  name: string
  description?: string
  color: string
  memberIds?: string[]
}

export interface CreateMeetingInput {
  title: string
  projectId: string
  date: string
  startTime?: string | null
  duration?: number | null
  attendeeIds?: string[]
  status?: MeetingStatus
  location?: string | null
  agenda?: string | null
  notes?: string
}

/** Patch shape for `updateMeeting`. Sub-collections (decisions / action
 *  items / links) use replace-the-array semantics — callers compose the
 *  next list and pass it whole. */
export interface UpdateMeetingInput {
  title?: string
  date?: string
  startTime?: string | null
  duration?: number | null
  attendeeIds?: string[]
  status?: MeetingStatus
  location?: string | null
  agenda?: string | null
  notes?: string
  decisions?: Decision[]
  actionItems?: ActionItem[]
  links?: MeetingLink[]
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
  /** True for ~500 ms after the provider mounts — gives pages something to
   *  show a skeleton against. Real backend will replace this with the
   *  network loading state. */
  isInitialLoading: boolean
  // ── Atlas hybrid mode ────────────────────────────────────────────────
  /** Source of the visible data: 'mock' when the in-memory fixtures are
   *  authoritative, 'atlas' when the API is configured and reachable. */
  dataSource: 'mock' | 'atlas'
  /** ISO timestamp of the last successful Atlas snapshot, or null. */
  lastSynced: Date | null
  /** Human-readable error string from the most recent Atlas load, or null
   *  if the last load fully succeeded. Per-source failures during a partial
   *  load are joined with `;`. */
  syncError: string | null
  /** True while a background refresh is in flight (initial load uses
   *  `isInitialLoading` instead). */
  isRefreshing: boolean
  /** Force-refresh the Atlas snapshot. No-op in mock mode. */
  refreshFromAtlas: () => Promise<void>
  /** Task ids the user has touched locally — used by the board to render a
   *  "local change" indicator. Computed by diffing live tasks against the
   *  last raw Atlas snapshot; empty in mock mode. */
  locallyModifiedTaskIds: ReadonlySet<string>
  /** Lookup maps of the entities the last raw Atlas snapshot contained.
   *  Pages use these to ask "did this id originate from the API?" and to
   *  show what the API still says (e.g. the board's "Atlas still shows: X"
   *  tooltip on a locally-moved card). Empty maps in mock mode. */
  snapshotIndex: {
    tasksById: ReadonlyMap<string, Task>
    projectsById: ReadonlyMap<string, Project>
    meetingsById: ReadonlyMap<string, Meeting>
  }
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

  // Task templates (PM-managed)
  templates: TaskTemplate[]
  createTemplate: (
    input: Omit<TaskTemplate, 'id' | 'createdAt'>,
  ) => TaskTemplate
  updateTemplate: (
    id: string,
    patch: Partial<Omit<TaskTemplate, 'id' | 'createdAt'>>,
  ) => void
  deleteTemplate: (id: string) => void

  // Meetings — discussions tied to a project
  meetings: Meeting[]
  createMeeting: (input: CreateMeetingInput) => Promise<Meeting>
  updateMeeting: (id: string, patch: UpdateMeetingInput) => Promise<Meeting>
  deleteMeeting: (id: string) => Promise<void>
  /**
   * Turn an action item into a full Task. Copies text, assignee, due date,
   * inherits the meeting's project. Sets `linkedTaskId` on the action item
   * AND `sourceMeetingId` / `sourceActionItemId` on the task for the back-
   * link banner. Pushes a `creation` activity describing the conversion
   * and (if enabled) fires the action-item-converted Discord embed.
   */
  convertActionItemToTask: (
    meetingId: string,
    actionItemId: string,
  ) => Promise<Task>

  // Task CRUD
  createTask: (input: CreateTaskInput) => Promise<Task>
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  /**
   * Apply the same patch to every task in `ids`. Activity/notification side
   * effects fire per task (matching single-update); Discord emits ONE summary
   * message scoped to the patch's primary field (status / assignee).
   */
  bulkUpdateTasks: (ids: string[], patch: UpdateTaskInput) => Promise<void>
  bulkDeleteTasks: (ids: string[]) => Promise<void>

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
    options?: AddCommentOptions,
  ) => Promise<Activity>
  addActivity: (
    taskId: string,
    type: ActivityType,
    content: string,
    mentions?: string[],
  ) => Activity
  /** Pin a comment to the task. Throws if the task already has 5 pinned. */
  pinComment: (commentId: string) => Promise<void>
  unpinComment: (commentId: string) => Promise<void>
  /** Toggle a question comment's `resolved` flag. */
  setQuestionResolved: (
    commentId: string,
    resolved: boolean,
  ) => Promise<void>
  /** Delete a comment and (if it has any) all its replies. */
  deleteCommentWithReplies: (commentId: string) => Promise<void>

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
  const { currentUser, logout } = useAuth()
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(mockTeamMembers)
  const [tags, setTags] = useState<Tag[]>(mockTags)
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [tasks, setTasks] = useState<Task[]>(mockTasks)
  const [activities, setActivities] = useState<Activity[]>(mockActivities)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [meetings, setMeetings] = useState<Meeting[]>(mockMeetings)
  const [inflight, setInflight] = useState(0)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  // ── Atlas hybrid mode state ──────────────────────────────────────────
  // `dataSource` flips to 'atlas' on first successful load; mutations stay
  // local either way but, in 'atlas' mode, are diffed against the last raw
  // API snapshot and persisted to the localStorage overlay so they survive
  // the 60s refresh.
  const [dataSource, setDataSource] = useState<'mock' | 'atlas'>('mock')
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [snapshotIndex, setSnapshotIndex] = useState<{
    tasksById: ReadonlyMap<string, Task>
    projectsById: ReadonlyMap<string, Project>
    meetingsById: ReadonlyMap<string, Meeting>
  }>(() => ({
    tasksById: new Map(),
    projectsById: new Map(),
    meetingsById: new Map(),
  }))
  /** Raw API snapshot from the most recent successful load. The OVERLAY is
   *  derived by diffing live state against this — any entity whose
   *  reference no longer matches the snapshot's was touched locally. */
  const snapshotRef = useRef<AtlasSnapshot | null>(null)
  /** Local overlay, persisted to localStorage on every save. */
  const overlayRef = useRef<LocalOverlay>(emptyOverlay())

  useEffect(() => {
    // Read the persisted overlay once on mount so reloads keep local changes.
    overlayRef.current = loadOverlay()
  }, [])

  useEffect(() => {
    // Mock-mode initial-loading skeleton. In Atlas mode the loader below
    // owns this flag instead.
    if (isAtlasConfigured()) return
    const handle = window.setTimeout(
      () => setIsInitialLoading(false),
      INITIAL_LOAD_DELAY_MS,
    )
    return () => window.clearTimeout(handle)
  }, [])

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

  // Task templates — seeded on first load. Once the user has touched them
  // (edit or delete), the localStorage record takes over and the seed array
  // is no longer consulted, so deletions stay deleted across refreshes.
  const [templates, setTemplatesState] = useState<TaskTemplate[]>(() =>
    loadJSON<TaskTemplate[]>(TASK_TEMPLATES_KEY, DEFAULT_TASK_TEMPLATES),
  )

  const persistTemplates = useCallback((next: TaskTemplate[]) => {
    setTemplatesState(next)
    saveJSON(TASK_TEMPLATES_KEY, next)
  }, [])

  const createTemplate = useCallback<DataStore['createTemplate']>(
    (input) => {
      const template: TaskTemplate = {
        id: uid('tmpl'),
        createdAt: new Date().toISOString(),
        ...input,
      }
      persistTemplates([...templates, template])
      return template
    },
    [templates, persistTemplates],
  )

  const updateTemplate = useCallback<DataStore['updateTemplate']>(
    (id, patch) => {
      persistTemplates(
        templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
    },
    [templates, persistTemplates],
  )

  const deleteTemplate = useCallback<DataStore['deleteTemplate']>(
    (id) => {
      persistTemplates(templates.filter((t) => t.id !== id))
    },
    [templates, persistTemplates],
  )

  const actorId = currentUser?.id ?? 'system'

  /** Subset of Activity fields callers can pass to enrich a feed entry. */
  type ActivityMetadata = Partial<
    Pick<
      Activity,
      | 'fromValue'
      | 'toValue'
      | 'fromMemberId'
      | 'toMemberId'
      | 'subtaskTitle'
      | 'taskTitle'
      | 'projectId'
      | 'memberId'
      | 'parentCommentId'
      | 'commentLabel'
      | 'isPinned'
      | 'pinnedBy'
      | 'resolved'
    >
  >

  /** Push a synthetic Activity entry (used both by external callers and by mutations). */
  const pushActivity = useCallback(
    (
      taskId: string | null,
      type: ActivityType,
      content: string,
      mentions: string[] = [],
      metadata: ActivityMetadata = {},
    ): Activity => {
      const entry: Activity = {
        id: uid('act'),
        taskId,
        actorId,
        type,
        content,
        mentions,
        createdAt: new Date().toISOString(),
        ...metadata,
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
  const activitiesRef = useRef(activities)

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
  useEffect(() => {
    activitiesRef.current = activities
  }, [activities])

  // Atlas refresh reads live state via refs so it can run inside an
  // interval without churning callback dependencies. Meetings already have
  // their own ref further down (line ~1500); we mirror it here as well so
  // the refresh loop doesn't need to know about file layout.
  const atlasMeetingsRef = useRef(meetings)
  useEffect(() => {
    atlasMeetingsRef.current = meetings
  }, [meetings])

  // ── Atlas hybrid loader ────────────────────────────────────────────────
  // `runAtlasLoad` is the single source of truth for "go fetch and merge":
  // mount, the 60s interval, manual refresh, and Settings save all funnel
  // through it. Pure setters + refs mean it doesn't change identity.
  const runAtlasLoad = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!isAtlasConfigured()) {
        setDataSource('mock')
        setLastSynced(null)
        setSyncError(null)
        setSnapshotIndex({
          tasksById: new Map(),
          projectsById: new Map(),
          meetingsById: new Map(),
        })
        // Mock-mode initial-loading is handled by the 500ms setTimeout
        // effect above — keep the skeleton visible the same way it was.
        return
      }
      setDataSource('atlas')
      if (mode === 'initial') setIsInitialLoading(true)
      setIsRefreshing(true)
      try {
        const snapshot = await loadFromAtlas({
          // Manifests rarely change between refreshes; we only enumerate
          // them on the initial load (or manual refresh) to keep the
          // 60-second tick under one request fan-out.
          includeMeetings: mode === 'initial',
        })
        const overlay = overlayRef.current
        const prevSnap = snapshotRef.current
        let nextOverlay = overlay
        // Capture any local changes since the previous snapshot BEFORE we
        // replace the snapshot reference.
        if (prevSnap) {
          nextOverlay = mergeDiffIntoOverlay(
            overlay,
            tasksRef.current,
            activitiesRef.current,
            projectsRef.current,
            atlasMeetingsRef.current,
            prevSnap,
          )
          overlayRef.current = nextOverlay
          saveOverlay(nextOverlay)
        }
        // Mutate the snapshot ref: keep meetings from the previous snapshot
        // on a refresh-without-meetings; replace everything on initial.
        const mergedSnapshot: AtlasSnapshot =
          mode === 'initial' || !prevSnap
            ? snapshot
            : { ...snapshot, meetings: prevSnap.meetings }
        snapshotRef.current = mergedSnapshot
        // Apply overlay on top of the raw snapshot and push to live state.
        setTasks(
          applyOverlayList(
            mergedSnapshot.tasks,
            nextOverlay.tasks,
            nextOverlay.taskTombstones,
          ),
        )
        setActivities(
          applyOverlayList(
            mergedSnapshot.activities,
            nextOverlay.activities,
            nextOverlay.activityTombstones,
          ),
        )
        setProjects(
          applyOverlayList(
            mergedSnapshot.projects,
            nextOverlay.projects,
            nextOverlay.projectTombstones,
          ),
        )
        setMeetings(
          applyOverlayList(
            mergedSnapshot.meetings,
            nextOverlay.meetings,
            nextOverlay.meetingTombstones,
          ),
        )
        setTeamMembers(mergedSnapshot.teamMembers)
        setSnapshotIndex({
          tasksById: new Map(mergedSnapshot.tasks.map((t) => [t.id, t])),
          projectsById: new Map(mergedSnapshot.projects.map((p) => [p.id, p])),
          meetingsById: new Map(mergedSnapshot.meetings.map((m) => [m.id, m])),
        })
        setLastSynced(new Date(mergedSnapshot.loadedAt))
        setSyncError(
          mergedSnapshot.errors.length > 0
            ? mergedSnapshot.errors
                .map((e) => `${e.source}: ${e.message}`)
                .join('; ')
            : null,
        )
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : String(err))
      } finally {
        if (mode === 'initial') setIsInitialLoading(false)
        setIsRefreshing(false)
      }
    },
    [],
  )

  // Initial Atlas load + react to Settings → Atlas API saves (which fire
  // ATLAS_CONFIG_CHANGED_EVENT). In mock mode this is a no-op apart from
  // setting dataSource correctly.
  useEffect(() => {
    void runAtlasLoad('initial')
    const handler = () => {
      void runAtlasLoad('initial')
    }
    window.addEventListener(ATLAS_CONFIG_CHANGED_EVENT, handler)
    return () => window.removeEventListener(ATLAS_CONFIG_CHANGED_EVENT, handler)
  }, [runAtlasLoad])

  // 60-second auto-refresh. Only runs in Atlas mode; tears down when
  // mode flips back to mock (config cleared).
  useEffect(() => {
    if (dataSource !== 'atlas') return
    const id = window.setInterval(() => {
      void runAtlasLoad('refresh')
    }, ATLAS_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [dataSource, runAtlasLoad])

  const refreshFromAtlas = useCallback(async () => {
    await runAtlasLoad('refresh')
  }, [runAtlasLoad])

  // Derive the locally-modified task id set every time tasks change in
  // atlas mode. Reference equality against the last raw snapshot is the
  // same signal the overlay diff uses — keeps the indicator in sync with
  // what would be persisted on the next refresh.
  const locallyModifiedTaskIds = useMemo<ReadonlySet<string>>(() => {
    if (dataSource !== 'atlas') return new Set<string>()
    const snap = snapshotRef.current
    if (!snap) return new Set<string>()
    const snapById = new Map(snap.tasks.map((t) => [t.id, t]))
    const out = new Set<string>()
    for (const t of tasks) {
      if (snapById.get(t.id) !== t) out.add(t.id)
    }
    return out
  }, [tasks, dataSource])

  // When Atlas mode kicks in, the team list flips from mock to API-derived.
  // A previously-logged-in mock user (e.g. `pm-1`) will no longer match
  // anyone in the new team, leaving the UI showing a ghost user. Log them
  // out so they re-pick from the Atlas dropdown.
  useEffect(() => {
    if (dataSource !== 'atlas') return
    if (!currentUser) return
    // Only enforce after the team list is populated — otherwise we'd log
    // out during the brief gap while the snapshot is still loading.
    if (teamMembers.length === 0) return
    if (!teamMembers.some((m) => m.id === currentUser.id)) {
      logout()
    }
  }, [dataSource, teamMembers, currentUser, logout])

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
        const taskId = uid('task')
        // Subtasks from a template / batch creation materialize on the same
        // task in a single setTasks call so the 800 ms mutation delay fires
        // once. They deliberately do NOT emit individual subtask_created
        // activity entries — the parent creation activity covers them.
        const initialSubtasks: Subtask[] = (input.subtasks ?? [])
          .map((title) => title.trim())
          .filter((title) => title.length > 0)
          .map((title, idx) => ({
            id: uid('sub'),
            taskId,
            title,
            assigneeId: null,
            done: false,
            sortOrder: idx,
            createdAt: now,
            completedAt: null,
          }))
        const task: Task = {
          id: taskId,
          title: input.title,
          description: input.description ?? '',
          projectId: input.projectId,
          assigneeId: input.assigneeId ?? null,
          priority: input.priority ?? 'medium',
          status: input.status ?? 'todo',
          dueDate: input.dueDate ?? null,
          tags: input.tags ?? [],
          subtasks: initialSubtasks,
          createdAt: now,
          updatedAt: now,
          createdBy: actorId,
        }
        setTasks((prev) => [...prev, task])
        pushActivity(task.id, 'creation', 'created this task', [], {
          projectId: task.projectId,
          taskTitle: task.title,
        })
        if (task.assigneeId) {
          pushActivity(
            task.id,
            'assignment',
            `assigned this to ${memberName(teamMembers, task.assigneeId)}`,
            [],
            { fromMemberId: null, toMemberId: task.assigneeId },
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
            `moved this from ${statusLabels[prev.status]} to ${statusLabels[patch.status]}`,
            [],
            {
              fromValue: statusLabels[prev.status],
              toValue: statusLabels[patch.status],
            },
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
            [],
            {
              fromMemberId: prev.assigneeId,
              toMemberId: patch.assigneeId,
            },
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
            `set priority from ${prev.priority} to ${patch.priority}`,
            [],
            {
              fromValue: prev.priority,
              toValue: patch.priority,
            },
          )
        }
        if (
          patch.dueDate !== undefined &&
          patch.dueDate !== prev.dueDate
        ) {
          pushActivity(
            id,
            'due_date_change',
            patch.dueDate
              ? `set due date to ${patch.dueDate}`
              : 'cleared the due date',
            [],
            {
              fromValue: prev.dueDate ?? undefined,
              toValue: patch.dueDate ?? undefined,
            },
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
        // Snapshot the title BEFORE removal so the activity entry — which
        // survives in the feed — still has something to display.
        const snapshot = tasksRef.current.find((t) => t.id === id)
        setTasks((prev) => prev.filter((t) => t.id !== id))
        // Keep this task's existing activities; just append the deletion
        // marker. The dashboard feed will show "Alex deleted 'Foo'" alongside
        // any prior history.
        setNotifications((prev) => prev.filter((n) => n.taskId !== id))
        if (snapshot) {
          pushActivity(
            null,
            'task_deleted',
            `deleted task "${snapshot.title}"`,
            [],
            { taskTitle: snapshot.title, projectId: snapshot.projectId },
          )
        }
      }),
    [pushActivity],
  )

  const bulkUpdateTasks = useCallback<DataStore['bulkUpdateTasks']>(
    (ids, patch) =>
      withMutation(() => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        // Snapshot the previous tasks once so per-task side effects (activity /
        // notification / decision-making for Discord) see consistent state.
        const prevTasks = tasksRef.current.filter((t) => idSet.has(t.id))
        const updatedAt = new Date().toISOString()

        setTasks((cur) =>
          cur.map((t) =>
            idSet.has(t.id) ? { ...t, ...patch, updatedAt } : t,
          ),
        )

        const actorName = memberName(teamMembersRef.current, actorId)

        // Per-task activity + notifications (same as single updateTask).
        for (const prev of prevTasks) {
          if (patch.status !== undefined && patch.status !== prev.status) {
            pushActivity(
              prev.id,
              'status_change',
              `moved this from ${statusLabels[prev.status]} to ${statusLabels[patch.status]}`,
              [],
              {
                fromValue: statusLabels[prev.status],
                toValue: statusLabels[patch.status],
              },
            )
            if (prev.assigneeId && prev.assigneeId !== actorId) {
              pushNotification({
                recipientId: prev.assigneeId,
                type: 'status_change',
                taskId: prev.id,
              })
            }
          }
          if (
            patch.assigneeId !== undefined &&
            patch.assigneeId !== prev.assigneeId
          ) {
            pushActivity(
              prev.id,
              'assignment',
              patch.assigneeId
                ? `assigned this to ${memberName(teamMembers, patch.assigneeId)}`
                : 'unassigned this task',
              [],
              {
                fromMemberId: prev.assigneeId,
                toMemberId: patch.assigneeId,
              },
            )
            if (patch.assigneeId) {
              pushNotification({
                recipientId: patch.assigneeId,
                type: 'assigned',
                taskId: prev.id,
              })
            }
          }
          if (patch.priority !== undefined && patch.priority !== prev.priority) {
            pushActivity(
              prev.id,
              'priority_change',
              `set priority from ${prev.priority} to ${patch.priority}`,
              [],
              { fromValue: prev.priority, toValue: patch.priority },
            )
          }
          if (
            patch.dueDate !== undefined &&
            patch.dueDate !== prev.dueDate
          ) {
            pushActivity(
              prev.id,
              'due_date_change',
              patch.dueDate
                ? `set due date to ${patch.dueDate}`
                : 'cleared the due date',
              [],
              {
                fromValue: prev.dueDate ?? undefined,
                toValue: patch.dueDate ?? undefined,
              },
            )
          }
        }

        // ONE Discord summary, gated by the most-specific event toggle.
        const affectedCount = prevTasks.length
        if (
          patch.status === 'done' &&
          prevTasks.some((t) => t.status !== 'done')
        ) {
          emitDiscord('task_completed', () =>
            buildBulkUpdateEmbed({
              action: 'completed',
              count: affectedCount,
              actorName,
            }),
          )
        } else if (patch.status !== undefined) {
          emitDiscord('task_status_changed', () =>
            buildBulkUpdateEmbed({
              action: 'status',
              count: affectedCount,
              actorName,
              toStatusLabel: statusLabelsRef.current[patch.status!],
            }),
          )
        } else if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
          emitDiscord('task_assigned', () =>
            buildBulkUpdateEmbed({
              action: 'assignee',
              count: affectedCount,
              actorName,
              assigneeName: memberName(
                teamMembersRef.current,
                patch.assigneeId,
              ),
            }),
          )
        }
        // priority, dueDate, unassign — no Discord summary (matches single-update behavior).
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

  const bulkDeleteTasks = useCallback<DataStore['bulkDeleteTasks']>(
    (ids) =>
      withMutation(() => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        setTasks((prev) => prev.filter((t) => !idSet.has(t.id)))
        setActivities((prev) =>
          prev.filter((a) => a.taskId === null || !idSet.has(a.taskId)),
        )
        setNotifications((prev) => prev.filter((n) => !idSet.has(n.taskId)))
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
        pushActivity(
          null,
          'project_created',
          `created project "${project.name}"`,
          [],
          { projectId: project.id },
        )
        return project
      }),
    [actorId, pushActivity],
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
            acts.filter(
              (a) => a.taskId === null || !removedTaskIds.has(a.taskId),
            ),
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
        // Skip the activity entry for empty-title placeholders — those come
        // from the Tab-to-create rapid entry flow on the task detail page,
        // and emitting "added subtask \"\"" each time pollutes the feed.
        if (title.trim().length > 0) {
          pushActivity(
            taskId,
            'subtask_created',
            `added subtask "${title}"`,
            [],
            { subtaskTitle: title },
          )
        }
        return created
      }),
    [pushActivity],
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
            [],
            { subtaskTitle: completedTitle },
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
    (taskId, content, options = {}) =>
      withMutation(() => {
        const mentions = options.mentions ?? []
        const label = options.label ?? 'note'

        // Normalize threading to 1 level deep — replying to a reply uses
        // the reply's parent so the tree never goes deeper.
        let parentCommentId: string | null = options.parentCommentId ?? null
        if (parentCommentId) {
          const parent = activitiesRef.current.find(
            (a) => a.id === parentCommentId,
          )
          if (parent?.parentCommentId) {
            parentCommentId = parent.parentCommentId
          }
        }

        const activity = pushActivity(taskId, 'comment', content, mentions, {
          commentLabel: label,
          parentCommentId,
          // Questions start unresolved; other labels don't carry the flag.
          ...(label === 'question' ? { resolved: false } : {}),
        })

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
              label,
            }),
          )
        }
        return activity
      }),
    [actorId, pushActivity, pushNotification, emitDiscord],
  )

  const pinComment = useCallback<DataStore['pinComment']>(
    (commentId) =>
      withMutation(() => {
        const target = activitiesRef.current.find((a) => a.id === commentId)
        if (!target || target.type !== 'comment') {
          throw new Error(`Comment ${commentId} not found`)
        }
        if (target.isPinned) return
        const pinnedForTask = activitiesRef.current.filter(
          (a) =>
            a.type === 'comment' &&
            a.taskId === target.taskId &&
            a.isPinned,
        ).length
        if (pinnedForTask >= PIN_LIMIT) {
          throw new Error(`Pin limit (${PIN_LIMIT}) reached`)
        }
        setActivities((prev) =>
          prev.map((a) =>
            a.id === commentId ? { ...a, isPinned: true, pinnedBy: actorId } : a,
          ),
        )
      }),
    [actorId],
  )

  const unpinComment = useCallback<DataStore['unpinComment']>(
    (commentId) =>
      withMutation(() => {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === commentId ? { ...a, isPinned: false, pinnedBy: null } : a,
          ),
        )
      }),
    [],
  )

  const setQuestionResolved = useCallback<DataStore['setQuestionResolved']>(
    (commentId, resolved) =>
      withMutation(() => {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === commentId && a.type === 'comment' && a.commentLabel === 'question'
              ? { ...a, resolved }
              : a,
          ),
        )
      }),
    [],
  )

  const deleteCommentWithReplies = useCallback<
    DataStore['deleteCommentWithReplies']
  >(
    (commentId) =>
      withMutation(() => {
        const target = activitiesRef.current.find((a) => a.id === commentId)
        if (!target) return
        // Collect IDs to remove: the comment itself + every reply to it.
        const removeIds = new Set([commentId])
        for (const a of activitiesRef.current) {
          if (a.parentCommentId === commentId) removeIds.add(a.id)
        }
        setActivities((prev) => prev.filter((a) => !removeIds.has(a.id)))
      }),
    [],
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
        pushActivity(
          null,
          'member_added',
          `added ${member.name} to the team`,
          [],
          { memberId: member.id },
        )
        return member
      }),
    [pushActivity],
  )

  const removeTeamMember = useCallback<DataStore['removeTeamMember']>(
    (id) =>
      withMutation(() => {
        const snapshot = teamMembersRef.current.find((m) => m.id === id)
        setTeamMembers((prev) => prev.filter((m) => m.id !== id))
        if (snapshot) {
          pushActivity(
            null,
            'member_removed',
            `removed ${snapshot.name} from the team`,
            [],
            { memberId: snapshot.id },
          )
        }
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
    [pushActivity],
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

  // ---- Meetings ----------------------------------------------------------
  const meetingsRef = useRef(meetings)
  useEffect(() => {
    meetingsRef.current = meetings
  }, [meetings])

  const createMeeting = useCallback<DataStore['createMeeting']>(
    (input) =>
      withMutation(() => {
        const now = new Date().toISOString()
        const meeting: Meeting = {
          id: uid('meet'),
          title: input.title,
          projectId: input.projectId,
          date: input.date,
          startTime: input.startTime ?? null,
          duration: input.duration ?? null,
          attendeeIds: input.attendeeIds ?? [],
          status: input.status ?? 'scheduled',
          location: input.location ?? null,
          agenda: input.agenda ?? null,
          notes: input.notes ?? '',
          decisions: [],
          actionItems: [],
          links: [],
          createdBy: actorId,
          createdAt: now,
          updatedAt: now,
          lastEditedBy: null,
          lastEditedAt: null,
        }
        setMeetings((prev) => [...prev, meeting])
        return meeting
      }),
    [actorId],
  )

  const updateMeeting = useCallback<DataStore['updateMeeting']>(
    (id, patch) =>
      withMutation(() => {
        const prev = meetingsRef.current.find((m) => m.id === id)
        if (!prev) throw new Error(`Meeting ${id} not found`)
        const now = new Date().toISOString()
        // Notes-edit also bumps `lastEditedBy/At` for the "Last edited by"
        // indicator. Other field changes don't — they're metadata, not
        // discussion content.
        const notesChanged =
          patch.notes !== undefined && patch.notes !== prev.notes
        const next: Meeting = {
          ...prev,
          ...patch,
          updatedAt: now,
          ...(notesChanged
            ? { lastEditedBy: actorId, lastEditedAt: now }
            : {}),
        }
        setMeetings((cur) => cur.map((m) => (m.id === id ? next : m)))

        // Discord: fire the completed-summary embed when status flips
        // INTO `completed`. Gated by the existing task_status_changed
        // toggle so meetings ride the same notification stream.
        if (
          patch.status === 'completed' &&
          prev.status !== 'completed'
        ) {
          emitDiscord('task_status_changed', () =>
            buildMeetingCompletedEmbed({
              meeting: next,
              project: projectsRef.current.find(
                (p) => p.id === next.projectId,
              ),
              attendeeNames: next.attendeeIds
                .map((mid) => teamMembersRef.current.find((m) => m.id === mid)?.name)
                .filter((n): n is string => Boolean(n)),
            }),
          )
        }
        return next
      }),
    [actorId, emitDiscord],
  )

  const deleteMeeting = useCallback<DataStore['deleteMeeting']>(
    (id) =>
      withMutation(() => {
        setMeetings((prev) => prev.filter((m) => m.id !== id))
        // Tasks that referenced this meeting via sourceMeetingId stay
        // alive — they're independent now. The task-detail banner falls
        // back to "Source meeting was deleted" when the lookup misses.
      }),
    [],
  )

  const convertActionItemToTask = useCallback<
    DataStore['convertActionItemToTask']
  >(
    async (meetingId, actionItemId) => {
      const meeting = meetingsRef.current.find((m) => m.id === meetingId)
      if (!meeting) throw new Error(`Meeting ${meetingId} not found`)
      const item = meeting.actionItems.find((a) => a.id === actionItemId)
      if (!item) throw new Error(`Action item ${actionItemId} not found`)
      if (item.linkedTaskId) {
        // Already linked — return the existing task.
        const existing = tasksRef.current.find((t) => t.id === item.linkedTaskId)
        if (existing) return existing
      }

      // createTask runs withMutation, so the artificial 800ms delay fires
      // once for the whole conversion. After it resolves, we patch the
      // task's source fields, link the action item, and emit the Discord
      // embed + activity.
      const task = await createTask({
        title: item.text,
        projectId: meeting.projectId,
        assigneeId: item.assigneeId,
        dueDate: item.dueDate,
      })

      // Patch source fields on the freshly-created task. createTask doesn't
      // know about these (they're meeting-specific).
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                sourceMeetingId: meetingId,
                sourceActionItemId: actionItemId,
              }
            : t,
        ),
      )

      // Mark the action item as linked.
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                actionItems: m.actionItems.map((a) =>
                  a.id === actionItemId ? { ...a, linkedTaskId: task.id } : a,
                ),
                updatedAt: new Date().toISOString(),
              }
            : m,
        ),
      )

      // Activity: "[Actor] created task '[Title]' from meeting '[Meeting]'"
      pushActivity(
        task.id,
        'creation',
        `created from meeting "${meeting.title}"`,
        [],
        { taskTitle: task.title },
      )

      // Discord — gated by task_created toggle (it IS a new task, after all).
      emitDiscord('task_created', () =>
        buildActionItemConvertedEmbed({
          actionItemText: item.text,
          meetingTitle: meeting.title,
          assigneeName: item.assigneeId
            ? memberName(teamMembersRef.current, item.assigneeId)
            : 'Unassigned',
          dueDate: item.dueDate,
        }),
      )

      return { ...task, sourceMeetingId: meetingId, sourceActionItemId: actionItemId }
    },
    [createTask, emitDiscord, pushActivity],
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
      isInitialLoading,
      dataSource,
      lastSynced,
      syncError,
      isRefreshing,
      refreshFromAtlas,
      locallyModifiedTaskIds,
      snapshotIndex,
      workspaceName,
      statusLabels,
      columnOrder,
      setWorkspaceName,
      setStatusLabel,
      setColumnOrder,
      discordSettings,
      setDiscordSettings,
      testDiscordWebhook,
      templates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      meetings,
      createMeeting,
      updateMeeting,
      deleteMeeting,
      convertActionItemToTask,
      createTask,
      updateTask,
      deleteTask,
      bulkUpdateTasks,
      bulkDeleteTasks,
      createProject,
      updateProject,
      deleteProject,
      createSubtask,
      toggleSubtask,
      updateSubtask,
      deleteSubtask,
      reorderSubtasks,
      addComment,
      pinComment,
      unpinComment,
      setQuestionResolved,
      deleteCommentWithReplies,
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
      isInitialLoading,
      dataSource,
      lastSynced,
      syncError,
      isRefreshing,
      refreshFromAtlas,
      locallyModifiedTaskIds,
      snapshotIndex,
      workspaceName,
      statusLabels,
      columnOrder,
      setWorkspaceName,
      setStatusLabel,
      setColumnOrder,
      discordSettings,
      setDiscordSettings,
      testDiscordWebhook,
      templates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      meetings,
      createMeeting,
      updateMeeting,
      deleteMeeting,
      convertActionItemToTask,
      createTask,
      updateTask,
      deleteTask,
      bulkUpdateTasks,
      bulkDeleteTasks,
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
