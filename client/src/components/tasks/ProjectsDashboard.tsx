import { useQueries } from '@tanstack/react-query';
import type { GraphNode, MindMap, TaskStatus } from '../../types/graph';
import { mapsApi } from '../../api/maps.api';
import { graphQueryKey } from '../../hooks/useGraphData';

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
}

const TREND_DAYS = 14;

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Same stat formulas ProgressPanel.tsx uses (isTask-filtered, done via
// taskStatus.kind === 'DONE'), plus an overdue count and a completed-per-day
// trend built from Node.completedAt, which is already tracked - no new
// backend endpoint or historical-snapshot machinery needed for this.
function computeStats(nodes: GraphNode[], taskStatuses: TaskStatus[]) {
  const statusById = new Map(taskStatuses.map((s) => [s.id, s]));
  const tasks = nodes.filter((n) => n.isTask);
  const total = tasks.length;
  const done = tasks.filter((n) => n.taskStatusId !== null && statusById.get(n.taskStatusId)?.kind === 'DONE').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const now = new Date();
  const overdue = tasks.filter(
    (n) => n.dueDate && (n.taskStatusId === null || statusById.get(n.taskStatusId)?.kind !== 'DONE') && new Date(n.dueDate) < now
  ).length;

  const today = new Date();
  const buckets: { date: string; count: number }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const bucketByDate = new Map(buckets.map((b) => [b.date, b]));
  for (const n of tasks) {
    if (!n.completedAt) continue;
    const bucket = bucketByDate.get(n.completedAt.slice(0, 10));
    if (bucket) bucket.count += 1;
  }

  return { total, done, percent, overdue, trend: buckets };
}

function Sparkline({ trend }: { trend: { date: string; count: number }[] }) {
  const max = Math.max(1, ...trend.map((b) => b.count));
  const barWidth = 6;
  const gap = 2;
  const height = 24;
  return (
    <svg width={trend.length * (barWidth + gap)} height={height} className="dashboard-sparkline">
      {trend.map((b, i) => {
        const barHeight = Math.max(1, Math.round((b.count / max) * (height - 2)));
        return (
          <rect
            key={b.date}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={b.count > 0 ? 'var(--accent)' : 'var(--border)'}
          >
            <title>
              {formatDay(b.date)}: {b.count} completed
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

// The Task Manager home page's project list - every task-enabled map the
// user owns or collaborates on, each a clickable card showing its total task
// count (regardless of stage) so "how many tasks does this project have" is
// visible without opening it. Owned projects additionally get the richer
// done/overdue/trend snapshot (mirrors the map-wide ActivityLog's owner-only
// visibility - a collaborator doesn't need burndown detail, just the count).
// Shares the same graphQueryKey cache TaskListView's own fetch already uses
// once you click in, so opening a project from here doesn't refetch.
export default function ProjectsDashboard({ maps, onOpenMap }: Props) {
  const projects = maps.filter((m) => m.taskManagementEnabled);

  const graphQueries = useQueries({
    queries: projects.map((m) => ({ queryKey: graphQueryKey(m.id), queryFn: () => mapsApi.graph(m.id) }))
  });

  if (projects.length === 0) return null;

  return (
    <div className="dashboard-cards">
      {projects.map((project, i) => {
        const graph = graphQueries[i].data;
        const isOwnerProject = project.myRole === 'OWNER';
        return (
          <button
            key={project.id}
            type="button"
            className="dashboard-card"
            onClick={() => onOpenMap(project.id)}
          >
            <h3 className="dashboard-card-title">{project.name}</h3>
            {!graph ? (
              <p className="hint-text">Loading...</p>
            ) : (
              (() => {
                const { total, done, percent, overdue, trend } = computeStats(graph.nodes, graph.taskStatuses);
                if (total === 0) return <p className="hint-text">No tasks yet.</p>;
                const taskCountText = `${total} task${total === 1 ? '' : 's'}`;
                if (!isOwnerProject) return <p className="progress-summary-text">{taskCountText}</p>;
                return (
                  <>
                    <div className="progress-summary">
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="progress-summary-text">
                        {taskCountText} · {done} done ({percent}%){overdue > 0 ? ` · ${overdue} overdue` : ''}
                      </p>
                    </div>
                    <Sparkline trend={trend} />
                  </>
                );
              })()
            )}
          </button>
        );
      })}
    </div>
  );
}
