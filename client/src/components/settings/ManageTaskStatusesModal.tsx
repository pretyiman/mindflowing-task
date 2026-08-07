import { useState } from 'react';
import Modal from '../common/Modal';
import type { GraphData, TaskStatusKind } from '../../types/graph';
import { taskStatusesApi } from '../../api/taskStatuses.api';
import { ApiError } from '../../api/client';

interface Props {
  mapId: string;
  graph: GraphData;
  onClose: () => void;
  onChanged: () => void;
}

const KIND_LABEL: Record<TaskStatusKind, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done'
};
const KIND_CHOICES: TaskStatusKind[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export default function ManageTaskStatusesModal({ mapId, graph, onClose, onChanged }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#888888');
  const [kind, setKind] = useState<TaskStatusKind>('TODO');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const nextOrder = graph.taskStatuses.length;
      await taskStatusesApi.create(mapId, { name: name.trim(), color, order: nextOrder, kind });
      setName('');
      setKind('TODO');
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taskStatusesApi.remove(id);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as { nodeCount?: number } | undefined;
        const confirmed = window.confirm(
          `${err.message} Delete anyway? ${details?.nodeCount ?? 'All'} task(s) using it will lose their status (they are not deleted).`
        );
        if (confirmed) {
          await taskStatusesApi.remove(id, true);
          onChanged();
        }
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Failed to delete status');
    }
  };

  const handleMove = async (id: string, direction: -1 | 1) => {
    const sorted = [...graph.taskStatuses].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === id);
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    const current = sorted[index];
    try {
      await Promise.all([
        taskStatusesApi.update(current.id, { order: swapWith.order }),
        taskStatusesApi.update(swapWith.id, { order: current.order })
      ]);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reorder statuses');
    }
  };

  const handleKindChange = async (id: string, nextKind: TaskStatusKind) => {
    try {
      await taskStatusesApi.update(id, { kind: nextKind });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const sortedStatuses = [...graph.taskStatuses].sort((a, b) => a.order - b.order);

  return (
    <Modal title="Task Statuses" onClose={onClose}>
      {sortedStatuses.length === 0 && (
        <p className="hint-text">
          Create your first status (e.g. To Do, In Progress, Done) - the kind you pick (not the
          name) is what drives auto-tracked start/complete times and progress stats, so name it
          whatever you like.
        </p>
      )}
      <table className="manage-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Color</th>
            <th>Kind</th>
            <th>Tasks</th>
            <th>Order</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sortedStatuses.map((s, idx) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>
                <span className="color-swatch" style={{ background: s.color }} />
              </td>
              <td>
                <select value={s.kind} onChange={(e) => handleKindChange(s.id, e.target.value as TaskStatusKind)}>
                  {KIND_CHOICES.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </td>
              <td>{graph.nodes.filter((n) => n.taskStatusId === s.id).length}</td>
              <td style={{ display: 'flex', gap: 4 }}>
                <button
                  className="icon-btn"
                  onClick={() => handleMove(s.id, -1)}
                  disabled={idx === 0}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  onClick={() => handleMove(s.id, 1)}
                  disabled={idx === sortedStatuses.length - 1}
                  title="Move later"
                >
                  ↓
                </button>
              </td>
              <td>
                <button className="icon-btn" onClick={() => handleDelete(s.id)}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="add-form">
        <input placeholder="Status name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value as TaskStatusKind)}>
          {KIND_CHOICES.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button className="action-btn" onClick={handleCreate}>
          + Add Status
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
