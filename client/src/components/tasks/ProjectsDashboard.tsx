import { useQueries } from '@tanstack/react-query';
import type { MindMap } from '../../types/graph';
import { mapsApi } from '../../api/maps.api';
import { graphQueryKey } from '../../hooks/useGraphData';
import { computeStats, computePace } from '../../utils/taskStats';
import Sparkline from './Sparkline';
import PaceIndicator from './PaceIndicator';

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
}

// The Task Manager home page's project list - every task-enabled map the
// user owns or collaborates on, each a clickable full-width row (a list, not
// a card grid - a grid of narrow cards wasted most of the page's width and
// couldn't fit a real stat breakdown). Owned projects get the full
// Today-style dashboard (stats + progress bar + trend); non-owner ones just
// get the task count (mirrors the map-wide ActivityLog's owner-only
// visibility - a collaborator doesn't need burndown detail). Shares the same
// graphQueryKey cache TaskListView's own fetch already uses, so opening a
// project from here doesn't refetch.
export default function ProjectsDashboard({ maps, onOpenMap }: Props) {
  const projects = maps.filter((m) => m.taskManagementEnabled);

  const graphQueries = useQueries({
    queries: projects.map((m) => ({ queryKey: graphQueryKey(m.id), queryFn: () => mapsApi.graph(m.id) }))
  });

  if (projects.length === 0) return null;

  return (
    <div className="project-dashboard-list">
      {projects.map((project, i) => {
        const graph = graphQueries[i].data;
        const isOwnerProject = project.myRole === 'OWNER';

        if (!graph) {
          return (
            <button key={project.id} type="button" className="project-dashboard-row tududi-card" onClick={() => onOpenMap(project.id)}>
              <h3 className="dashboard-card-title">{project.name}</h3>
              <p className="hint-text">Loading...</p>
            </button>
          );
        }

        const stats = computeStats(graph.nodes, graph.taskStatuses);
        const pace = computePace(project.createdAt, project.targetDate, stats.percent);

        if (!isOwnerProject) {
          return (
            <button
              key={project.id}
              type="button"
              className="project-dashboard-row project-dashboard-row-simple tududi-card"
              onClick={() => onOpenMap(project.id)}
            >
              <h3 className="dashboard-card-title">{project.name}</h3>
              <p className="progress-summary-text">
                {stats.total === 0 ? 'No tasks yet' : `${stats.total} task${stats.total === 1 ? '' : 's'}`}
              </p>
            </button>
          );
        }

        return (
          <button key={project.id} type="button" className="project-dashboard-row tududi-card" onClick={() => onOpenMap(project.id)}>
            <div className="project-dashboard-row-left">
              <h3 className="dashboard-card-title">{project.name}</h3>
              {stats.total === 0 ? (
                <p className="hint-text">No tasks yet.</p>
              ) : (
                <div className="dashboard-card-stats">
                  <div className="dashboard-stat-row">
                    <span>📋 Total</span>
                    <strong>{stats.total}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>🔄 In Progress</span>
                    <strong>{stats.inProgress}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>📅 Due Today</span>
                    <strong>{stats.dueToday}</strong>
                  </div>
                  <div className="dashboard-stat-row dashboard-stat-row-overdue">
                    <span>⚠️ Overdue</span>
                    <strong>{stats.overdue}</strong>
                  </div>
                  <div className="dashboard-stat-row">
                    <span>✅ Completed Today</span>
                    <strong>{stats.completedToday}</strong>
                  </div>
                </div>
              )}
            </div>
            {stats.total > 0 && (
              <div className="project-dashboard-row-right">
                <div className="progress-summary">
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
                  </div>
                  <p className="progress-summary-text">{stats.percent}% complete</p>
                  {pace && <PaceIndicator pace={pace} />}
                </div>
                <Sparkline trend={stats.trend} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
