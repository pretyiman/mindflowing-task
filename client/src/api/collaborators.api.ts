import { api } from './client';

export type CollaboratorRole = 'VIEWER' | 'EDITOR';

export interface Collaborator {
  id: string;
  mapId: string;
  role: CollaboratorRole;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  scopeTagIds: string[];
}

export interface PendingInvite {
  id: string;
  mapId: string;
  token: string;
  email: string;
  role: CollaboratorRole;
  createdAt: string;
  acceptedAt: string | null;
}

export interface CollaboratorsAndInvites {
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
}

export const collaboratorsApi = {
  list: (mapId: string) => api.get<CollaboratorsAndInvites>(`/maps/${mapId}/collaborators`),
  invite: (mapId: string, data: { email: string; role: CollaboratorRole }) =>
    api.post<PendingInvite>(`/maps/${mapId}/collaborators`, data),
  updateRole: (id: string, role: CollaboratorRole) =>
    api.patch<Collaborator>(`/collaborators/${id}`, { role }),
  updateScope: (id: string, scopeTagIds: string[]) =>
    api.patch<Collaborator>(`/collaborators/${id}`, { scopeTagIds }),
  remove: (id: string) => api.delete<void>(`/collaborators/${id}`)
};
