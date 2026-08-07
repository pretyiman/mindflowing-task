import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { GraphNode, MapMember, MindMap, TaskPriority, WorkspaceType } from '../../types/graph';
import { mapsApi } from '../../api/maps.api';
import { graphQueryKey } from '../../hooks/useGraphData';
import { useAuthStore } from '../../state/authStore';
import { ApiError } from '../../api/client';
import ProjectsDashboard from './ProjectsDashboard';

interface Section {
  map: MindMap;
  memberById: Map<string, MapMember>;
  nodes: GraphNode[];
}

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
  onOpenTask: (mapId: string, nodeId: string) => void;
  onCreateMap: (name: string, workspaceType: WorkspaceType) => Promise<void>;
  onOpenTeams: () => void;
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: '#8899aa',
  MEDIUM: '#4a90d9',
  HIGH: '#e08a3c',
  URGENT: '#d94f4f'
};

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Cross-project "My Work" home for Task Manager app mode - aggregates every
// task-enabled map the user owns or collaborates on into one place, grouped
// by map. It's a navigation surface, not an editor: clicking a task or a map
// header hands off to the existing single-map TaskListView/TaskEditPanel
// flow (via onOpenTask/onOpenMap) rather than re-implementing task editing,
// comments, and access control a second time here.
export default function TaskManagerHome({ maps, onOpenMap, onOpenTask, onCreateMap, onOpenTeams }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  // "All" by default, not "mine" - this aggregates across every project you
  // own or collaborate on, and defaulting to "assigned to me" made an
  // owner's own freshly-created (not-yet-assigned) work invisible on their
  // very first visit. Still switchable to "My Tasks" for a personal view.
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const taskMaps = maps.filter((m) => m.taskManagementEnabled);

  // Reuses the exact same per-map graph/members fetches (and cache keys) that
  // opening a single map already uses - see useGraphData.ts's graphQueryKey -
  // so jumping into a map from here doesn't refetch what's already cached.
  const graphQueries = useQueries({
    queries: taskMaps.map((m) => ({ queryKey: graphQueryKey(m.id), queryFn: () => mapsApi.graph(m.id) }))
  });
  const memberQueries = useQueries({
    queries: taskMaps.map((m) => ({ queryKey: ['members', m.id], queryFn: () => mapsApi.members(m.id) }))
  });

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      await onCreateMap(newBoardName.trim(), 'TASKS');
      setNewBoardName('');
      setShowNewBoard(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    }
  };

  const isLoading = graphQueries.some((q) => q.isLoading) || memberQueries.some((q) => q.isLoading);

  const sections = taskMaps
    .map((map, i): Section | null => {
      const graph = graphQueries[i].data;
      const members = memberQueries[i].data ?? [];
      if (!graph) return null;
      const memberById = new Map(members.map((mm) => [mm.id, mm]));
      const taskNodes = graph.nodes.filter((n) => n.isTask);
      const nodes =
        scope === 'mine' ? taskNodes.filter((n) => currentUserId != null && n.assigneeIds.includes(currentUserId)) : taskNodes;
      return { map, memberById, nodes };
    })
    .filter((s): s is Section => s !== null);

  return (
    <div className="maps-page">
      <ProjectsDashboard maps={maps} />

      <div className="maps-page-header">
        <h1>My Work</h1>
        <div className="inline-form">
          <div className="tag-chip-list">
            <button
              type="button"
              className={`tag-chip${scope === 'mine' ? ' tag-chip-active' : ''}`}
              onClick={() => setScope('mine')}
            >
              My Tasks
            </button>
            <button
              type="button"
              className={`tag-chip${scope === 'all' ? ' tag-chip-active' : ''}`}
              onClick={() => setScope('all')}
            >
              All Tasks
            </button>
          </div>
          <button className="action-btn" onClick={onOpenTeams} title="Create a reusable team, or manage existing ones">
            👥 Manage Teams
          </button>
          {showNewBoard && (
            <input
              autoFocus
              placeholder="Project name"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
            />
          )}
          <button
            className="action-btn primary"
            onClick={() => (showNewBoard ? handleCreateBoard() : setShowNewBoard(true))}
          >
            + New Project
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <div className="empty-state">Loading your tasks...</div>
      ) : taskMaps.length === 0 ? (
        <p className="hint-text maps-empty">No projects yet - create your first one above.</p>
      ) : (
        sections.map(({ map, nodes, memberById }) => (
          <div key={map.id} className="task-group">
            <h3 className="task-group-title task-manager-home-map-title" onClick={() => onOpenMap(map.id)}>
              {map.name} ({nodes.length})
            </h3>
            {nodes.length === 0 ? (
              <p className="hint-text">
                {scope === 'mine' ? 'No tasks assigned to you here.' : 'No tasks here yet.'}
              </p>
            ) : (
              <table className="manage-table">
                <tbody>
                  {nodes.map((task) => {
                    const assigneeNames = task.assigneeIds
                      .map((id) => memberById.get(id))
                      .filter((m): m is NonNullable<typeof m> => !!m)
                      .map((m) => m.name ?? m.email)
                      .join(', ');
                    return (
                      <tr key={task.id} className="task-row" onClick={() => onOpenTask(map.id, task.id)}>
                        <td>
                          {task.priority && (
                            <span className="task-priority-dot" style={{ background: PRIORITY_COLOR[task.priority] }} />
                          )}
                          {task.name}
                        </td>
                        {scope === 'all' && <td>{assigneeNames || 'Unassigned'}</td>}
                        <td>{task.dueDate ? formatDueDate(task.dueDate) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
    </div>
  );
}
