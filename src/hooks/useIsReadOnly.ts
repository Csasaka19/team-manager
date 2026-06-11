import { useData } from '@/data/store'

/**
 * "Is this entity managed in Atlas?" — true when the id is present in the
 * last raw API snapshot. The Atlas API is read-only, so any field on a
 * read-only entity that mirrors Atlas state can't safely be edited; the
 * UI either hides those edits or routes them through the local-overlay
 * (e.g. board status drag still works because we capture the change in
 * the overlay, but title/priority/assignee don't because those fields
 * aren't surfaced as an "official" local edit anywhere).
 *
 * In mock mode, every entity is locally-owned so this always returns false.
 *
 * Note on intent: the entity-level signal here is intentionally "did it
 * come from Atlas?", NOT "has it been edited locally?". A locally-touched
 * Atlas entity is still managed in Atlas — touching its status doesn't
 * make its title suddenly editable.
 */
export type ReadOnlyEntityType = 'task' | 'project' | 'meeting'

export function useIsReadOnly(
  entityType: ReadOnlyEntityType,
  entityId: string | undefined | null,
): boolean {
  const { snapshotIndex, dataSource } = useData()
  if (dataSource !== 'atlas') return false
  if (!entityId) return false
  if (entityType === 'task') return snapshotIndex.tasksById.has(entityId)
  if (entityType === 'project') return snapshotIndex.projectsById.has(entityId)
  if (entityType === 'meeting') return snapshotIndex.meetingsById.has(entityId)
  return false
}
