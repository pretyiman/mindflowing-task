import { useEffect, useState, type DragEvent } from 'react';
import type { GraphData, GraphNode, MapMember, PropertyValue, RecurrenceRule, TaskPriority } from '../../types/graph';
import { useAuthStore } from '../../state/authStore';
import { nodesApi } from '../../api/nodes.api';
import { edgesApi } from '../../api/edges.api';
import { tagsApi } from '../../api/tags.api';
import { groupsApi } from '../../api/groups.api';
import { categoriesApi } from '../../api/categories.api';
import { collaboratorsApi, type Collaborator, type PendingInvite } from '../../api/collaborators.api';
import { nodeAccessApi, type NodeAccess } from '../../api/nodeAccess.api';
import { taskAttachmentsApi, type TaskAttachment } from '../../api/taskAttachments.api';
import { checklistApi, type ChecklistItem } from '../../api/checklist.api';
import { mapsApi } from '../../api/maps.api';
import { ApiError } from '../../api/client';
import { CATEGORY_ICON_CHOICES } from '../../constants/categoryIcons';
import { SUBTASK_RELATION_NAME } from '../../constants/taskRelations';
import { PRIORITY_COLOR, PRIORITY_LABEL, RECURRENCE_LABEL, statusPillStyle } from '../../constants/taskVisuals';
import TaskDiscussion from '../tasks/TaskDiscussion';

const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const RECURRENCE_RULES: RecurrenceRule[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'WEEKDAYS'];

interface Props {
  graph: GraphData;
  selectedNodeId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canEdit: boolean;
  isOwner: boolean;
  restrictedAccessEnabled: boolean;
  taskManagementEnabled: boolean;
  // Lets a sub-task/parent-task link switch which node this panel shows
  // (and re-selects it on canvas) without closing and reopening the panel -
  // same pattern TaskListView/TaskEditPanel use via onSelectTask.
  onSelectNode?: (nodeId: string) => void;
}

export default function NodeDetailPanel({
  graph,
  selectedNodeId,
  onClose,
  onChanged,
  canEdit,
  isOwner,
  restrictedAccessEnabled,
  taskManagementEnabled,
  onSelectNode
}: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const group = !node ? (graph.groups.find((g) => g.id === selectedNodeId) ?? null) : null;
  const category = node ? graph.categories.find((c) => c.id === node.categoryId) : null;

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [properties, setProperties] = useState<[string, PropertyValue][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingRelation, setAddingRelation] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState('');
  const [relationTypeId, setRelationTypeId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState('#4a4a6a');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState(CATEGORY_ICON_CHOICES[0]);
  const [newCatColor, setNewCatColor] = useState('#5577aa');
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const [access, setAccess] = useState<NodeAccess | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [members, setMembers] = useState<MapMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  // Node/Task tabs only exist once taskManagementEnabled && node.isTask - see
  // the effectiveTab computation below, which falls back to 'node' the
  // instant isTask goes false so unchecking "Track as a task" always lands
  // back on the plain node view, regardless of stale tab state.
  const [activeTab, setActiveTab] = useState<'node' | 'task'>('node');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [showAddChecklistItem, setShowAddChecklistItem] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [draggedChecklistId, setDraggedChecklistId] = useState<string | null>(null);

  useEffect(() => {
    setName(node?.name ?? '');
    setNotes(node?.notes ?? '');
    setProperties(node ? Object.entries(node.properties) : []);
    setError(null);
    setAddingRelation(false);
  }, [node?.id]);

  // Jump to the Task tab the moment a node becomes (or already is) a task -
  // most useful right after checking "Track as a task". Never forces back
  // to 'node' here; effectiveTab handles that side automatically.
  useEffect(() => {
    if (node?.isTask) setActiveTab('task');
  }, [node?.id, node?.isTask]);

  const effectiveTab: 'node' | 'task' = node?.isTask ? activeTab : 'node';

  const showAccessSection = isOwner && restrictedAccessEnabled && !!node;

  useEffect(() => {
    if (!showAccessSection || !node) {
      setAccess(null);
      setCollaborators([]);
      return;
    }
    nodeAccessApi.get(node.id).then(setAccess);
    collaboratorsApi.list(node.mapId).then((data) => setCollaborators(data.collaborators));
  }, [node?.id, showAccessSection]);

  useEffect(() => {
    if (!taskManagementEnabled || !node) {
      setMembers([]);
      return;
    }
    mapsApi.members(node.mapId).then(setMembers);
  }, [node?.mapId, taskManagementEnabled]);

  // Independent of showAccessSection (restrictedAccessEnabled) - the
  // Assignees section needs pending invites regardless, so it can show
  // *why* someone who was invited (e.g. via a Team) isn't assignable yet:
  // they haven't logged in and accepted, so they're not a real collaborator.
  useEffect(() => {
    if (!taskManagementEnabled || !isOwner || !node) {
      setPendingInvites([]);
      return;
    }
    collaboratorsApi.list(node.mapId).then((data) => setPendingInvites(data.pendingInvites));
  }, [node?.mapId, taskManagementEnabled, isOwner]);

  const refreshAttachments = () => {
    if (node?.isTask) taskAttachmentsApi.list(node.id).then(setAttachments);
  };

  useEffect(() => {
    if (!node?.isTask) {
      setAttachments([]);
      return;
    }
    taskAttachmentsApi.list(node.id).then(setAttachments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.isTask]);

  // Narrower than everything else on this panel - see TaskEditPanel.tsx's
  // identical canSeeChecklist comment / schema.prisma's ChecklistItem
  // comment for why (owner-or-current-assignee, not "anyone who can see
  // this node").
  const canSeeChecklist =
    !!node?.isTask && (isOwner || (currentUserId != null && node.assigneeIds.includes(currentUserId)));

  const refreshChecklist = () => {
    if (node) checklistApi.list(node.id).then(setChecklist);
  };

  useEffect(() => {
    if (!canSeeChecklist) {
      setChecklist([]);
      return;
    }
    refreshChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, canSeeChecklist]);

  useEffect(() => {
    setGroupName(group?.name ?? '');
    setGroupColor(group?.color ?? '#4a4a6a');
  }, [group?.id]);

  const memberCount = group ? graph.nodes.filter((n) => n.groupId === group.id).length : 0;

  const handleSaveGroupName = async () => {
    if (!group || groupName === group.name) return;
    await groupsApi.update(group.id, { name: groupName });
    onChanged();
  };

  const handleSaveGroupColor = async (color: string) => {
    if (!group) return;
    setGroupColor(color);
    await groupsApi.update(group.id, { color });
    onChanged();
  };

  const handleUngroup = async () => {
    if (!group) return;
    await groupsApi.remove(group.id);
    onChanged();
    onClose();
  };

  if (group) {
    return (
      <div className="detail-panel">
        <h2>
          <input
            className="name-input"
            placeholder="Group name (optional)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onBlur={handleSaveGroupName}
            disabled={!canEdit}
          />
        </h2>
        <div className="property">
          <label>Color</label>
          <input
            type="color"
            value={groupColor}
            onChange={(e) => handleSaveGroupColor(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <p className="hint-text">
          {memberCount} node{memberCount === 1 ? '' : 's'} in this group. Each keeps its own identity, notes
          and connections - this box is purely visual, so you can drag them as one unit.
        </p>
        {canEdit && (
          <div className="actions">
            <button className="action-btn danger" onClick={handleUngroup}>
              ⊟ Ungroup
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!node) {
    return (
      <div className="detail-panel">
        <h2>Node Details</h2>
        <p>Click a node to see its details, notes, and properties.</p>
      </div>
    );
  }

  const propertiesAsRecord = (): Record<string, PropertyValue> =>
    Object.fromEntries(properties.filter(([key]) => key.trim().length > 0));

  const handleSaveName = async () => {
    if (name === node.name) return;
    await nodesApi.update(node.id, { name });
    onChanged();
  };

  const handleSaveNotes = async () => {
    if (notes === node.notes) return;
    await nodesApi.update(node.id, { notes });
    onChanged();
  };

  const handleSaveProperties = async () => {
    await nodesApi.update(node.id, { properties: propertiesAsRecord() });
    onChanged();
  };

  const handleCategoryChange = async (categoryId: string | null) => {
    await nodesApi.update(node.id, { categoryId });
    onChanged();
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const created = await categoriesApi.create(node.mapId, {
        name: newCatName.trim(),
        icon: newCatIcon,
        color: newCatColor
      });
      setNewCatName('');
      setNewCatError(null);
      setShowNewCategory(false);
      await nodesApi.update(node.id, { categoryId: created.id });
      onChanged();
    } catch (err) {
      setNewCatError(err instanceof ApiError ? err.message : 'Failed to create category');
    }
  };

  const handleToggleTag = async (tagId: string) => {
    const nextTagIds = node.tagIds.includes(tagId)
      ? node.tagIds.filter((id) => id !== tagId)
      : [...node.tagIds, tagId];
    await tagsApi.setNodeTags(node.id, nextTagIds);
    onChanged();
  };

  const handleToggleRestrictToGrantsOnly = async () => {
    if (!access || !node) return;
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
    if (!access || !node) return;
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

  const handleTaskFieldChange = async (
    patch: Partial<{
      isTask: boolean;
      taskStatusId: string | null;
      assigneeIds: string[];
      priority: TaskPriority | null;
      dueDate: string | null;
      recurrenceRule: RecurrenceRule | null;
    }>
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
    handleTaskFieldChange({ assigneeIds: next });
  };

  const handleDelete = async () => {
    await nodesApi.remove(node.id);
    onChanged();
    onClose();
  };

  const handleAddRelation = async () => {
    if (!relationTypeId) {
      setError('Pick a relation type.');
      return;
    }
    if (!relationTargetId) {
      setError('Pick a target node.');
      return;
    }
    try {
      await edgesApi.create(node.mapId, {
        sourceNodeId: node.id,
        targetNodeId: relationTargetId,
        relationTypeId
      });
      setAddingRelation(false);
      setRelationTargetId('');
      setRelationTypeId('');
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add relation');
    }
  };

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

  const handleAddChecklistItem = async () => {
    if (!newChecklistText.trim()) return;
    try {
      await checklistApi.create(node.id, newChecklistText.trim());
      setNewChecklistText('');
      setError(null);
      refreshChecklist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add checklist item');
    }
  };

  const handleToggleChecklistItem = async (item: ChecklistItem) => {
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)));
    try {
      await checklistApi.update(item.id, { done: !item.done });
    } catch (err) {
      setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)));
      setError(err instanceof ApiError ? err.message : 'Failed to update checklist item');
    }
  };

  const handleDeleteChecklistItem = async (id: string) => {
    try {
      await checklistApi.remove(id);
      refreshChecklist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove checklist item');
    }
  };

  const handleChecklistDrop = async (targetId: string) => {
    const draggedId = draggedChecklistId;
    setDraggedChecklistId(null);
    if (!draggedId || draggedId === targetId) return;
    const currentOrder = checklist.map((c) => c.id);
    const fromIndex = currentOrder.indexOf(draggedId);
    const toIndex = currentOrder.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...currentOrder];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedId);
    const itemById = new Map(checklist.map((c) => [c.id, c]));
    setChecklist(reordered.map((id) => itemById.get(id)!));
    try {
      await checklistApi.reorder(node.id, reordered);
    } catch (err) {
      refreshChecklist();
      setError(err instanceof ApiError ? err.message : 'Failed to reorder checklist');
    }
  };

  const subtaskRelationType = graph.relationTypes.find(
    (rt) => rt.name === SUBTASK_RELATION_NAME && rt.isHierarchy
  );
  const taskStatusById = new Map(graph.taskStatuses.map((s) => [s.id, s]));
  const isSubtaskDone = (n: GraphNode) => n.taskStatusId !== null && taskStatusById.get(n.taskStatusId)?.kind === 'DONE';

  const subtasks = subtaskRelationType
    ? graph.edges
        .filter((e) => e.targetNodeId === node.id && e.relationTypeId === subtaskRelationType.id)
        .map((e) => graph.nodes.find((n) => n.id === e.sourceNodeId))
        .filter((n): n is GraphNode => !!n)
    : [];
  const doneSubtaskCount = subtasks.filter(isSubtaskDone).length;

  const parentTaskEdge = subtaskRelationType
    ? graph.edges.find((e) => e.sourceNodeId === node.id && e.relationTypeId === subtaskRelationType.id)
    : undefined;
  const parentTask = parentTaskEdge ? graph.nodes.find((n) => n.id === parentTaskEdge.targetNodeId) : undefined;

  // Access applies to any node, not just tasks, but in practice it's almost
  // always used to scope a specific task - lives in the Task tab for a task
  // node, and falls back into the (only) Node view for a plain one, since
  // there's no Task tab to put it in there.
  const accessSection = showAccessSection && (
    <div className="property">
      <label>Access</label>
      {!access ? (
        <p className="hint-text">Loading access settings...</p>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={access.restrictToGrantsOnly} onChange={handleToggleRestrictToGrantsOnly} />
            <span className="hint-text">
              Restrict to grants only - ignore tag-based visibility for this node; only you and the
              people checked below can see it.
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
  );

  return (
    <div className="detail-panel">
      <h2>
        {node.iconOverride ?? category?.icon ?? '❓'}{' '}
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSaveName}
          disabled={!canEdit || (node.isTask && !isOwner)}
          title={node.isTask && !isOwner ? 'Only the map owner can rename a task' : undefined}
        />
      </h2>

      {taskManagementEnabled && node.isTask && (
        <div className="node-detail-tabs">
          <button
            type="button"
            className={`node-detail-tab${effectiveTab === 'node' ? ' node-detail-tab-active' : ''}`}
            onClick={() => setActiveTab('node')}
          >
            ⚙️ Node
          </button>
          <button
            type="button"
            className={`node-detail-tab${effectiveTab === 'task' ? ' node-detail-tab-active' : ''}`}
            onClick={() => setActiveTab('task')}
          >
            ✅ Task
          </button>
        </div>
      )}

      {effectiveTab === 'node' && (
        <>
          <div className="property">
            <label>Category</label>
            <div className="category-select-row">
              <select
                value={node.categoryId ?? ''}
                onChange={(e) => handleCategoryChange(e.target.value || null)}
                disabled={!canEdit}
              >
                <option value="">No category</option>
                {graph.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              {canEdit && (
                <div className="category-create-wrap">
                  <button
                    className="category-add-btn"
                    onClick={() => setShowNewCategory((v) => !v)}
                    title="Create new category"
                  >
                    +
                  </button>
                  {showNewCategory && (
                    <>
                      <div className="row-menu-scrim" onClick={() => setShowNewCategory(false)} />
                      <div className="category-create-popover">
                        <select value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)}>
                          {CATEGORY_ICON_CHOICES.map((icon) => (
                            <option key={icon} value={icon}>
                              {icon}
                            </option>
                          ))}
                        </select>
                        <input
                          autoFocus
                          placeholder="Category name"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                        />
                        <input
                          type="color"
                          value={newCatColor}
                          onChange={(e) => setNewCatColor(e.target.value)}
                        />
                        <button className="action-btn" onClick={handleCreateCategory}>
                          Create
                        </button>
                        {newCatError && <p className="error-text">{newCatError}</p>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="property">
            <label>Tags</label>
            {graph.tags.length === 0 ? (
              <p className="hint-text">No tags yet - create some in the Tags settings.</p>
            ) : (
              <div className="tag-chip-list">
                {graph.tags.map((t) => {
                  const active = node.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tag-chip${active ? ' tag-chip-active' : ''}`}
                      style={active ? { background: t.color, borderColor: t.color } : { borderColor: t.color }}
                      onClick={() => handleToggleTag(t.id)}
                      disabled={!canEdit}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {taskManagementEnabled && !node.isTask && (
            <div className="property">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={node.isTask}
                  onChange={(e) => handleTaskFieldChange({ isTask: e.target.checked })}
                  disabled={!canEdit}
                />
                Track as a task
              </label>
              <p className="hint-text" style={{ marginTop: 4, marginBottom: 0 }}>
                Not tracked as a task, so it won't show up in the task list/board or progress stats.
              </p>
            </div>
          )}

          {!node.isTask && accessSection}

          <div className="property">
            <label>Properties</label>
            {properties.map(([key, value], idx) => (
              <div className="property-row" key={idx}>
                <input
                  placeholder="key"
                  value={key}
                  onChange={(e) => {
                    const next = [...properties];
                    next[idx] = [e.target.value, value];
                    setProperties(next);
                  }}
                  onBlur={handleSaveProperties}
                  disabled={!canEdit}
                />
                <input
                  placeholder="value"
                  value={value === null ? '' : String(value)}
                  onChange={(e) => {
                    const next = [...properties];
                    next[idx] = [key, e.target.value];
                    setProperties(next);
                  }}
                  onBlur={handleSaveProperties}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <button
                    className="icon-btn"
                    onClick={() => {
                      const next = properties.filter((_, i) => i !== idx);
                      setProperties(next);
                      nodesApi
                        .update(node.id, { properties: Object.fromEntries(next) })
                        .then(onChanged);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <button className="action-btn" onClick={() => setProperties([...properties, ['', '']])}>
                + Add property
              </button>
            )}
          </div>

          {!node.isTask && (
            <div className="property">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Add detailed notes, specs, experience..."
                rows={6}
                disabled={!canEdit}
              />
            </div>
          )}
        </>
      )}

      {effectiveTab === 'task' && (
        <>
          <div className="property">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={node.isTask}
                onChange={(e) => handleTaskFieldChange({ isTask: e.target.checked })}
                disabled={!canEdit}
              />
              Track as a task
            </label>
          </div>

          {parentTask && (
            <p className="hint-text">
              ↳ Sub-task of{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => onSelectNode?.(parentTask.id)}
                disabled={!onSelectNode}
              >
                {parentTask.name}
              </button>
            </p>
          )}

          <div className="property">
          <div className="task-field-grid">
            <div>
              <span className="task-field-label">Status</span>
              <select
                className="status-pill"
                style={statusPillStyle(taskStatusById.get(node.taskStatusId ?? '')?.color ?? '#8899aa')}
                value={node.taskStatusId ?? ''}
                onChange={(e) => handleTaskFieldChange({ taskStatusId: e.target.value || null })}
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
                className="status-pill"
                style={statusPillStyle(node.priority ? PRIORITY_COLOR[node.priority] : '#8899aa')}
                value={node.priority ?? ''}
                onChange={(e) => handleTaskFieldChange({ priority: (e.target.value as TaskPriority) || null })}
                disabled={!canEdit || !isOwner}
                title={!isOwner ? "Only the map owner can change a task's priority" : undefined}
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
                    const isMe = m.id === currentUserId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`tag-chip${active ? ' tag-chip-active' : ''}`}
                        onClick={() => handleToggleAssignee(m.id)}
                        disabled={!canEdit || !isOwner}
                        title={!isOwner ? 'Only the map owner can assign or reassign tasks' : isMe ? 'Assign this task to yourself' : undefined}
                      >
                        {isMe ? '🙋 ' : ''}
                        {m.name ?? m.email}
                        {isMe ? ' (you)' : ''}
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
                  You're the only one on this project so far - click "🙋 You (you)" above to assign it to
                  yourself, or Share the project to invite others.
                </span>
              )}
            </div>
            <div>
              <span className="task-field-label">Due Date</span>
              <input
                type="date"
                value={node.dueDate ? node.dueDate.slice(0, 10) : ''}
                onChange={(e) =>
                  handleTaskFieldChange({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                disabled={!canEdit}
              />
            </div>
            <div>
              <span className="task-field-label">Repeats</span>
              <select
                value={node.recurrenceRule ?? ''}
                onChange={(e) => handleTaskFieldChange({ recurrenceRule: (e.target.value as RecurrenceRule) || null })}
                disabled={!canEdit || !node.dueDate}
                title={!node.dueDate ? 'Set a due date first - recurrence needs one to compute the next occurrence from' : undefined}
              >
                <option value="">Does not repeat</option>
                {RECURRENCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="task-field-label" style={{ marginTop: 12, display: 'block' }}>
            Notes / Instructions
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            placeholder="Add instructions, context, or specs for whoever is assigned..."
            rows={4}
            disabled={!canEdit || !isOwner}
            title={!isOwner ? "Only the map owner can edit a task's instructions - reply in Discussion instead" : undefined}
          />
          </div>

          {node.isTask && accessSection}

          {canSeeChecklist && (
            <div className="property">
              <label>
                Checklist{checklist.length > 0 ? ` (${checklist.filter((c) => c.done).length}/${checklist.length} done)` : ''}
              </label>
              {checklist.length === 0 ? (
                <p className="hint-text">No checklist items yet.</p>
              ) : (
                <ul className="checklist-list">
                  {checklist.map((item) => (
                    <li
                      key={item.id}
                      className={`checklist-item${draggedChecklistId === item.id ? ' checklist-item-dragging' : ''}`}
                      draggable
                      onDragStart={() => setDraggedChecklistId(item.id)}
                      onDragEnd={() => setDraggedChecklistId(null)}
                      onDragOver={(e: DragEvent<HTMLLIElement>) => e.preventDefault()}
                      onDrop={() => handleChecklistDrop(item.id)}
                    >
                      <span className="checklist-drag-handle" title="Drag to reorder">⠿</span>
                      <label className="checklist-item-label">
                        <input type="checkbox" checked={item.done} onChange={() => handleToggleChecklistItem(item)} />
                        <span className={item.done ? 'checklist-item-text-done' : undefined}>{item.text}</span>
                      </label>
                      <button
                        className="icon-btn"
                        onClick={() => handleDeleteChecklistItem(item.id)}
                        title="Remove checklist item"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showAddChecklistItem && (
                <div className="add-form">
                  <input
                    autoFocus
                    placeholder="Checklist item (e.g. API integration)"
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                  />
                  <button className="action-btn" onClick={handleAddChecklistItem}>
                    Add
                  </button>
                </div>
              )}
              <button
                className="action-btn"
                style={{ marginTop: checklist.length === 0 ? 8 : 0 }}
                onClick={() => setShowAddChecklistItem((v) => !v)}
              >
                + Add checklist item
              </button>
            </div>
          )}

          <div className="property">
            <label>
              Sub-tasks{subtasks.length > 0 ? ` (${doneSubtaskCount}/${subtasks.length} done)` : ''}
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
                      onClick={() => onSelectNode?.(st.id)}
                      disabled={!onSelectNode}
                      style={{
                        textDecoration: isSubtaskDone(st) ? 'line-through' : 'underline',
                        opacity: isSubtaskDone(st) ? 0.7 : 1
                      }}
                    >
                      {isSubtaskDone(st) ? '✓ ' : ''}
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
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {canEdit && (
        <div className="actions">
          <button
            className="action-btn"
            onClick={() =>
              setAddingRelation((v) => {
                const next = !v;
                if (next && !relationTypeId && graph.relationTypes.length) {
                  setRelationTypeId(graph.relationTypes[0].id);
                }
                return next;
              })
            }
          >
            🔗 Add Relation
          </button>
          <button className="action-btn danger" onClick={handleDelete}>
            🗑 Delete
          </button>
        </div>
      )}

      {canEdit && addingRelation && (
        <div className="add-relation-form">
          {graph.relationTypes.length === 0 ? (
            <p className="hint-text">Create a relation type first (Relation Types in the toolbar).</p>
          ) : (
            <>
              <select value={relationTypeId} onChange={(e) => setRelationTypeId(e.target.value)}>
                <option value="">Relation type...</option>
                {graph.relationTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>
              <select value={relationTargetId} onChange={(e) => setRelationTargetId(e.target.value)}>
                <option value="">Target node...</option>
                {graph.nodes
                  .filter((n) => n.id !== node.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
              <button className="action-btn" onClick={handleAddRelation}>
                Save relation
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
