import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { activityApi, type ActivityLogEntry } from '../../api/activity.api';
import { ApiError } from '../../api/client';

interface Props {
  mapId: string;
  onClose: () => void;
}

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

const ACTION_ICON: Record<ActivityLogEntry['action'], string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑'
};

export default function ActivityPanel({ mapId, onClose }: Props) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activityApi
      .list(mapId)
      .then((page) => {
        setEntries(page.entries);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load activity'))
      .finally(() => setLoading(false));
  }, [mapId]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await activityApi.list(mapId, nextCursor);
      setEntries((prev) => [...prev, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load more activity');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Modal title="Activity" onClose={onClose}>
      {loading && <p className="hint-text">Loading...</p>}
      {!loading && entries.length === 0 && (
        <p className="hint-text">
          No activity yet - changes made by you or your collaborators will show up here.
        </p>
      )}
      {entries.length > 0 && (
        <ul className="activity-list">
          {entries.map((entry) => (
            <li key={entry.id} className="activity-row">
              <span className="activity-icon">{ACTION_ICON[entry.action]}</span>
              <span className="activity-summary">
                <strong>{entry.user?.name ?? entry.user?.email ?? 'Someone'}</strong>{' '}
                {entry.summary.charAt(0).toLowerCase() + entry.summary.slice(1)}
              </span>
              <span className="activity-time">{timeAgo(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <button className="action-btn" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
