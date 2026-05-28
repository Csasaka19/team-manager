/**
 * Discord webhook integration.
 *
 * In production this should run through your own backend so the webhook URL
 * (which contains a secret token) never lives in the browser. The send
 * function here is structured so swapping to a proxy is a one-line change:
 * point it at your `/api/discord-relay` endpoint instead of the raw
 * `https://discord.com/api/webhooks/…` URL.
 *
 * Notes on browser-to-Discord delivery: Discord's webhook endpoints DO send
 * CORS headers for browser POSTs, so the direct fetch usually works in
 * practice. We still fire-and-forget and only log failures — Discord being
 * unreachable should never block UI flow.
 */

import {
  PRIORITY_LABELS,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
  type TeamMember,
} from '@/data/types'

/** Events the workspace can choose to relay to Discord. */
export type DiscordEvent =
  | 'task_created'
  | 'task_status_changed'
  | 'task_assigned'
  | 'task_completed'
  | 'task_overdue'
  | 'comment_posted'

export interface DiscordSettings {
  webhookUrl: string
  channelName: string
  events: Record<DiscordEvent, boolean>
}

export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = {
  webhookUrl: '',
  channelName: '',
  events: {
    task_created: true,
    task_status_changed: true,
    task_assigned: true,
    task_completed: true,
    task_overdue: false,
    comment_posted: false,
  },
}

export interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordEmbed {
  title?: string
  description?: string
  /** Decimal color value, e.g. `3447003` for blue. */
  color?: number
  fields?: DiscordEmbedField[]
  timestamp?: string
}

export interface DiscordWebhookBody {
  embeds: DiscordEmbed[]
  /** Plain-text content rendered above the embed. Optional. */
  content?: string
}

/** Colors used across embed builders — decimal because Discord wants ints. */
const COLOR = {
  blue: 3_447_003,
  purple: 10_181_046,
  green: 2_278_750,
  amber: 15_844_367,
  red: 15_158_332,
} as const

/**
 * POST a message to a Discord webhook URL (or a backend proxy that forwards
 * to one). Never throws — failures are console.warned. Callers should treat
 * this as fire-and-forget.
 *
 * To proxy through a backend in production, pass your relay endpoint as the
 * URL. The body shape is the same; your backend just forwards it to Discord
 * with the real webhook URL applied server-side.
 */
export async function sendDiscordWebhook(
  url: string,
  body: DiscordWebhookBody,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!url) {
    return { ok: false, error: 'No webhook URL configured.' }
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(
        `[discord] webhook returned ${response.status}: ${text || 'no body'}`,
      )
      return {
        ok: false,
        status: response.status,
        error: `Discord returned ${response.status}.`,
      }
    }
    return { ok: true, status: response.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[discord] webhook failed:', message)
    return { ok: false, error: message }
  }
}

// ----- Embed builders -------------------------------------------------------

const STATUS_LABEL_FALLBACK: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

/** Resolves a member ID to a display name, falling back gracefully. */
function memberName(members: TeamMember[], id: string | null | undefined): string {
  if (!id) return 'Unassigned'
  return members.find((m) => m.id === id)?.name ?? 'Unknown'
}

function priorityLabel(p: Priority): string {
  return PRIORITY_LABELS[p]
}

function dueLabel(iso: string | null): string {
  if (!iso) return 'No due date'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabelOf(
  status: TaskStatus,
  labels: Record<TaskStatus, string> | undefined,
): string {
  return labels?.[status] ?? STATUS_LABEL_FALLBACK[status]
}

export function buildTaskCreatedEmbed(args: {
  task: Task
  project: Project | undefined
  members: TeamMember[]
}): DiscordEmbed {
  return {
    title: '📋 New Task Created',
    description: args.task.title,
    color: COLOR.blue,
    fields: [
      {
        name: 'Project',
        value: args.project?.name ?? 'Unknown',
        inline: true,
      },
      {
        name: 'Priority',
        value: priorityLabel(args.task.priority),
        inline: true,
      },
      {
        name: 'Assigned to',
        value: memberName(args.members, args.task.assigneeId),
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildTaskStatusChangedEmbed(args: {
  task: Task
  fromStatus: TaskStatus
  toStatus: TaskStatus
  actorName: string
  statusLabels?: Record<TaskStatus, string>
}): DiscordEmbed {
  return {
    title: '🔄 Task Status Updated',
    description: args.task.title,
    color: COLOR.purple,
    fields: [
      {
        name: 'From',
        value: statusLabelOf(args.fromStatus, args.statusLabels),
        inline: true,
      },
      {
        name: 'To',
        value: statusLabelOf(args.toStatus, args.statusLabels),
        inline: true,
      },
      { name: 'By', value: args.actorName, inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildTaskCompletedEmbed(args: {
  task: Task
  project: Project | undefined
  actorName: string
}): DiscordEmbed {
  return {
    title: '✅ Task Completed',
    description: args.task.title,
    color: COLOR.green,
    fields: [
      {
        name: 'Project',
        value: args.project?.name ?? 'Unknown',
        inline: true,
      },
      { name: 'Completed by', value: args.actorName, inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildTaskAssignedEmbed(args: {
  task: Task
  assigneeName: string
}): DiscordEmbed {
  return {
    title: '👤 Task Assigned',
    description: args.task.title,
    color: COLOR.amber,
    fields: [
      { name: 'Assigned to', value: args.assigneeName, inline: true },
      {
        name: 'Priority',
        value: priorityLabel(args.task.priority),
        inline: true,
      },
      { name: 'Due', value: dueLabel(args.task.dueDate), inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function buildCommentPostedEmbed(args: {
  task: Task
  authorName: string
  comment: string
}): DiscordEmbed {
  const trimmed =
    args.comment.length > 200
      ? `${args.comment.slice(0, 200)}…`
      : args.comment
  return {
    title: '💬 New Comment',
    description: args.task.title,
    color: COLOR.blue,
    fields: [
      { name: 'By', value: args.authorName, inline: true },
      { name: 'Comment', value: trimmed, inline: false },
    ],
    timestamp: new Date().toISOString(),
  }
}

/**
 * Single summary embed for a bulk action on the board. The shape mirrors a
 * single-task event but the title leads with "Bulk update" and the field
 * names report a count instead of a single value.
 */
export function buildBulkUpdateEmbed(args: {
  /** Determines color + headline phrasing. */
  action: 'status' | 'completed' | 'assignee'
  count: number
  actorName: string
  /** For status/completed actions. */
  toStatusLabel?: string
  /** For assignee action. `null` means "Unassigned". */
  assigneeName?: string | null
}): DiscordEmbed {
  if (args.action === 'completed') {
    return {
      title: '✅ Bulk update: tasks completed',
      description: `${args.count} task${args.count === 1 ? '' : 's'} moved to Done by ${args.actorName}`,
      color: COLOR.green,
      fields: [
        { name: 'Count', value: String(args.count), inline: true },
        { name: 'By', value: args.actorName, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }
  }
  if (args.action === 'assignee') {
    const name = args.assigneeName ?? 'Unassigned'
    return {
      title: '👤 Bulk update: tasks assigned',
      description: `${args.count} task${args.count === 1 ? '' : 's'} assigned to ${name} by ${args.actorName}`,
      color: COLOR.amber,
      fields: [
        { name: 'Count', value: String(args.count), inline: true },
        { name: 'Assigned to', value: name, inline: true },
        { name: 'By', value: args.actorName, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }
  }
  // 'status'
  return {
    title: '🔄 Bulk update: status changed',
    description: `${args.count} task${args.count === 1 ? '' : 's'} moved to ${args.toStatusLabel ?? 'a new column'} by ${args.actorName}`,
    color: COLOR.purple,
    fields: [
      { name: 'Count', value: String(args.count), inline: true },
      {
        name: 'To',
        value: args.toStatusLabel ?? 'Unknown',
        inline: true,
      },
      { name: 'By', value: args.actorName, inline: true },
    ],
    timestamp: new Date().toISOString(),
  }
}

/** Sample embed used by the "Test webhook" button in Settings. */
export function buildTestEmbed(workspaceName: string): DiscordEmbed {
  return {
    title: '✅ Webhook connected',
    description: `Team Manager (\`${workspaceName}\`) is now sending events to this channel.`,
    color: COLOR.green,
    fields: [
      {
        name: 'Tip',
        value: 'Pick which events get relayed in Settings → Discord Integration.',
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
  }
}
