import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../state/authStore';
import { useThemeStore } from '../../state/themeStore';
import { notificationsApi, type AppNotification } from '../../api/notifications.api';

interface Props {
  onOpenSettings: () => void;
  onOpenTeams: () => void;
  // Navigates into a notification's map (and selects its node, if any) - see
  // App.tsx, which wires this to the same setCurrentMapId+selectNode pair
  // TaskManagerHome's row clicks already use.
  onOpenNotification: (mapId: string, nodeId: string | null) => void;
}

// Polled, not pushed - no websocket/SSE infra exists in this project (see
// notifications.ts's own comment). 45s splits the difference within the
// 30-60s range that's "responsive enough" without hammering the API.
const POLL_INTERVAL_MS = 45000;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AccountBadge({ onOpenSettings, onOpenTeams, onOpenNotification }: Props) {
  const { user, token, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const initial = (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase();

  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    enabled: !!token,
    refetchInterval: POLL_INTERVAL_MS
  });
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  const handleOpenNotification = async (n: AppNotification) => {
    setNotificationsOpen(false);
    if (!n.read) {
      await notificationsApi.markRead(n.id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    onOpenNotification(n.mapId, n.nodeId);
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="account-badge">
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div className="notification-bell-wrap">
        <button
          className="theme-toggle-btn notification-bell-btn"
          onClick={() => setNotificationsOpen((v) => !v)}
          title="Notifications"
        >
          🔔
          {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
        {notificationsOpen && (
          <>
            <div className="row-menu-scrim" onClick={() => setNotificationsOpen(false)} />
            <div className="row-menu-popover notification-popover">
              <div className="notification-popover-header">
                <strong>Notifications</strong>
                {unreadCount > 0 && (
                  <button className="link-btn" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              {!notificationsQuery.data || notificationsQuery.data.entries.length === 0 ? (
                <p className="hint-text notification-empty">No notifications yet.</p>
              ) : (
                <ul className="notification-list">
                  {notificationsQuery.data.entries.map((n) => (
                    <li
                      key={n.id}
                      className={`notification-item${n.read ? '' : ' notification-item-unread'}`}
                      onClick={() => handleOpenNotification(n)}
                    >
                      <span className="notification-message">{n.message}</span>
                      <span className="hint-text notification-time">{timeAgo(n.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <button className="account-badge-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="account-avatar">{initial}</span>
        <span className="account-email">{user?.email}</span>
      </button>
      {open && (
        <>
          <div className="row-menu-scrim" onClick={() => setOpen(false)} />
          <div className="row-menu-popover account-menu-popover">
            <button
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              ⚙ Account Settings
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onOpenTeams();
              }}
            >
              👥 Manage Teams
            </button>
            <button onClick={logout}>⎋ Log out</button>
          </div>
        </>
      )}
    </div>
  );
}
