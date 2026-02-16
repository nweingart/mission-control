import type { BacklogItem, Sprint, SprintStatus } from '../types';

export type BacklogStatus = 'todo' | 'in_progress' | 'done';

export function sprintStatusToBacklogStatus(sprintStatus: SprintStatus): BacklogStatus {
  switch (sprintStatus) {
    case 'planning': return 'todo';
    case 'active': return 'in_progress';
    case 'completed': return 'done';
  }
}

export function getBacklogItemStatus(item: BacklogItem, sprints: Sprint[]): BacklogStatus {
  if (!item.sprintId) return 'todo';
  const sprint = sprints.find((s) => s.id === item.sprintId);
  if (!sprint) return 'todo';
  return sprintStatusToBacklogStatus(sprint.status);
}
