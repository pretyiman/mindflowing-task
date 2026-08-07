import { prisma } from '../db.js';

/**
 * Resolves which node IDs a given viewer can see on a map, per the scoped-
 * access rule: the owner sees all; a map with restrictedAccessEnabled off
 * shows everyone everything (today's behavior, unchanged); otherwise a node
 * is visible if the viewer has an explicit NodeAccessGrant, OR (the node
 * isn't restrictToGrantsOnly AND it carries a tag the viewer is scoped to
 * via CollaboratorTagScope).
 *
 * Returns null to mean "no filtering needed" (the two "sees everything"
 * cases), so callers can skip the extra queries/filtering entirely in the
 * common case - a map that never turns this on pays zero extra cost.
 */
export async function getVisibleNodeIdFilter(
  mapId: string,
  viewerId: string
): Promise<Set<string> | null> {
  const map = await prisma.map.findUnique({
    where: { id: mapId },
    select: { ownerId: true, restrictedAccessEnabled: true }
  });
  if (!map || map.ownerId === viewerId || !map.restrictedAccessEnabled) return null;

  const collaborator = await prisma.mapCollaborator.findUnique({
    where: { mapId_userId: { mapId, userId: viewerId } },
    select: { id: true }
  });

  const [scopedTags, grants] = await Promise.all([
    collaborator
      ? prisma.collaboratorTagScope.findMany({
          where: { collaboratorId: collaborator.id },
          select: { tagId: true }
        })
      : Promise.resolve([]),
    prisma.nodeAccessGrant.findMany({
      where: { userId: viewerId, node: { mapId } },
      select: { nodeId: true }
    })
  ]);

  const scopedTagIds = scopedTags.map((s) => s.tagId);
  const grantedNodeIds = grants.map((g) => g.nodeId);

  const tagScopedNodeIds = scopedTagIds.length
    ? (
        await prisma.node.findMany({
          where: { mapId, restrictToGrantsOnly: false, nodeTags: { some: { tagId: { in: scopedTagIds } } } },
          select: { id: true }
        })
      ).map((n) => n.id)
    : [];

  return new Set([...grantedNodeIds, ...tagScopedNodeIds]);
}

/** Convenience for a single node: is this viewer allowed to see it at all. */
export async function isNodeVisible(nodeId: string, mapId: string, viewerId: string): Promise<boolean> {
  const filter = await getVisibleNodeIdFilter(mapId, viewerId);
  return filter === null || filter.has(nodeId);
}
