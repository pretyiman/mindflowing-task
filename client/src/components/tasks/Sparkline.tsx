// Shared by ProjectsDashboard (per-project trend) and TodayView (cross-project
// "my tasks" trend) - a completed-per-day bar chart built from Node.completedAt,
// which is already tracked server-side, so no new endpoint or historical-
// snapshot machinery is needed for either.
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const VIEWBOX_HEIGHT = 32;
const GAP_RATIO = 0.3; // fraction of each bar's own slot left as gap

// A viewBox-based (not fixed-pixel) chart, stretched by CSS to fill whatever
// width its container gives it (see .dashboard-sparkline) - this is what
// actually lets TodayView's wider "Weekly Progress" card show a wider chart,
// rather than the same small fixed-size chart floating in extra white space.
export default function Sparkline({ trend }: { trend: { date: string; count: number }[] }) {
  const max = Math.max(1, ...trend.map((b) => b.count));
  const slot = 100 / trend.length;
  const barWidth = slot * (1 - GAP_RATIO);
  return (
    <svg
      viewBox={`0 0 100 ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="dashboard-sparkline"
      role="img"
    >
      {trend.map((b, i) => {
        const barHeight = Math.max(1, (b.count / max) * (VIEWBOX_HEIGHT - 2));
        const x = i * slot + (slot - barWidth) / 2;
        return (
          <rect
            key={b.date}
            x={x}
            y={VIEWBOX_HEIGHT - barHeight}
            width={barWidth}
            height={barHeight}
            rx={0.6}
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
