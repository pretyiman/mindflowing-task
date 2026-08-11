import type { CSSProperties } from 'react';
import type { RecurrenceRule, TaskPriority } from '../types/graph';

// Single source of truth for priority color/label - was duplicated
// identically across TaskListView/TaskEditPanel/NodeDetailPanel/CustomNode.
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: '#8899aa',
  MEDIUM: '#4a90d9',
  HIGH: '#e08a3c',
  URGENT: '#d94f4f'
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent'
};

// Highest first - used by TaskListView's "Sort by Priority".
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export const RECURRENCE_LABEL: Record<RecurrenceRule, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  WEEKDAYS: 'Weekdays'
};

// Tints a task status's own custom color (hex, validated server-side as
// #RRGGBB) into a soft pill background/border, keeping the color itself as
// the text/dot color - works for any color the user picks in Manage
// Statuses, not just a fixed palette. Pair with the .status-pill class.
export function statusPillStyle(color: string): CSSProperties {
  return {
    background: `${color}22`,
    color,
    borderColor: `${color}55`
  };
}
