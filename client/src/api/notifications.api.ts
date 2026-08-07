import { api } from './client';

export type NotificationType = 'ASSIGNED' | 'COMMENT' | 'MENTION' | 'STATUS_CHANGED';

export interface AppNotification {
  id: string;
  userId: string;
  mapId: string;
  nodeId: string | null;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsPage {
  entries: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

export const notificationsApi = {
  list: (cursor?: string) => api.get<NotificationsPage>(`/notifications${cursor ? `?cursor=${cursor}` : ''}`),
  markRead: (id: string) => api.patch<AppNotification>(`/notifications/${id}`),
  markAllRead: () => api.post<void>('/notifications/read-all')
};
