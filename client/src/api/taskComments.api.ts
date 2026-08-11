import { api } from './client';

export interface TaskComment {
  id: string;
  nodeId: string;
  authorId: string | null;
  body: string;
  // Single level of nesting - see schema.prisma's TaskComment comment. Null
  // for a top-level comment, otherwise always points at a top-level comment
  // (never at another reply - the server re-parents reply-to-a-reply).
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; email: string; name: string | null } | null;
}

export const taskCommentsApi = {
  list: (nodeId: string) => api.get<TaskComment[]>(`/nodes/${nodeId}/comments`),
  create: (nodeId: string, body: string, parentCommentId?: string | null) =>
    api.post<TaskComment>(`/nodes/${nodeId}/comments`, { body, parentCommentId }),
  remove: (id: string) => api.delete<void>(`/comments/${id}`),
  // Fire-and-forget "I opened this task" beacon - see activity.service.ts's
  // recordNodeView. Callers should swallow errors, not surface them.
  recordView: (nodeId: string) => api.post<void>(`/nodes/${nodeId}/view`)
};
