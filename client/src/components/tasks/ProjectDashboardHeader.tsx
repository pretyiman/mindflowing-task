import type { GraphNode, TaskStatus } from '../../types/graph';
import { computeStats, type Pace } from '../../utils/taskStats';
import Sparkline from './Sparkline';
import PaceIndicator from './PaceIndicator';

interface Props {
  nodes: GraphNode[];
  taskStatuses: TaskStatus[];
  // Owner's project-wide view passes this in (computed from Map.targetDate);
  // the personal "My Tasks" view (non-owner, or an owner's own slice) omits
  // it entirely - pacing against a project-level target date doesn't mean
  // anything for one person's subset of the work.
  pace?: Pace | null;
  // Distinguishes "my own tasks in this project" from the project-wide
  // totals - same stat block, different node subset, so a label matters
  // here more than it did when this was owner-only and unambiguous.
  title?: string;
}

// The exact same stat block ProjectsDashboard.tsx shows per-row on the outer
// Projects list, rendered here (non-clickable - there's nowhere left to
// navigate, you're already inside this project) at the top of TaskListView,
// so "how is this project doing" is visible from inside it too, not just
// from the list you clicked it from. Generalized to take a plain `nodes`
// array (not the whole graph) so the SAME block can show either the
// project-wide totals (owner, all nodes) or one person's own slice
// (non-owner assignee, nodes pre-filtered to their own assigneeIds by the
// caller) - see TaskListView.tsx for both call sites.
export default function ProjectDashboardHeader({ nodes, taskStatuses, pace, title }: Props) {
  const stats = computeStats(nodes, taskStatuses);
  if (stats.total === 0) return null;

  return (
    <div className="project-dashboard-row project-dashboard-row-static tududi-card">
      <div className="project-dashboard-row-left">
        {title && <h3 className="dashboard-card-title">{title}</h3>}
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
      </div>
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
    </div>
  );
}
