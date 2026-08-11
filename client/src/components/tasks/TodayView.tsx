import type { MindMap } from '../../types/graph';
import { useMyTasks, type MyTask } from '../../hooks/useMyTasks';
import { PRIORITY_COLOR, statusPillStyle } from '../../constants/taskVisuals';
import { localDateKey } from '../../utils/dateKeys';
import Sparkline from './Sparkline';

interface Props {
  maps: MindMap[];
  onOpenTask: (mapId: string, nodeId: string) => void;
}

const TREND_DAYS = 14;

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// The sidebar's "Today" page - a cross-project personal agenda (tasks
// assigned to the current user, not everything in every project - this view
// is "what do I need to do", unlike TaskManagerHome's project-scoped "All
// Tasks" default) with a dashboard summary up top, mirroring the reference
// screenshot's Overview + Weekly Progress cards. Reuses the exact same
// per-map graph fetch (and cache key) TaskListView/ProjectsDashboard already
// use, so opening a project from here doesn't refetch.
export default function TodayView({ maps, onOpenTask }: Props) {
  const { myTasks, isLoading } = useMyTasks(maps);

  const today = localDateKey(new Date());
  const isDone = (t: MyTask) => t.statusKind === 'DONE';
  const dueKeyOf = (t: MyTask) => (t.dueDate ? localDateKey(new Date(t.dueDate)) : null);
  const overdueTasks = myTasks
    .filter((t) => !isDone(t) && dueKeyOf(t) !== null && (dueKeyOf(t) as string) < today)
    .sort((a, b) => (dueKeyOf(a) as string).localeCompare(dueKeyOf(b) as string));
  const dueTodayTasks = myTasks.filter((t) => !isDone(t) && dueKeyOf(t) === today);
  const inProgressCount = myTasks.filter((t) => t.statusKind === 'IN_PROGRESS').length;
  const completedTodayCount = myTasks.filter(
    (t) => t.completedAt && localDateKey(new Date(t.completedAt)) === today
  ).length;

  const trend: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    trend.push({ date: localDateKey(d), count: 0 });
  }
  const bucketByDate = new Map(trend.map((b) => [b.date, b]));
  for (const t of myTasks) {
    if (!t.completedAt) continue;
    const bucket = bucketByDate.get(localDateKey(new Date(t.completedAt)));
    if (bucket) bucket.count += 1;
  }

  const renderTaskCard = (task: MyTask) => {
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

  const todayLabel = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="tm-page">
      <div className="maps-page-header">
        <h1>Today, {todayLabel}</h1>
      </div>
      <p className="hint-text today-subtitle">Do something today that your future self will thank you for.</p>

      {isLoading ? (
        <div className="empty-state">Loading your tasks...</div>
      ) : (
        <>
          <div className="today-dashboard-row">
            <div className="tududi-card today-overview-card">
              <h3 className="dashboard-card-title">Overview</h3>
              <div className="dashboard-card-stats">
                <div className="dashboard-stat-row">
                  <span>📋 Total</span>
                  <strong>{myTasks.length}</strong>
                </div>
                <div className="dashboard-stat-row">
                  <span>🔄 In Progress</span>
                  <strong>{inProgressCount}</strong>
                </div>
                <div className="dashboard-stat-row">
                  <span>📅 Due Today</span>
                  <strong>{dueTodayTasks.length}</strong>
                </div>
                <div className="dashboard-stat-row dashboard-stat-row-overdue">
                  <span>⚠️ Overdue</span>
                  <strong>{overdueTasks.length}</strong>
                </div>
                <div className="dashboard-stat-row">
                  <span>✅ Completed Today</span>
                  <strong>{completedTodayCount}</strong>
                </div>
              </div>
            </div>
            <div className="tududi-card today-trend-card">
              <h3 className="dashboard-card-title">Weekly Progress</h3>
              <Sparkline trend={trend} />
            </div>
          </div>

          {overdueTasks.length > 0 && (
            <div className="task-group">
              <h3 className="task-group-title today-overdue-title">Overdue ({overdueTasks.length})</h3>
              <div className="task-card-list">{overdueTasks.map(renderTaskCard)}</div>
            </div>
          )}

          <div className="task-group">
            <h3 className="task-group-title">Due Today ({dueTodayTasks.length})</h3>
            {dueTodayTasks.length === 0 ? (
              <p className="hint-text">Nothing due today.</p>
            ) : (
              <div className="task-card-list">{dueTodayTasks.map(renderTaskCard)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
