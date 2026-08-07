import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';

export async function listTags(mapId: string) {
  return prisma.tag.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } });
}

export async function createTag(mapId: string, data: { name: string; color?: string }, actorId: string) {
  let tag;
  try {
    tag = await prisma.tag.create({ data: { mapId, ...data } });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new ConflictError(`A tag named "${data.name}" already exists in this map`);
    }
    if (err?.code === 'P2003') {
      throw new NotFoundError('Map');
    }
    throw err;
  }
  await logActivity(mapId, actorId, 'create', 'tag', tag.id, `Created tag "${tag.name}"`);
  return tag;
}

async function getTagOrThrow(id: string) {
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) throw new NotFoundError('Tag');
  return tag;
}

export async function updateTag(id: string, data: { name?: string; color?: string }, actorId: string) {
  const existing = await getTagOrThrow(id);
  let updated;
  try {
    updated = await prisma.tag.update({ where: { id }, data });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new ConflictError(`A tag named "${data.name}" already exists in this map`);
    }
    throw err;
  }
  await logActivity(existing.mapId, actorId, 'update', 'tag', id, `Updated tag "${updated.name}"`);
  return updated;
}

export async function deleteTag(id: string, force: boolean, actorId: string) {
  const existing = await getTagOrThrow(id);
  const nodeCount = await prisma.nodeTag.count({ where: { tagId: id } });
  if (nodeCount > 0 && !force) {
    throw new ConflictError(
      `Tag is used by ${nodeCount} node(s). Pass force=true to remove it from those nodes and delete it.`,
      { nodeCount }
    );
  }
  // Deleting the tag alone is enough - node_tags rows cascade-delete via the FK;
  // unlike categories, the nodes themselves are never touched.
  await prisma.tag.delete({ where: { id } });
  await logActivity(existing.mapId, actorId, 'delete', 'tag', id, `Deleted tag "${existing.name}"`);
}
