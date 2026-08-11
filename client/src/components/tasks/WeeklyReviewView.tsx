import { useQueries } from '@tanstack/react-query';
import type { GraphNode, MindMap } from '../../types/graph';
import { mapsApi } from '../../api/maps.api';
import { graphQueryKey } from '../../hooks/useGraphData';
import { useMyTasks } from '../../hooks/useMyTasks';
import { PRIORITY_COLOR, statusPillStyle } from '../../constants/taskVisuals';
import { localDateKey } from '../../utils/dateKeys';

interface Props {
  maps: MindMap[];
  onOpenTask: (mapId: string, nodeId: string) => void;
}

type ReviewTask = GraphNode & {
  mapName: string;
  statusColor: string | null;
  statusName: string | null;
  statusKind: string | null;
};

// How long a task can sit in an IN_PROGRESS-kind status with no edit before
// it reads as "stuck" rather than just "actively being worked on right now".
const STUCK_THRESHOLD_DAYS = 7;

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// The sidebar's guided "Review" page - once a week (or whenever), a single
// screen surfacing what's slipping across projects you OWN (Overdue,
// Unassigned, Stuck In Progress - mirrors ProjectsDashboard/ActivityLog's
// owner-only scoping, since a collaborator doesn't need someone else's
// project-health detail) plus a personal completed-this-week recap (via
// useMyTasks, same as Today/Calendar). Deliberately one page, not a
// step-by-step wizard - matches how Today/Calendar are already single-screen
// dashboards rather than guided flows, so Review doesn't introduce a new UI
// pattern for what's fundamentally the same "here's what needs attention"
// shape. No new backend endpoint - reuses the exact graphQueryKey cache
// ProjectsDashboard/TaskListView already populate.
export default function WeeklyReviewView({ maps, onOpenTask }: Props) {
  const ownedProjects = maps.filter((m) => m.taskManagementEnabled && m.myRole === 'OWNER');
  const graphQueries = useQueries({
    queries: ownedProjects.map((m) => ({ queryKey: graphQueryKey(m.id), queryFn: () => mapsApi.graph(m.id) }))
  });
  const isLoadingOwned = graphQueries.some((q) => q.isLoading);

  const ownedTasks: ReviewTask[] = [];
  ownedProjects.forEach((project, i) => {
    const graph = graphQueries[i].data;
    if (!graph) return;
    const statusById = new Map(graph.taskStatuses.map((s) => [s.id, s]));
    for (const n of graph.nodes) {
      if (!n.isTask) continue;
      const status = n.taskStatusId ? statusById.get(n.taskStatusId) : undefined;
      ownedTasks.push({
        ...n,
        mapName: project.name,
        statusColor: status?.color ?? null,
        statusName: status?.name ?? null,
        statusKind: status?.kind ?? null
      });
    }
  });

  const today = localDateKey(new Date());
  const isDone = (t: ReviewTask) => t.statusKind === 'DONE';
  const dueKeyOf = (t: ReviewTask) => (t.dueDate ? localDateKey(new Date(t.dueDate)) : null);

  const overdueTasks = ownedTasks
    .filter((t) => !isDone(t) && dueKeyOf(t) !== null && (dueKeyOf(t) as string) < today)
    .sort((a, b) => (dueKeyOf(a) as string).localeCompare(dueKeyOf(b) as string));

  const unassignedTasks = ownedTasks.filter((t) => !isDone(t) && t.assigneeIds.length === 0);

  const stuckTasks = ownedTasks
    .filter((t) => t.statusKind === 'IN_PROGRESS' && daysSince(t.updatedAt) >= STUCK_THRESHOLD_DAYS)
    .sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt));

  const { myTasks, isLoading: isLoadingMine } = useMyTasks(maps);
  const completedThisWeek = myTasks
    .filter((t) => t.completedAt && daysSince(t.completedAt) < 7)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  const renderTaskCard = (task: ReviewTask, meta?: string) => {
    const accentColor = task.priority ? PRIORITY_COLOR[task.priority] : 'var(--border)';
    return (
      <div
        key={task.id}
        className="task-card priority-accent-card"
        style={{ borderLeftColor: accentColor }}
        onClick={() => onOpenTask(task.mapId, task.id)}
      >
        <div className="task-card-main">
          <span className="task-card-name">{task.name}</span>
          <div className="task-card-meta">
            <span>📁 {task.mapName}</span>
            {meta && <span>{meta}</span>}
            {task.dueDate && <span>📅 {formatDueDate(task.dueDate)}</span>}
          </div>
        </div>
        <span className="status-pill" style={statusPillStyle(task.statusColor ?? '#8899aa')}>
          <span className="status-pill-dot" />
          {task.statusName ?? 'No status'}
        </span>
      </div>
    );
  };

  const isLoading = isLoadingOwned || isLoadingMine;
  const nothingToReview =
    !isLoading &&
    overdueTasks.length === 0 &&
    unassignedTasks.length === 0 &&
    stuckTasks.length === 0 &&
    completedThisWeek.length === 0;

  return (
    <div className="tm-page">
      <div className="maps-page-header">
        <h1>Weekly Review</h1>
      </div>
      <p className="hint-text today-subtitle">
        A quick pass over your projects so nothing quietly slips through the cracks.
      </p>

      {isLoading ? (
        <div className="empty-state">Reviewing your projects...</div>
      ) : ownedProjects.length === 0 && myTasks.length === 0 ? (
        <p className="hint-text">
          Own or get assigned to a project first - Review checks project health across everything you manage.
        </p>
      ) : nothingToReview ? (
        <p className="hint-text">Nothing needs attention right now - everything's on track. 🎉</p>
      ) : (
        <>
          {overdueTasks.length > 0 && (
            <div className="task-group">
              <h3 className="task-group-title today-overdue-title">⚠️ Overdue ({overdueTasks.length})</h3>
              <div className="task-card-list">{overdueTasks.map((t) => renderTaskCard(t))}</div>
            </div>
          )}

          {unassignedTasks.length > 0 && (
            <div className="task-group">
              <h3 className="task-group-title">🙈 Unassigned ({unassignedTasks.length})</h3>
              <p className="hint-text" style={{ marginTop: -4 }}>
                Nobody's on the hook for these yet.
              </p>
              <div className="task-card-list">{unassignedTasks.map((t) => renderTaskCard(t))}</div>
            </div>
          )}

          {stuckTasks.length > 0 && (
            <div className="task-group">
              <h3 className="task-group-title">🐌 Stuck In Progress ({stuckTasks.length})</h3>
              <p className="hint-text" style={{ marginTop: -4 }}>
                Untouched for {STUCK_THRESHOLD_DAYS}+ days while marked in progress.
              </p>
              <div className="task-card-list">
                {stuckTasks.map((t) => renderTaskCard(t, `${daysSince(t.updatedAt)}d untouched`))}
              </div>
            </div>
          )}

          {completedThisWeek.length > 0 && (
            <div className="task-group">
              <h3 className="task-group-title">✅ Completed This Week ({completedThisWeek.length})</h3>
              <div className="task-card-list">{completedThisWeek.map((t) => renderTaskCard(t))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
