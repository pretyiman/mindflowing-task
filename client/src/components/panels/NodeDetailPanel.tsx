import { useEffect, useState } from 'react';
import type { GraphData, MapMember, PropertyValue, TaskPriority } from '../../types/graph';
import { nodesApi } from '../../api/nodes.api';
import { edgesApi } from '../../api/edges.api';
import { tagsApi } from '../../api/tags.api';
import { groupsApi } from '../../api/groups.api';
import { categoriesApi } from '../../api/categories.api';
import { collaboratorsApi, type Collaborator, type PendingInvite } from '../../api/collaborators.api';
import { nodeAccessApi, type NodeAccess } from '../../api/nodeAccess.api';
import { mapsApi } from '../../api/maps.api';
import { ApiError } from '../../api/client';
import { CATEGORY_ICON_CHOICES } from '../../constants/categoryIcons';
import TaskDiscussion from '../tasks/TaskDiscussion';

const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent'
};

interface Props {
  graph: GraphData;
  selectedNodeId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canEdit: boolean;
  isOwner: boolean;
  restrictedAccessEnabled: boolean;
  taskManagementEnabled: boolean;
}

export default function NodeDetailPanel({
  graph,
  selectedNodeId,
  onClose,
  onChanged,
  canEdit,
  isOwner,
  restrictedAccessEnabled,
  taskManagementEnabled
}: Props) {
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

  useEffect(() => {
    setName(node?.name ?? '');
    setNotes(node?.notes ?? '');
    setProperties(node ? Object.entries(node.properties) : []);
    setError(null);
    setAddingRelation(false);
  }, [node?.id]);

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

      {taskManagementEnabled && (
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
          {!node.isTask && (
            <p className="hint-text" style={{ marginTop: 4, marginBottom: 0 }}>
              Not tracked as a task, so it won't show up in the task list/board or progress stats.
            </p>
          )}
          {node.isTask && (
            <>
              <div className="task-field-grid" style={{ marginTop: 8 }}>
                <div>
                  <span className="task-field-label">Status</span>
                  <select
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
                      handleTaskFieldChange({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                    disabled={!canEdit}
                  />
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
                disabled={!canEdit}
              />
            </>
          )}
        </div>
      )}

      {taskManagementEnabled && node.isTask && <TaskDiscussion nodeId={node.id} isOwner={isOwner} />}

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
                  Restrict to grants only - ignore tag-based visibility for this node; only you and
                  the people checked below can see it.
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

      {(!taskManagementEnabled || !node.isTask) && (
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
