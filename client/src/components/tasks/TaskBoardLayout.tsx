import type { DragEvent } from 'react';
import type { GraphNode, MapMember, TaskPriority } from '../../types/graph';

interface Column {
  key: string;
  label: string;
  color: string;
  tasks: GraphNode[];
}

interface Props {
  columns: Column[];
  scope: 'all' | 'mine';
  canEdit: boolean;
  memberById: Map<string, MapMember>;
  onDropTask: (taskId: string, columnKey: string) => void;
  onSelectTask: (taskId: string) => void;
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: '#8899aa',
  MEDIUM: '#4a90d9',
  HIGH: '#e08a3c',
  URGENT: '#d94f4f'
};

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Frontend-only Kanban view over the same grouped-by-status data TaskListView
// already computes (see its `groups`) - native HTML5 drag-and-drop, no new
// dependency. Dropping a card on a column updates taskStatusId through the
// same nodesApi.update path the list view's quick-status-select already uses;
// no intra-column reordering in v1 (TaskStatus.order is still just an
// admin-set sort key with no drag endpoint of its own).
export default function TaskBoardLayout({ columns, scope, canEdit, memberById, onDropTask, onSelectTask }: Props) {
  const handleDrop = (e: DragEvent<HTMLDivElement>, columnKey: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) onDropTask(taskId, columnKey);
  };

  return (
    <div className="task-board">
      {columns.map((col) => (
        <div
          key={col.key}
          className="task-board-column"
          onDragOver={(e) => canEdit && e.preventDefault()}
          onDrop={(e) => canEdit && handleDrop(e, col.key)}
        >
          <h3 className="task-board-column-title">
            <span className="color-swatch" style={{ background: col.color }} /> {col.label} ({col.tasks.length})
          </h3>
          <div className="task-board-column-body">
            {col.tasks.map((task) => {
              const assigneeNames = task.assigneeIds
                .map((id) => memberById.get(id))
                .filter((m): m is NonNullable<typeof m> => !!m)
                .map((m) => m.name ?? m.email)
                .join(', ');
              return (
                <div
                  key={task.id}
                  className="task-board-card"
                  draggable={canEdit}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="task-board-card-title">
                    {task.priority && (
                      <span className="task-priority-dot" style={{ background: PRIORITY_COLOR[task.priority] }} />
                    )}
                    {task.name}
                  </div>
                  {(task.dueDate || (scope === 'all' && assigneeNames)) && (
                    <div className="task-board-card-meta">
                      {scope === 'all' && assigneeNames && <span>{assigneeNames}</span>}
                      {task.dueDate && <span>{formatDueDate(task.dueDate)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {col.tasks.length === 0 && <p className="hint-text task-board-column-empty">No tasks</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
