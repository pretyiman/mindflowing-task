import { api } from './client';
import type { TaskStatus, TaskStatusKind } from '../types/graph';

export const taskStatusesApi = {
  list: (mapId: string) => api.get<TaskStatus[]>(`/maps/${mapId}/task-statuses`),
  create: (mapId: string, data: { name: string; color?: string; order?: number; kind?: TaskStatusKind }) =>
    api.post<TaskStatus>(`/maps/${mapId}/task-statuses`, data),
  update: (id: string, data: Partial<{ name: string; color: string; order: number; kind: TaskStatusKind }>) =>
    api.patch<TaskStatus>(`/task-statuses/${id}`, data),
  remove: (id: string, force = false) =>
    api.delete<void>(`/task-statuses/${id}${force ? '?force=true' : ''}`)
};
