import { prisma } from '../db.js';
import { NotFoundError } from '../errors.js';

async function getNodeOrThrow(id: string) {
  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) throw new NotFoundError('Node');
  return node;
}

export async function getAccess(nodeId: string) {
  const node = await getNodeOrThrow(nodeId);
  const grants = await prisma.nodeAccessGrant.findMany({ where: { nodeId }, select: { userId: true } });
  return { restrictToGrantsOnly: node.restrictToGrantsOnly, userIds: grants.map((g) => g.userId) };
}

/** Replace-all: sets restrictToGrantsOnly and the full grant list in one go
 * (simplest to reason about from the UI's checklist + toggle). */
export async function setAccess(
  nodeId: string,
  data: { restrictToGrantsOnly: boolean; userIds: string[] }
) {
  const node = await getNodeOrThrow(nodeId);

  if (data.userIds.length > 0) {
    // Grants only make sense for the map's own collaborators - the owner
    // always sees everything already, and a non-collaborator can't access
    // the map at all regardless of a grant.
    const validCount = await prisma.mapCollaborator.count({
      where: { mapId: node.mapId, userId: { in: data.userIds } }
    });
    if (validCount !== new Set(data.userIds).size) {
      throw new NotFoundError('One or more users are not collaborators on this map');
    }
  }

  await prisma.$transaction([
    prisma.node.update({ where: { id: nodeId }, data: { restrictToGrantsOnly: data.restrictToGrantsOnly } }),
    prisma.nodeAccessGrant.deleteMany({ where: { nodeId } }),
    prisma.nodeAccessGrant.createMany({ data: data.userIds.map((userId) => ({ nodeId, userId })) })
  ]);

  return getAccess(nodeId);
}
