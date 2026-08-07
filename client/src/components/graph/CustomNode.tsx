import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import type { TaskPriority } from '../../types/graph';
import type { RFEntityNode } from './graphAdapter';
import { useNodeInteraction } from './NodeInteractionContext';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: '#8899aa',
  MEDIUM: '#4a90d9',
  HIGH: '#e08a3c',
  URGENT: '#d94f4f'
};

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CustomNode({ id, data, selected }: NodeProps<RFEntityNode>) {
  const { categories, onQuickAdd, canEdit, isOwner, taskManagementEnabled, taskStatuses, members } =
    useNodeInteraction();
  const isRestricted = isOwner && (data.raw.restrictToGrantsOnly || data.raw.hasAccessGrants);

  const isTrackedTask = taskManagementEnabled && data.raw.isTask;
  const taskStatus = isTrackedTask ? taskStatuses.find((s) => s.id === data.raw.taskStatusId) : undefined;
  const assignees = isTrackedTask
    ? data.raw.assigneeIds.map((aid) => members.find((m) => m.id === aid)).filter((m): m is NonNullable<typeof m> => !!m)
    : [];
  const isOverdue =
    isTrackedTask &&
    !!data.raw.dueDate &&
    taskStatus?.kind !== 'DONE' &&
    new Date(data.raw.dueDate) < new Date();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(data.categoryId ?? '');
  const [error, setError] = useState<string | null>(null);
  const quickAddPopoverRef = useRef<HTMLDivElement>(null);

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setName('');
    setError(null);
  }, []);

  // Same cancel affordances as the toolbar's Add Node popover - Esc or a
  // click outside both back out without creating anything.
  useEffect(() => {
    if (!showQuickAdd) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeQuickAdd();
    };
    const handleClickAway = (e: MouseEvent) => {
      if (quickAddPopoverRef.current && !quickAddPopoverRef.current.contains(e.target as Node)) {
        closeQuickAdd();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    // Capture phase - React Flow's node/pane handlers stop propagation on
    // their own mousedown (for drag/pan), which would otherwise swallow this
    // before it ever reaches a bubble-phase document listener.
    document.addEventListener('mousedown', handleClickAway, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickAway, true);
    };
  }, [showQuickAdd, closeQuickAdd]);

  const handleQuickAdd = async () => {
    if (!name.trim()) return;
    try {
      await onQuickAdd(id, { name: name.trim(), categoryId: categoryId || null });
      setName('');
      setError(null);
      setShowQuickAdd(false);
    } catch (err) {
      // Only close/clear on success - on failure the popover stays open with the
      // error visible, so a failed add is never mistaken for silently doing nothing.
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to add node');
    }
  };

  return (
    <div
      className={`flow-node${selected ? ' flow-node-selected' : ''}${isOverdue ? ' flow-node-overdue' : ''}`}
      style={{ borderColor: isOverdue ? undefined : data.color }}
      title={data.raw.dueDate ? `Due ${formatDueDate(data.raw.dueDate)}${isOverdue ? ' (overdue)' : ''}` : undefined}
    >
      {/* Four connection points with a fixed in/out convention (mirrors mindmup's
          top-down tree plus left-right pairing): top/left always receive a wire,
          bottom/right always send one. Which pair you actually drag from is stored
          per-edge (sourceHandle/targetHandle), so reloading never collapses an
          edge back onto the wrong handle. */}
      <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
      <Handle type="target" position={Position.Left} id="left" className="flow-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
      <Handle type="source" position={Position.Right} id="right" className="flow-handle" />

      <span className="flow-node-icon">{data.icon}</span>
      <span className="flow-node-name" title={data.name}>
        {data.name}
      </span>
      {isRestricted && (
        <span
          className="flow-node-lock-badge"
          title={data.raw.restrictToGrantsOnly ? 'Restricted to specific people' : 'Has extra per-person access grants'}
        >
          🔒
        </span>
      )}

      {taskManagementEnabled && data.raw.priority && (
        <span
          className="flow-node-priority-dot"
          style={{ background: PRIORITY_COLOR[data.raw.priority] }}
          title={`Priority: ${data.raw.priority.charAt(0)}${data.raw.priority.slice(1).toLowerCase()}`}
        />
      )}

      {taskManagementEnabled && assignees.length > 0 && (
        <span
          className="flow-node-assignee-badge"
          title={`Assigned to ${assignees.map((a) => a.name ?? a.email).join(', ')}`}
        >
          {(assignees[0].name ?? assignees[0].email).charAt(0).toUpperCase()}
          {assignees.length > 1 ? `+${assignees.length - 1}` : ''}
        </span>
      )}

      {taskManagementEnabled && taskStatus && (
        <span
          className="flow-node-status-strip"
          style={{ background: taskStatus.color }}
          title={`Status: ${taskStatus.name}`}
        />
      )}

      {selected && canEdit && (
        <button
          className="flow-node-quick-add"
          title="Add connected node"
          onClick={(e) => {
            e.stopPropagation();
            setError(null);
            setShowQuickAdd((v) => !v);
          }}
        >
          +
        </button>
      )}

      {showQuickAdd && (
        <div className="flow-quick-add-popover" ref={quickAddPopoverRef} onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            placeholder="Node name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <div className="canvas-add-node-actions">
            <button className="action-btn" onClick={handleQuickAdd}>
              Add
            </button>
            <button className="action-btn" onClick={closeQuickAdd}>
              Cancel
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
