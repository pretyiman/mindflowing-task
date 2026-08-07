import { api } from './client';

export interface TeamMember {
  id: string;
  teamId: string;
  email: string;
}

export interface Team {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  members: TeamMember[];
}

export const teamsApi = {
  list: () => api.get<Team[]>('/teams'),
  create: (name: string) => api.post<Team>('/teams', { name }),
  remove: (id: string) => api.delete<void>(`/teams/${id}`),
  addMember: (teamId: string, email: string) => api.post<TeamMember>(`/teams/${teamId}/members`, { email }),
  removeMember: (memberId: string) => api.delete<void>(`/team-members/${memberId}`)
};
