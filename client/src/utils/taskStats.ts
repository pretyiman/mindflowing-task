import type { GraphNode, TaskStatus } from '../types/graph';
import { localDateKey } from './dateKeys';

const TREND_DAYS = 14;

export interface ProjectStats {
  total: number;
  done: number;
  inProgress: number;
  percent: number;
  overdue: number;
  dueToday: number;
  completedToday: number;
  trend: { date: string; count: number }[];
}

// Same stat formulas ProgressPanel.tsx uses (isTask-filtered, done via
// taskStatus.kind === 'DONE'), plus in-progress/due-today/overdue/completed-
// today counts and a completed-per-day trend built from Node.completedAt,
// which is already tracked - no new backend endpoint or historical-snapshot
// machinery needed for this. Shared by ProjectsDashboard.tsx (the outer
// Projects list) and TaskListView.tsx (the same stats, inline, for the ONE
// project you're currently inside) so both always agree.
export function computeStats(nodes: GraphNode[], taskStatuses: TaskStatus[]): ProjectStats {
  const statusById = new Map(taskStatuses.map((s) => [s.id, s]));
  const tasks = nodes.filter((n) => n.isTask);
  const total = tasks.length;
  const isDone = (n: GraphNode) => n.taskStatusId !== null && statusById.get(n.taskStatusId)?.kind === 'DONE';
  const done = tasks.filter(isDone).length;
  const inProgress = tasks.filter(
    (n) => n.taskStatusId !== null && statusById.get(n.taskStatusId)?.kind === 'IN_PROGRESS'
  ).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const today = localDateKey(new Date());
  const dueKeyOf = (n: GraphNode) => (n.dueDate ? localDateKey(new Date(n.dueDate)) : null);
  const overdue = tasks.filter((n) => !isDone(n) && dueKeyOf(n) !== null && (dueKeyOf(n) as string) < today).length;
  const dueToday = tasks.filter((n) => !isDone(n) && dueKeyOf(n) === today).length;
  const completedToday = tasks.filter(
    (n) => n.completedAt && localDateKey(new Date(n.completedAt)) === today
  ).length;

  const trend: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    trend.push({ date: localDateKey(d), count: 0 });
  }
  const bucketByDate = new Map(trend.map((b) => [b.date, b]));
  for (const n of tasks) {
    if (!n.completedAt) continue;
    const bucket = bucketByDate.get(localDateKey(new Date(n.completedAt)));
    if (bucket) bucket.count += 1;
  }

  return { total, done, inProgress, percent, overdue, dueToday, completedToday, trend };
}

export type Pace = {
  daysRemaining: number;
  // null when the window itself is degenerate (targetDate <= createdAt) -
  // there's no meaningful "% of the way through the timeline" to compare
  // against, so only days-remaining is shown, no ahead/behind judgment.
  expectedPercent: number | null;
  status: 'ahead' | 'on-track' | 'behind' | 'overdue';
};

const DAY_MS = 24 * 60 * 60 * 1000;
// How far actual can trail expected before it reads as "behind" rather than
// "on track" - a couple of percentage points of noise shouldn't flip the
// label back and forth.
const PACE_TOLERANCE = 5;

// Compares "% of tasks done" against "% of the createdAt→targetDate window
// elapsed" - the actual "progress vs remaining time" signal this whole
// feature is for. Returns null when the project has no targetDate at all
// (the common case - this is opt-in, see schema.prisma's Map.targetDate).
export function computePace(createdAt: string, targetDate: string | null, percent: number): Pace | null {
  if (!targetDate) return null;
  const start = new Date(createdAt).getTime();
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const daysRemaining = Math.ceil((target - now) / DAY_MS);

  const totalMs = target - start;
  if (totalMs <= 0) {
    return { daysRemaining, expectedPercent: null, status: daysRemaining < 0 ? 'overdue' : 'on-track' };
  }

  const elapsedRatio = Math.min(1, Math.max(0, (now - start) / totalMs));
  const expectedPercent = Math.round(elapsedRatio * 100);
  let status: Pace['status'];
  if (daysRemaining < 0 && percent < 100) status = 'overdue';
  else if (percent >= expectedPercent - PACE_TOLERANCE) status = percent > expectedPercent + PACE_TOLERANCE ? 'ahead' : 'on-track';
  else status = 'behind';

  return { daysRemaining, expectedPercent, status };
}

export const PACE_LABEL: Record<Pace['status'], string> = {
  ahead: 'Ahead of schedule',
  'on-track': 'On track',
  behind: 'Behind schedule',
  overdue: 'Overdue'
};
