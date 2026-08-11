// Local calendar date (YYYY-MM-DD), not UTC - toISOString() is always UTC
// and would misclassify a date near a timezone boundary (e.g. a task due
// "today" could show as overdue-by-one-day, or vice versa, for anyone not at
// UTC+0). Used anywhere "today" needs to be compared against a task's
// dueDate/completedAt, so every comparison site agrees on what "today" means -
// see TodayView.tsx and ProjectsDashboard.tsx.
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
