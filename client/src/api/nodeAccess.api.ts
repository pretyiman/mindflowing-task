import { api } from './client';

export interface NodeAccess {
  restrictToGrantsOnly: boolean;
  userIds: string[];
}

export const nodeAccessApi = {
  get: (nodeId: string) => api.get<NodeAccess>(`/nodes/${nodeId}/access`),
  set: (nodeId: string, data: NodeAccess) => api.put<NodeAccess>(`/nodes/${nodeId}/access`, data)
};
