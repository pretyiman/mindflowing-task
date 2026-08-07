import { useEffect, useState } from 'react';
import { taskCommentsApi, type TaskComment } from '../../api/taskComments.api';
import { activityApi, type ActivityLogEntry } from '../../api/activity.api';
import { useAuthStore } from '../../state/authStore';
import { ApiError } from '../../api/client';

interface Props {
  nodeId: string;
  isOwner: boolean;
}

type TimelineItem =
  | { kind: 'comment'; id: string; createdAt: string; comment: TaskComment }
  | { kind: 'activity'; id: string; createdAt: string; entry: ActivityLogEntry };

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

export default function TaskDiscussion({ nodeId, isOwner }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [newBody, setNewBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    Promise.all([taskCommentsApi.list(nodeId), activityApi.listForNode(nodeId)])
      .then(([c, a]) => {
        setComments(c);
        setActivity(a.entries);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load discussion'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [nodeId]);

  const handlePost = async () => {
    if (!newBody.trim()) return;
    try {
      await taskCommentsApi.create(nodeId, newBody.trim());
      setNewBody('');
      setError(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post comment');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taskCommentsApi.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete comment');
    }
  };

  const timeline: TimelineItem[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, id: c.id, createdAt: c.createdAt, comment: c })),
    ...activity.map((a) => ({ kind: 'activity' as const, id: a.id, createdAt: a.createdAt, entry: a }))
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="property">
      <label>Discussion</label>
      {loading ? (
        <p className="hint-text">Loading...</p>
      ) : timeline.length === 0 ? (
        <p className="hint-text">No activity yet - be the first to comment.</p>
      ) : (
        <ul className="task-discussion-list">
          {timeline.map((item) =>
            item.kind === 'comment' ? (
              <li key={`c-${item.id}`} className="task-discussion-comment">
                <div className="task-discussion-comment-header">
                  <strong>{item.comment.author?.name ?? item.comment.author?.email ?? 'Someone'}</strong>
                  <span className="hint-text">{timeAgo(item.createdAt)}</span>
                  {(item.comment.authorId === currentUserId || isOwner) && (
                    <button className="icon-btn" onClick={() => handleDelete(item.id)} title="Delete comment">
                      ✕
                    </button>
                  )}
                </div>
                <p className="task-discussion-comment-body">{item.comment.body}</p>
              </li>
            ) : (
              <li key={`a-${item.id}`} className="task-discussion-activity">
                <span className="hint-text">
                  {item.entry.user?.name ?? item.entry.user?.email ?? 'Someone'}{' '}
                  {item.entry.summary.charAt(0).toLowerCase() + item.entry.summary.slice(1)} ·{' '}
                  {timeAgo(item.createdAt)}
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <div className="add-form">
        <input
          placeholder="Write a comment..."
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePost()}
        />
        <button className="action-btn" onClick={handlePost}>
          Post
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
