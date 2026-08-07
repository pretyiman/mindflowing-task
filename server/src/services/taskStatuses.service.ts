import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';

type TaskStatusInput = {
  name: string;
  color?: string;
  order?: number;
  kind?: 'TODO' | 'IN_PROGRESS' | 'DONE';
};

export async function listTaskStatuses(mapId: string) {
  return prisma.taskStatus.findMany({ where: { mapId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
}

export async function createTaskStatus(mapId: string, data: TaskStatusInput, actorId: string) {
  let status;
  try {
    status = await prisma.taskStatus.create({ data: { mapId, ...data } });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new ConflictError(`A status named "${data.name}" already exists in this map`);
    }
    if (err?.code === 'P2003') {
      throw new NotFoundError('Map');
    }
    throw err;
  }
  await logActivity(mapId, actorId, 'create', 'taskStatus', status.id, `Created task status "${status.name}"`);
  return status;
}

async function getTaskStatusOrThrow(id: string) {
  const status = await prisma.taskStatus.findUnique({ where: { id } });
  if (!status) throw new NotFoundError('Task status');
  return status;
}

export async function updateTaskStatus(id: string, data: Partial<TaskStatusInput>, actorId: string) {
  const existing = await getTaskStatusOrThrow(id);
  let updated;
  try {
    updated = await prisma.taskStatus.update({ where: { id }, data });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new ConflictError(`A status named "${data.name}" already exists in this map`);
    }
    throw err;
  }
  await logActivity(existing.mapId, actorId, 'update', 'taskStatus', id, `Updated task status "${updated.name}"`);
  return updated;
}

export async function deleteTaskStatus(id: string, force: boolean, actorId: string) {
  const existing = await getTaskStatusOrThrow(id);
  const nodeCount = await prisma.node.count({ where: { taskStatusId: id } });
  if (nodeCount > 0 && !force) {
    throw new ConflictError(
      `Task status is used by ${nodeCount} node(s). Pass force=true to delete the status (those nodes lose their status, not deleted).`,
      { nodeCount }
    );
  }
  if (nodeCount > 0) {
    await prisma.node.updateMany({ where: { taskStatusId: id }, data: { taskStatusId: null } });
  }
  await prisma.taskStatus.delete({ where: { id } });
  await logActivity(existing.mapId, actorId, 'delete', 'taskStatus', id, `Deleted task status "${existing.name}"`);
}
