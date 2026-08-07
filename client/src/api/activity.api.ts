import { api } from './client';

export interface ActivityLogEntry {
  id: string;
  mapId: string;
  userId: string | null;
  action: 'create' | 'update' | 'delete';
  targetType: 'node' | 'edge' | 'group' | 'category' | 'relationType' | 'tag' | 'taskStatus';
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null } | null;
}

export interface ActivityPage {
  entries: ActivityLogEntry[];
  nextCursor: string | null;
}

export const activityApi = {
  list: (mapId: string, cursor?: string) =>
    api.get<ActivityPage>(`/maps/${mapId}/activity${cursor ? `?cursor=${cursor}` : ''}`),
  // Also owner-only (see taskComments.routes.ts's /nodes/:id/activity) - the
  // per-node system/audit trail, distinct from that task's own comments,
  // which every collaborator who can see the task may read.
  listForNode: (nodeId: string, cursor?: string) =>
    api.get<ActivityPage>(`/nodes/${nodeId}/activity${cursor ? `?cursor=${cursor}` : ''}`)
};
