import { useEffect, useState } from 'react';
import type { GraphData, MapMember, TaskPriority } from '../../types/graph';
import { nodesApi } from '../../api/nodes.api';
import { nodeAccessApi, type NodeAccess } from '../../api/nodeAccess.api';
import { collaboratorsApi, type Collaborator, type PendingInvite } from '../../api/collaborators.api';
import { taskAttachmentsApi, type TaskAttachment } from '../../api/taskAttachments.api';
import { ApiError } from '../../api/client';
import TaskDiscussion from './TaskDiscussion';

const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent'
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const SUBTASK_RELATION_NAME = 'Sub-task of';

interface Props {
  nodeId: string;
  graph: GraphData;
  members: MapMember[];
  canEdit: boolean;
  isOwner: boolean;
  restrictedAccessEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  // Lets a sub-task/parent row switch which task this panel is editing,
  // without closing and reopening it - see TaskListView.tsx's selectedTaskId.
  onSelectTask?: (nodeId: string) => void;
}

export default function TaskEditPanel({
  nodeId,
  graph,
  members,
  canEdit,
  isOwner,
  restrictedAccessEnabled,
  onClose,
  onChanged,
  onSelectTask
}: Props) {
  const node = graph.nodes.find((n) => n.id === nodeId) ?? null;

  const [name, setName] = useState(node?.name ?? '');
  const [notes, setNotes] = useState(node?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<NodeAccess | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  useEffect(() => {
    setName(node?.name ?? '');
    setNotes(node?.notes ?? '');
  }, [node?.id]);

  const refreshAttachments = () => {
    if (node) taskAttachmentsApi.list(node.id).then(setAttachments);
  };

  useEffect(() => {
    if (!node) {
      setAttachments([]);
      return;
    }
    taskAttachmentsApi.list(node.id).then(setAttachments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  const showAccessSection = isOwner && restrictedAccessEnabled;

  useEffect(() => {
    if (!showAccessSection || !node) {
      setAccess(null);
      setCollaborators([]);
      return;
    }
    nodeAccessApi.get(node.id).then(setAccess);
    collaboratorsApi.list(node.mapId).then((data) => setCollaborators(data.collaborators));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, showAccessSection]);

  // Independent of showAccessSection (restrictedAccessEnabled) - the
  // Assignees section needs pending invites regardless, so it can show
  // *why* someone who was invited (e.g. via a Team) isn't assignable yet:
  // they haven't logged in and accepted, so they're not a real collaborator.
  useEffect(() => {
    if (!isOwner || !node) {
      setPendingInvites([]);
      return;
    }
    collaboratorsApi.list(node.mapId).then((data) => setPendingInvites(data.pendingInvites));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, isOwner]);

  if (!node) return null;

  const subtaskRelationType = graph.relationTypes.find(
    (rt) => rt.name === SUBTASK_RELATION_NAME && rt.isHierarchy
  );
  const statusById = new Map(graph.taskStatuses.map((s) => [s.id, s]));
  const isDone = (n: typeof node) => n.taskStatusId !== null && statusById.get(n.taskStatusId)?.kind === 'DONE';

  const subtasks = subtaskRelationType
    ? graph.edges
        .filter((e) => e.targetNodeId === node.id && e.relationTypeId === subtaskRelationType.id)
        .map((e) => graph.nodes.find((n) => n.id === e.sourceNodeId))
        .filter((n): n is NonNullable<typeof n> => !!n)
    : [];
  const doneSubtasks = subtasks.filter(isDone).length;

  const parentEdge = subtaskRelationType
    ? graph.edges.find((e) => e.sourceNodeId === node.id && e.relationTypeId === subtaskRelationType.id)
    : undefined;
  const parentTask = parentEdge ? graph.nodes.find((n) => n.id === parentEdge.targetNodeId) : undefined;

  const handleAddSubtask = async () => {
    if (!newSubtaskName.trim()) return;
    try {
      await nodesApi.createSubtask(node.id, newSubtaskName.trim());
      setNewSubtaskName('');
      setShowAddSubtask(false);
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create sub-task');
    }
  };

  const handleAddAttachment = async () => {
    if (!newAttachmentName.trim() || !newAttachmentUrl.trim()) return;
    try {
      await taskAttachmentsApi.create(node.id, newAttachmentName.trim(), newAttachmentUrl.trim());
      setNewAttachmentName('');
      setNewAttachmentUrl('');
      setShowAddAttachment(false);
      setError(null);
      refreshAttachments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add attachment - check the URL is valid');
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    try {
      await taskAttachmentsApi.remove(id);
      refreshAttachments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove attachment');
    }
  };

  const handleSaveName = async () => {
    if (!name.trim() || name === node.name) return;
    try {
      await nodesApi.update(node.id, { name });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update name');
    }
  };

  const handleSaveNotes = async () => {
    if (notes === node.notes) return;
    try {
      await nodesApi.update(node.id, { notes });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update notes');
    }
  };

  const handleFieldChange = async (
    patch: Partial<{ taskStatusId: string | null; assigneeIds: string[]; priority: TaskPriority | null; dueDate: string | null }>
  ) => {
    try {
      await nodesApi.update(node.id, patch);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update task');
    }
  };

  const handleToggleAssignee = (userId: string) => {
    const next = node.assigneeIds.includes(userId)
      ? node.assigneeIds.filter((id) => id !== userId)
      : [...node.assigneeIds, userId];
    handleFieldChange({ assigneeIds: next });
  };

  const handleToggleRestrictToGrantsOnly = async () => {
    if (!access) return;
    const next = { ...access, restrictToGrantsOnly: !access.restrictToGrantsOnly };
    setAccess(next);
    try {
      await nodeAccessApi.set(node.id, next);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update access');
    }
  };

  const handleToggleGrant = async (userId: string) => {
    if (!access) return;
    const nextUserIds = access.userIds.includes(userId)
      ? access.userIds.filter((id) => id !== userId)
      : [...access.userIds, userId];
    const next = { ...access, userIds: nextUserIds };
    setAccess(next);
    try {
      await nodeAccessApi.set(node.id, next);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update access');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
    await nodesApi.remove(node.id);
    onChanged();
    onClose();
  };

  return (
    <div className="task-detail-page">
      <div className="task-detail-header">
        <button className="action-btn" onClick={onClose}>
          ← Back to Tasks
        </button>
        <h2 className="task-detail-title">{node.name || 'Task'}</h2>
      </div>

      <div className="property">
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSaveName}
          disabled={!canEdit || !isOwner}
          title={!isOwner ? 'Only the map owner can rename a task' : undefined}
        />
      </div>

      {parentTask && (
        <p className="hint-text">
          ↳ Sub-task of{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => onSelectTask?.(parentTask.id)}
            disabled={!onSelectTask}
          >
            {parentTask.name}
          </button>
        </p>
      )}

      <div className="property">
        <label>Details</label>
        <div className="task-field-grid">
          <div>
            <span className="task-field-label">Status</span>
            <select
              value={node.taskStatusId ?? ''}
              onChange={(e) => handleFieldChange({ taskStatusId: e.target.value || null })}
              disabled={!canEdit}
            >
              <option value="">No status</option>
              {graph.taskStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="task-field-label">Priority</span>
            <select
              value={node.priority ?? ''}
              onChange={(e) => handleFieldChange({ priority: (e.target.value as TaskPriority) || null })}
              disabled={!canEdit || !isOwner}
              title={!isOwner ? 'Only the map owner can change a task\'s priority' : undefined}
            >
              <option value="">No priority</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="task-field-label">Assignees</span>
            {members.length === 0 ? (
              <p className="hint-text" style={{ margin: 0 }}>
                No members to assign yet.
              </p>
            ) : (
              <div className="tag-chip-list">
                {members.map((m) => {
                  const active = node.assigneeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`tag-chip${active ? ' tag-chip-active' : ''}`}
                      onClick={() => handleToggleAssignee(m.id)}
                      disabled={!canEdit || !isOwner}
                      title={!isOwner ? 'Only the map owner can assign or reassign tasks' : undefined}
                    >
                      {m.name ?? m.email}
                    </button>
                  );
                })}
                {pendingInvites.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    className="tag-chip"
                    disabled
                    title="Invited but hasn't accepted yet - they'll be assignable once they log in and accept."
                  >
                    {inv.email} (pending)
                  </button>
                ))}
              </div>
            )}
            {canEdit && !isOwner && (
              <span className="hint-text" style={{ display: 'block', marginTop: 4, marginBottom: 0 }}>
                Only the owner can (re)assign
              </span>
            )}
            {isOwner && members.length <= 1 && pendingInvites.length === 0 && (
              <span className="hint-text" style={{ display: 'block', marginTop: 4, marginBottom: 0 }}>
                You're the only one on this project - Share it to invite people you can assign tasks to.
              </span>
            )}
          </div>
          <div>
            <span className="task-field-label">Due Date</span>
            <input
              type="date"
              value={node.dueDate ? node.dueDate.slice(0, 10) : ''}
              onChange={(e) =>
                handleFieldChange({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              disabled={!canEdit || !isOwner}
              title={!isOwner ? 'Only the map owner can set the due date' : undefined}
            />
          </div>
        </div>

        {(node.startedAt || node.completedAt) && (
          <p className="hint-text" style={{ marginTop: 8 }}>
            {node.startedAt && <>Started {formatDate(node.startedAt)}</>}
            {node.startedAt && node.completedAt && ' · '}
            {node.completedAt && <>Completed {formatDate(node.completedAt)}</>}
          </p>
        )}

        <span className="task-field-label" style={{ marginTop: 12, display: 'block' }}>
          Notes / Instructions
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Add instructions, context, or specs for whoever is assigned..."
          rows={4}
          disabled={!canEdit}
        />
      </div>

      <div className="property">
        <label>
          Sub-tasks{subtasks.length > 0 ? ` (${doneSubtasks}/${subtasks.length} done)` : ''}
        </label>
        {subtasks.length === 0 ? (
          <p className="hint-text">No sub-tasks yet.</p>
        ) : (
          <ul className="task-discussion-list">
            {subtasks.map((st) => (
              <li key={st.id} className="task-discussion-comment">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onSelectTask?.(st.id)}
                  disabled={!onSelectTask}
                  style={{ textDecoration: isDone(st) ? 'line-through' : 'underline', opacity: isDone(st) ? 0.7 : 1 }}
                >
                  {isDone(st) ? '✓ ' : ''}
                  {st.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <>
            {showAddSubtask && (
              <div className="add-form">
                <input
                  autoFocus
                  placeholder="Sub-task name"
                  value={newSubtaskName}
                  onChange={(e) => setNewSubtaskName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                />
                <button className="action-btn" onClick={handleAddSubtask}>
                  Add
                </button>
              </div>
            )}
            <button
              className="action-btn"
              style={{ marginTop: subtasks.length === 0 ? 8 : 0 }}
              onClick={() => setShowAddSubtask((v) => !v)}
            >
              + Add sub-task
            </button>
          </>
        )}
      </div>

      <div className="property">
        <label>Attachments</label>
        {attachments.length === 0 ? (
          <p className="hint-text">No attachments yet - paste a link (Drive, Dropbox, etc).</p>
        ) : (
          <ul className="task-discussion-list">
            {attachments.map((a) => (
              <li key={a.id} className="task-discussion-comment">
                <div className="task-discussion-comment-header">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="link-btn">
                    🔗 {a.name}
                  </a>
                  {canEdit && (
                    <button className="icon-btn" onClick={() => handleDeleteAttachment(a.id)} title="Remove attachment">
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <>
            {showAddAttachment && (
              <div className="add-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <input
                  autoFocus
                  placeholder="Link name (e.g. Design doc)"
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                />
                <input
                  placeholder="https://..."
                  value={newAttachmentUrl}
                  onChange={(e) => setNewAttachmentUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddAttachment()}
                />
                <button className="action-btn" onClick={handleAddAttachment}>
                  Add
                </button>
              </div>
            )}
            <button
              className="action-btn"
              style={{ marginTop: attachments.length === 0 ? 8 : 0 }}
              onClick={() => setShowAddAttachment((v) => !v)}
            >
              + Add link
            </button>
          </>
        )}
      </div>

      <TaskDiscussion nodeId={node.id} isOwner={isOwner} />

      {showAccessSection && (
        <div className="property">
          <label>Access</label>
          {!access ? (
            <p className="hint-text">Loading access settings...</p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={access.restrictToGrantsOnly}
                  onChange={handleToggleRestrictToGrantsOnly}
                />
                <span className="hint-text">
                  Restrict to grants only - only you and the people checked below can see this task.
                </span>
              </label>
              {collaborators.length === 0 ? (
                <p className="hint-text">No collaborators on this map yet.</p>
              ) : (
                <div className="tag-chip-list">
                  {collaborators.map((c) => {
                    const active = access.userIds.includes(c.user.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`tag-chip${active ? ' tag-chip-active' : ''}`}
                        onClick={() => handleToggleGrant(c.user.id)}
                      >
                        {c.user.name ?? c.user.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {canEdit && (
        <div className="actions">
          <button className="action-btn danger" onClick={handleDelete}>
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );
}
