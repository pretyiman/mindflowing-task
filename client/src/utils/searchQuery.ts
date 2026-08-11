import type { MapMember, TaskPriority } from '../types/graph';
import type { DueFilterValue } from '../components/graph/filterGraph';

export interface SearchQueryOperators {
  priority: TaskPriority;
  dueFilter: DueFilterValue;
  taskStatusId: string;
  assigneeId: string;
}

const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  low: 'LOW',
  l: 'LOW',
  medium: 'MEDIUM',
  med: 'MEDIUM',
  m: 'MEDIUM',
  high: 'HIGH',
  h: 'HIGH',
  urgent: 'URGENT',
  u: 'URGENT'
};

const DUE_VALUES: DueFilterValue[] = ['overdue', 'today', 'week', 'none'];

/**
 * Parses `priority:high due:today assignee:dummy free text` into the same
 * filter dimensions the dropdown popover already exposes (FilterPanel.tsx) -
 * not a new filtering capability, just a faster input method for the exact
 * same ones. Unrecognized/unmatched tokens (a typo'd operator, an assignee
 * substring that matches nobody) fall through as plain free text rather than
 * silently vanishing, so a token never just disappears without explanation.
 * Called on Enter (see Toolbar.tsx), not on every keystroke - the box shows
 * exactly what you type while typing, and only "resolves" into filters +
 * remaining free text once you commit.
 */
export function parseSearchQuery(
  raw: string,
  taskStatuses: { id: string; name: string }[],
  members: MapMember[]
): { freeText: string; operators: Partial<SearchQueryOperators> } {
  const tokens = raw.split(/\s+/).filter(Boolean);
  const remaining: string[] = [];
  const operators: Partial<SearchQueryOperators> = {};

  for (const token of tokens) {
    const match = token.match(/^(\w+):(.+)$/);
    if (!match) {
      remaining.push(token);
      continue;
    }
    const [, key, valueRaw] = match;
    const value = valueRaw.toLowerCase();
    let matched = false;

    switch (key.toLowerCase()) {
      case 'priority': {
        const p = PRIORITY_ALIASES[value];
        if (p) {
          operators.priority = p;
          matched = true;
        }
        break;
      }
      case 'due': {
        if ((DUE_VALUES as string[]).includes(value)) {
          operators.dueFilter = value as DueFilterValue;
          matched = true;
        }
        break;
      }
      case 'status': {
        const status = taskStatuses.find((s) => s.name.toLowerCase().includes(value));
        if (status) {
          operators.taskStatusId = status.id;
          matched = true;
        }
        break;
      }
      case 'assignee': {
        const member = members.find(
          (m) => (m.name ?? '').toLowerCase().includes(value) || m.email.toLowerCase().includes(value)
        );
        if (member) {
          operators.assigneeId = member.id;
          matched = true;
        }
        break;
      }
    }

    if (!matched) remaining.push(token);
  }

  return { freeText: remaining.join(' '), operators };
}
