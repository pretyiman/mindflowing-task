import { useEffect, useState } from 'react';
import type { GraphData, GraphNode, MapMember, TaskPriority } from '../../types/graph';
import { nodesApi } from '../../api/nodes.api';
import { mapsApi } from '../../api/maps.api';
import { ApiError } from '../../api/client';
import { useAuthStore } from '../../state/authStore';
import { useGraphStore } from '../../state/graphStore';
import { filterGraph, isFilterActive } from '../graph/filterGraph';
import TaskEditPanel from './TaskEditPanel';
import TaskBoardLayout from './TaskBoardLayout';

interface Props {
  mapId: string;
  graph: GraphData;
  scope: 'all' | 'mine';
  canEdit: boolean;
  isOwner: boolean;
  restrictedAccessEnabled: boolean;
  onOpenTaskStatuses: () => void;
  onOpenTags?: () => void;
  onViewFullMap?: () => void;
  onChanged: () => void;
  // Set when arriving here already aiming at a specific task - e.g. clicking
  // a row in TaskManagerHome's cross-map view, which navigates into this map
  // and needs its TaskEditPanel to open immediately rather than requiring a
  // second click on the row. Consumed once via onInitialTaskConsumed so it
  // doesn't reopen on every re-render or block picking a different task.
  initialTaskId?: string | null;
  onInitialTaskConsumed?: () => void;
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: '#8899aa',
  MEDIUM: '#4a90d9',
  HIGH: '#e08a3c',
  URGENT: '#d94f4f'
};

const NO_STATUS = '__none__';

export default function TaskListView({
  mapId,
  graph,
  scope,
  canEdit,
  isOwner,
  restrictedAccessEnabled,
  onOpenTaskStatuses,
  onOpenTags,
  onViewFullMap,
  onChanged,
  initialTaskId,
  onInitialTaskConsumed
}: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [members, setMembers] = useState<MapMember[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');

  useEffect(() => {
    mapsApi.members(mapId).then(setMembers);
  }, [mapId]);

  useEffect(() => {
    if (!initialTaskId) return;
    setSelectedTaskId(initialTaskId);
    onInitialTaskConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId]);

  // Same search/filter bar the canvas uses (Toolbar renders it above this
  // view too) - applied here so it isn't just cosmetic in Project/worker
  // view.
  const {
    searchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    selectedTaskStatusId,
    selectedPriority
  } = useGraphStore();
  const filterState = {
    searchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    selectedTaskStatusId,
    selectedPriority
  };
  const matchedIds = isFilterActive(filterState) ? filterGraph(graph, filterState) : null;

  const taskNodes = graph.nodes.filter((n) => n.isTask);
  const scopedNodes =
    scope === 'mine' ? taskNodes.filter((n) => currentUserId != null && n.assigneeIds.includes(currentUserId)) : taskNodes;
  const visibleNodes = matchedIds ? scopedNodes.filter((n) => matchedIds.has(n.id)) : scopedNodes;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const sortedStatuses = [...graph.taskStatuses].sort((a, b) => a.order - b.order);

  const namedGroups = sortedStatuses.map((s) => ({
    key: s.id,
    label: s.name,
    color: s.color,
    tasks: visibleNodes.filter((n) => n.taskStatusId === s.id)
  }));
  const unstatusedTasks = visibleNodes.filter((n) => n.taskStatusId === null);
  const groups =
    unstatusedTasks.length > 0
      ? [...namedGroups, { key: NO_STATUS, label: 'No Status', color: '#888888', tasks: unstatusedTasks }]
      : namedGroups;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await nodesApi.create(mapId, { name: newName.trim(), isTask: true });
      setNewName('');
      setShowCreate(false);
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create task');
    }
  };

  const handleQuickStatusChange = async (nodeId: string, taskStatusId: string | null) => {
    try {
      await nodesApi.update(nodeId, { taskStatusId });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const formatDueDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // A selected task takes over this whole view as its own page (with its own
  // Back button) rather than overlaying the list in a modal - see
  // TaskEditPanel's own "task-detail-page" wrapper.
  if (selectedTaskId) {
    return (
      <TaskEditPanel
        nodeId={selectedTaskId}
        graph={graph}
        members={members}
        canEdit={canEdit}
        isOwner={isOwner}
        restrictedAccessEnabled={restrictedAccessEnabled}
        onClose={() => setSelectedTaskId(null)}
        onChanged={onChanged}
        onSelectTask={setSelectedTaskId}
      />
    );
  }

  const renderTaskRow = (task: GraphNode) => {
    const assigneeNames = task.assigneeIds
      .map((id) => memberById.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => m.name ?? m.email)
      .join(', ');
    const status = sortedStatuses.find((s) => s.id === task.taskStatusId);
    return (
      <tr key={task.id} className="task-row" onClick={() => setSelectedTaskId(task.id)}>
        <td>
          {task.priority && (
            <span className="task-priority-dot" style={{ background: PRIORITY_COLOR[task.priority] }} />
          )}
          {task.name}
        </td>
        {scope === 'all' && <td>{assigneeNames || 'Unassigned'}</td>}
        <td>
          {status ? (
            <span className="task-status-badge">
              <span className="color-swatch" style={{ background: status.color }} /> {status.name}
            </span>
          ) : (
            <span className="hint-text">No status</span>
          )}
        </td>
        <td>{task.dueDate ? formatDueDate(task.dueDate) : ''}</td>
      </tr>
    );
  };

  return (
    <div className="task-list-view">
      <div className="task-list-header">
        <h2>{scope === 'mine' ? 'My Tasks' : 'Tasks'}</h2>
        <div className="task-list-header-actions">
          <div className="tag-chip-list">
            <button
              type="button"
              className={`tag-chip${view === 'list' ? ' tag-chip-active' : ''}`}
              onClick={() => setView('list')}
            >
              ☰ List
            </button>
            <button
              type="button"
              className={`tag-chip${view === 'board' ? ' tag-chip-active' : ''}`}
              onClick={() => setView('board')}
            >
              ▦ Board
            </button>
          </div>
          {onViewFullMap && (
            <button className="action-btn" onClick={onViewFullMap}>
              🗺 View Full Map
            </button>
          )}
          {canEdit && onOpenTags && (
            <button className="action-btn" onClick={onOpenTags}>
              🏷 Labels
            </button>
          )}
          {canEdit && (
            <button className="action-btn" onClick={onOpenTaskStatuses}>
              ⚙️ Manage Statuses
            </button>
          )}
          {canEdit && (
            <button className="action-btn primary" onClick={() => setShowCreate((v) => !v)}>
              + New Task
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="add-form">
          <input
            autoFocus
            placeholder="Task name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button className="action-btn" onClick={handleCreate}>
            Create
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {visibleNodes.length === 0 ? (
        <p className="hint-text">
          {scope === 'mine' ? 'No tasks assigned to you yet.' : 'No tasks yet - create your first one above.'}
        </p>
      ) : view === 'board' ? (
        <TaskBoardLayout
          columns={groups}
          scope={scope}
          canEdit={canEdit}
          memberById={memberById}
          onDropTask={(taskId, columnKey) =>
            handleQuickStatusChange(taskId, columnKey === NO_STATUS ? null : columnKey)
          }
          onSelectTask={setSelectedTaskId}
        />
      ) : (
        groups.map((group) => (
          <div key={group.key} className="task-group">
            <h3 className="task-group-title">
              <span className="color-swatch" style={{ background: group.color }} /> {group.label} (
              {group.tasks.length})
            </h3>
            <table className="manage-table">
              <tbody>{group.tasks.map(renderTaskRow)}</tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
