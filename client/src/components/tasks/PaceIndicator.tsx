import { PACE_LABEL, type Pace } from '../../utils/taskStats';

export default function PaceIndicator({ pace }: { pace: Pace }) {
  const daysText =
    pace.daysRemaining < 0
      ? `${Math.abs(pace.daysRemaining)} day${Math.abs(pace.daysRemaining) === 1 ? '' : 's'} overdue`
      : pace.daysRemaining === 0
        ? 'Due today'
        : `${pace.daysRemaining} day${pace.daysRemaining === 1 ? '' : 's'} left`;
  return (
    <p className={`pace-text pace-${pace.status}`}>
      {daysText} · {PACE_LABEL[pace.status]}
    </p>
  );
}
