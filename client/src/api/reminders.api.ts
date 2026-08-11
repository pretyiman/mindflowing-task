import { api } from './client';

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  note: string | null;
  remindAt: string;
  notifiedAt: string | null;
  createdAt: string;
}

export const remindersApi = {
  list: () => api.get<Reminder[]>('/reminders'),
  create: (data: { title: string; note?: string | null; remindAt: string }) =>
    api.post<Reminder>('/reminders', data),
  remove: (id: string) => api.delete<void>(`/reminders/${id}`)
};
