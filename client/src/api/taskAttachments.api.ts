import { api } from './client';

export interface TaskAttachment {
  id: string;
  nodeId: string;
  uploaderId: string | null;
  name: string;
  url: string;
  createdAt: string;
  uploader: { id: string; email: string; name: string | null } | null;
}

export const taskAttachmentsApi = {
  list: (nodeId: string) => api.get<TaskAttachment[]>(`/nodes/${nodeId}/attachments`),
  create: (nodeId: string, name: string, url: string) =>
    api.post<TaskAttachment>(`/nodes/${nodeId}/attachments`, { name, url }),
  remove: (id: string) => api.delete<void>(`/attachments/${id}`)
};
