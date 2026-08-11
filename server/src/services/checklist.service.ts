import { prisma } from '../db.js';
import { AppError, NotFoundError } from '../errors.js';

export async function listChecklistItems(nodeId: string) {
  return prisma.checklistItem.findMany({ where: { nodeId }, orderBy: { order: 'asc' } });
}

export async function createChecklistItem(nodeId: string, text: string) {
  const node = await prisma.node.findUnique({ where: { id: nodeId }, select: { id: true } });
  if (!node) throw new NotFoundError('Node');

  // Appends to the end - the next order value is simply "how many items
  // already exist", no need to track a separate counter or look at the max.
  const count = await prisma.checklistItem.count({ where: { nodeId } });
  return prisma.checklistItem.create({ data: { nodeId, text, order: count } });
}

export async function updateChecklistItem(id: string, data: { text?: string; done?: boolean }) {
  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Checklist item');
  return prisma.checklistItem.update({ where: { id }, data });
}

export async function deleteChecklistItem(id: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Checklist item');
  await prisma.checklistItem.delete({ where: { id } });
}

/**
 * A full rewrite of every item's order to match orderedIds exactly, not a
 * partial shuffle - simpler and race-free (two people dragging at once just
 * means the last PATCH wins outright, rather than partially-applied
 * reordering interleaving into something inconsistent). orderedIds must be
 * exactly this task's current checklist item ids, just reordered - anything
 * else (missing/extra/foreign id) is rejected rather than silently
 * reconciled, since a mismatch means the client's view was stale.
 */
export async function reorderChecklistItems(nodeId: string, orderedIds: string[]) {
  const items = await prisma.checklistItem.findMany({ where: { nodeId }, select: { id: true } });
  const currentIds = new Set(items.map((i) => i.id));
  const isExactMatch = orderedIds.length === items.length && orderedIds.every((id) => currentIds.has(id));
  if (!isExactMatch) {
    throw new AppError(400, 'BAD_REQUEST', 'orderedIds must match this checklist\'s current items exactly');
  }

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.checklistItem.update({ where: { id }, data: { order: index } }))
  );
  return listChecklistItems(nodeId);
}
