import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import type { GraphData, MapMember } from '../../types/graph';
import { mapsApi } from '../../api/maps.api';

interface Props {
  mapId: string;
  graph: GraphData;
  onClose: () => void;
}

const UNASSIGNED = '__unassigned__';

export default function ProgressPanel({ mapId, graph, onClose }: Props) {
  const [members, setMembers] = useState<MapMember[]>([]);

  useEffect(() => {
    mapsApi.members(mapId).then(setMembers);
  }, [mapId]);

  // A "task" is any node explicitly marked as one - see Node.isTask's own
  // comment. Matches the same definition TaskListView/TaskManagerHome use.
  const tasks = graph.nodes.filter((n) => n.isTask);
  const totalTasks = tasks.length;
  const statusById = new Map(graph.taskStatuses.map((s) => [s.id, s]));
  const doneCount = tasks.filter((n) => statusById.get(n.taskStatusId!)?.kind === 'DONE').length;
  const percent = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

  const byStatus = graph.taskStatuses.map((s) => ({
    status: s,
    count: tasks.filter((n) => n.taskStatusId === s.id).length
  }));

  const memberById = new Map(members.map((m) => [m.id, m]));
  // A task with multiple assignees counts once under each of them - the
  // numbers no longer have to sum to the total task count, which is
  // expected/correct once assignment isn't 1:1.
  const assigneeKeysOf = (n: (typeof tasks)[number]) => (n.assigneeIds.length > 0 ? n.assigneeIds : [UNASSIGNED]);
  const assigneeKeys = Array.from(new Set(tasks.flatMap(assigneeKeysOf)));
  const byAssignee = assigneeKeys
    .map((key) => {
      const member = key === UNASSIGNED ? null : memberById.get(key);
      return {
        key,
        label: key === UNASSIGNED ? 'Unassigned' : (member?.name ?? member?.email ?? 'Unknown'),
        count: tasks.filter((n) => assigneeKeysOf(n).includes(key)).length
      };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <Modal title="Progress" onClose={onClose}>
      {totalTasks === 0 ? (
        <p className="hint-text">
          No tasks yet - create one from the task list, or check "Track as a task" on a node.
        </p>
      ) : (
        <>
          <div className="progress-summary">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="progress-summary-text">
              {doneCount} of {totalTasks} done ({percent}%)
            </p>
          </div>

          <div className="property">
            <label>By Status</label>
            <table className="manage-table">
              <tbody>
                {byStatus.map(({ status, count }) => (
                  <tr key={status.id}>
                    <td>
                      <span className="color-swatch" style={{ background: status.color }} /> {status.name}
                      {status.kind === 'DONE' ? ' ✓' : status.kind === 'IN_PROGRESS' ? ' ⏳' : ''}
                    </td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="property">
            <label>By Assignee</label>
            <table className="manage-table">
              <tbody>
                {byAssignee.map(({ key, label, count }) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
