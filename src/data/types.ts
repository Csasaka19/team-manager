/**
 * Shared domain types. Field names mirror docs/product-spec.md exactly.
 * Date-time fields are stored as ISO 8601 strings; pure dates (dueDate) as
 * YYYY-MM-DD strings so they round-trip through JSON without timezone drift.
 */

export type Role = 'pm' | 'member'

export type Priority = 'critical' | 'high' | 'medium' | 'low'

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'

export type ActivityType =
  | 'status_change'
  | 'assignment'
  | 'comment'
  | 'creation'
  | 'subtask_complete'
  | 'priority_change'

export type NotificationType =
  | 'assigned'
  | 'comment'
  | 'mention'
  | 'status_change'
  | 'due_tomorrow'
  | 'overdue'

export interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl: string | null
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  memberIds: string[]
  archived: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  assigneeId: string | null
  done: boolean
  sortOrder: number
  createdAt: string
  completedAt: string | null
}

export interface Task {
  id: string
  title: string
  description: string
  projectId: string
  assigneeId: string | null
  priority: Priority
  status: TaskStatus
  dueDate: string | null
  tags: string[]
  subtasks: Subtask[]
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface Activity {
  id: string
  taskId: string
  actorId: string
  type: ActivityType
  content: string
  mentions: string[]
  createdAt: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Notification {
  id: string
  recipientId: string
  type: NotificationType
  taskId: string
  actorId: string | null
  read: boolean
  createdAt: string
}

/** Display labels for the canonical task statuses (used in pills, columns, dropdowns). */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
