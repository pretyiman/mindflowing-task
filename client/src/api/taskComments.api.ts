import { api } from './client';

export interface TaskComment {
  id: string;
  nodeId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; email: string; name: string | null } | null;
}

export const taskCommentsApi = {
  list: (nodeId: string) => api.get<TaskComment[]>(`/nodes/${nodeId}/comments`),
  create: (nodeId: string, body: string) => api.post<TaskComment>(`/nodes/${nodeId}/comments`, { body }),
  remove: (id: string) => api.delete<void>(`/comments/${id}`)
};
