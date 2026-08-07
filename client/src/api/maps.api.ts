import { api } from './client';
import type { GraphData, MapMember, MindMap, WorkspaceType } from '../types/graph';

export const mapsApi = {
  list: () => api.get<MindMap[]>('/maps'),
  create: (data: { name: string; description?: string; workspaceType?: WorkspaceType }) =>
    api.post<MindMap>('/maps', data),
  get: (id: string) => api.get<MindMap>(`/maps/${id}`),
  update: (
    id: string,
    data: { name?: string; description?: string; restrictedAccessEnabled?: boolean; taskManagementEnabled?: boolean }
  ) => api.patch<MindMap>(`/maps/${id}`, data),
  remove: (id: string) => api.delete<void>(`/maps/${id}`),
  graph: (id: string) => api.get<GraphData>(`/maps/${id}/graph`),
  members: (id: string) => api.get<MapMember[]>(`/maps/${id}/members`)
};
