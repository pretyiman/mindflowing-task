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
  // Owner-only map-wide log above; this is the per-node equivalent anyone who
  // can see the node may read (see taskComments.routes.ts's /nodes/:id/activity).
  listForNode: (nodeId: string, cursor?: string) =>
    api.get<ActivityPage>(`/nodes/${nodeId}/activity${cursor ? `?cursor=${cursor}` : ''}`)
};
