import { api } from './client';

export interface ChecklistItem {
  id: string;
  nodeId: string;
  text: string;
  done: boolean;
  order: number;
  createdAt: string;
}

export const checklistApi = {
  list: (nodeId: string) => api.get<ChecklistItem[]>(`/nodes/${nodeId}/checklist`),
  create: (nodeId: string, text: string) => api.post<ChecklistItem>(`/nodes/${nodeId}/checklist`, { text }),
  update: (id: string, data: { text?: string; done?: boolean }) =>
    api.patch<ChecklistItem>(`/checklist/${id}`, data),
  remove: (id: string) => api.delete<void>(`/checklist/${id}`),
  reorder: (nodeId: string, orderedIds: string[]) =>
    api.patch<ChecklistItem[]>(`/nodes/${nodeId}/checklist/reorder`, { orderedIds })
};
