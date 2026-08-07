import { useEffect, useState } from 'react';
import { taskCommentsApi, type TaskComment } from '../../api/taskComments.api';
import { activityApi, type ActivityLogEntry } from '../../api/activity.api';
import { useAuthStore } from '../../state/authStore';
import { ApiError } from '../../api/client';

interface Props {
  nodeId: string;
  isOwner: boolean;
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

function displayName(person: { name: string | null; email: string } | null | undefined): string {
  return person?.name ?? person?.email ?? 'Someone';
}

function initialOf(person: { name: string | null; email: string } | null | undefined): string {
  return (person?.name ?? person?.email ?? '?').charAt(0).toUpperCase();
}

// A proper threaded discussion: comments and replies (one level deep - see
// schema.prisma's TaskComment) live in their own tab, kept entirely separate
// from History (the system/audit trail - node created, status changed,
// etc), which is a different tab and owner-only (see taskComments.routes.ts's
// /nodes/:id/activity) - mixing the two into one feed read as noisy/
// unprofessional, and the audit trail was never meant for every collaborator.
export default function TaskDiscussion({ nodeId, isOwner }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refreshComments = () => {
    taskCommentsApi
      .list(nodeId)
      .then(setComments)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load comments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    refreshComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  // Only fetched for the owner, on demand (switching to the tab) - a
  // non-owner can't reach this endpoint at all, so there's no point asking.
  useEffect(() => {
    if (tab !== 'history' || !isOwner) return;
    activityApi
      .listForNode(nodeId)
      .then((a) => setActivity(a.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load history'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, tab, isOwner]);

  const handlePost = async () => {
    if (!newBody.trim()) return;
    try {
      await taskCommentsApi.create(nodeId, newBody.trim());
      setNewBody('');
      setError(null);
      refreshComments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post comment');
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyBody.trim()) return;
    try {
      await taskCommentsApi.create(nodeId, replyBody.trim(), parentId);
      setReplyBody('');
      setReplyingToId(null);
      setError(null);
      refreshComments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post reply');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taskCommentsApi.remove(id);
      refreshComments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete comment');
    }
  };

  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parentCommentId === parentId);

  const renderComment = (comment: TaskComment, isReply: boolean) => {
    const canDelete = comment.authorId === currentUserId || isOwner;
    const isReplying = replyingToId === comment.id;
    return (
      <div key={comment.id} className="comment-post">
        <div className={`comment-avatar${isReply ? ' comment-avatar-sm' : ''}`}>{initialOf(comment.author)}</div>
        <div className="comment-body-col">
          <div className="comment-card">
            <div className="comment-card-header">
              <span className="comment-author">{displayName(comment.author)}</span>
              <span className="comment-time">{timeAgo(comment.createdAt)}</span>
              {canDelete && (
                <button className="icon-btn" onClick={() => handleDelete(comment.id)} title="Delete comment">
                  ✕
                </button>
              )}
            </div>
            <p className="comment-text">{comment.body}</p>
          </div>

          <div className="comment-actions">
            <button
              type="button"
              className="comment-reply-btn"
              onClick={() => {
                setReplyingToId(isReplying ? null : comment.id);
                setReplyBody('');
              }}
            >
              {isReplying ? 'Cancel' : 'Reply'}
            </button>
          </div>

          {isReplying && (
            <div className="comment-compose comment-reply-compose">
              <textarea
                autoFocus
                placeholder={`Reply to ${displayName(comment.author)}...`}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={2}
              />
              <div className="comment-compose-actions">
                <button className="action-btn primary" onClick={() => handleReply(comment.id)}>
                  Post reply
                </button>
              </div>
            </div>
          )}

          {!isReply && repliesOf(comment.id).length > 0 && (
            <div className="comment-replies">{repliesOf(comment.id).map((r) => renderComment(r, true))}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="property">
      <label>Discussion</label>

      <div className="tag-chip-list discussion-tabs">
        <button
          type="button"
          className={`tag-chip${tab === 'comments' ? ' tag-chip-active' : ''}`}
          onClick={() => setTab('comments')}
        >
          💬 Comments{comments.length > 0 ? ` (${comments.length})` : ''}
        </button>
        {isOwner && (
          <button
            type="button"
            className={`tag-chip${tab === 'history' ? ' tag-chip-active' : ''}`}
            onClick={() => setTab('history')}
          >
            🕓 History
          </button>
        )}
      </div>

      {tab === 'comments' ? (
        <>
          {loading ? (
            <p className="discussion-empty">Loading...</p>
          ) : topLevel.length === 0 ? (
            <p className="discussion-empty">No comments yet - be the first to say something.</p>
          ) : (
            <div className="comment-thread">{topLevel.map((c) => renderComment(c, false))}</div>
          )}

          <div className="comment-compose">
            <textarea
              placeholder="Write a comment..."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={2}
            />
            <div className="comment-compose-actions">
              <button className="action-btn primary" onClick={handlePost}>
                Post
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="history-feed">
          {activity.length === 0 ? (
            <p className="discussion-empty">No history yet.</p>
          ) : (
            activity.map((entry) => (
              <div key={entry.id} className="history-entry">
                {displayName(entry.user)} {entry.summary.charAt(0).toLowerCase() + entry.summary.slice(1)} ·{' '}
                {timeAgo(entry.createdAt)}
              </div>
            ))
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
