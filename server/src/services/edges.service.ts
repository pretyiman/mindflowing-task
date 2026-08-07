import type { Prisma, RelationType } from '@prisma/client';
import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';
import { getVisibleNodeIdFilter } from './visibility.js';

type HandleId = 'top' | 'bottom' | 'left' | 'right';

type EdgeInput = {
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId: string;
  labelOverride?: string | null;
  properties?: Record<string, unknown>;
  sourceHandle?: HandleId | null;
  targetHandle?: HandleId | null;
  colorOverride?: string | null;
  lineStyleOverride?: 'solid' | 'dashed' | 'dotted' | null;
  widthOverride?: number | null;
};

type EdgeUpdateInput = {
  labelOverride?: string | null;
  properties?: Record<string, unknown>;
  colorOverride?: string | null;
  lineStyleOverride?: 'solid' | 'dashed' | 'dotted' | null;
  widthOverride?: number | null;
};

/**
 * Enforces the application-level cardinality rules declared on a relation type
 * (max_outgoing_per_source / max_incoming_per_target). These are advisory columns,
 * not DB constraints, since the limit depends on which relation_type_id is involved.
 */
async function assertCardinality(
  client: Prisma.TransactionClient,
  relationType: RelationType,
  sourceNodeId: string,
  targetNodeId: string,
  excludeEdgeId?: string
) {
  if (relationType.maxOutgoingPerSource != null) {
    const count = await client.edge.count({
      where: {
        relationTypeId: relationType.id,
        sourceNodeId,
        id: excludeEdgeId ? { not: excludeEdgeId } : undefined
      }
    });
    if (count >= relationType.maxOutgoingPerSource) {
      throw new ConflictError(
        `"${relationType.name}" allows at most ${relationType.maxOutgoingPerSource} outgoing edge(s) per node; this source node already has ${count}.`
      );
    }
  }
  if (relationType.maxIncomingPerTarget != null) {
    const count = await client.edge.count({
      where: {
        relationTypeId: relationType.id,
        targetNodeId,
        id: excludeEdgeId ? { not: excludeEdgeId } : undefined
      }
    });
    if (count >= relationType.maxIncomingPerTarget) {
      throw new ConflictError(
        `"${relationType.name}" allows at most ${relationType.maxIncomingPerTarget} incoming edge(s) per node; this target node already has ${count}.`
      );
    }
  }
}

export async function listEdges(mapId: string, viewerId: string) {
  const edges = await prisma.edge.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } });
  const visible = await getVisibleNodeIdFilter(mapId, viewerId);
  if (visible === null) return edges;
  // An edge is only visible if BOTH endpoints are - one hidden node hides
  // the connection too, not just the node itself.
  return edges.filter((e) => visible.has(e.sourceNodeId) && visible.has(e.targetNodeId));
}

/**
 * Shared by the public edges route AND nodes.service (for auto-created hierarchy edges).
 * Runs inside the given transaction client so it composes with node create/update.
 */
export async function createEdgeInTx(
  client: Prisma.TransactionClient,
  mapId: string,
  data: EdgeInput
) {
  if (data.sourceNodeId === data.targetNodeId) {
    throw new ConflictError('A node cannot have a relationship to itself');
  }

  const [source, target, relationType] = await Promise.all([
    client.node.findUnique({ where: { id: data.sourceNodeId } }),
    client.node.findUnique({ where: { id: data.targetNodeId } }),
    client.relationType.findUnique({ where: { id: data.relationTypeId } })
  ]);
  if (!source || source.mapId !== mapId) throw new NotFoundError('Source node');
  if (!target || target.mapId !== mapId) throw new NotFoundError('Target node');
  if (!relationType || relationType.mapId !== mapId) throw new NotFoundError('Relation type');

  await assertCardinality(client, relationType, data.sourceNodeId, data.targetNodeId);

  try {
    return await client.edge.create({
      data: {
        mapId,
        sourceNodeId: data.sourceNodeId,
        targetNodeId: data.targetNodeId,
        relationTypeId: data.relationTypeId,
        labelOverride: data.labelOverride,
        properties: (data.properties ?? {}) as Prisma.InputJsonValue,
        sourceHandle: data.sourceHandle,
        targetHandle: data.targetHandle,
        colorOverride: data.colorOverride,
        lineStyleOverride: data.lineStyleOverride,
        widthOverride: data.widthOverride
      }
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new ConflictError('This exact relationship already exists between these two nodes');
    }
    throw err;
  }
}

export async function createEdge(mapId: string, data: EdgeInput, actorId: string) {
  const edge = await prisma.$transaction((tx) => createEdgeInTx(tx, mapId, data));
  const [source, target] = await Promise.all([
    prisma.node.findUnique({ where: { id: edge.sourceNodeId }, select: { name: true } }),
    prisma.node.findUnique({ where: { id: edge.targetNodeId }, select: { name: true } })
  ]);
  await logActivity(
    mapId,
    actorId,
    'create',
    'edge',
    edge.id,
    `Connected "${source?.name ?? 'a node'}" to "${target?.name ?? 'a node'}"`
  );
  return edge;
}

async function getEdgeOrThrow(id: string) {
  const edge = await prisma.edge.findUnique({ where: { id } });
  if (!edge) throw new NotFoundError('Edge');
  return edge;
}

export async function updateEdge(id: string, data: EdgeUpdateInput, actorId: string) {
  const existing = await getEdgeOrThrow(id);
  const updated = await prisma.edge.update({
    where: { id },
    data: { ...data, properties: data.properties as Prisma.InputJsonValue | undefined }
  });
  await logActivity(existing.mapId, actorId, 'update', 'edge', id, 'Updated an edge');
  return updated;
}

export async function deleteEdge(id: string, actorId: string) {
  const existing = await getEdgeOrThrow(id);
  await prisma.edge.delete({ where: { id } });
  await logActivity(existing.mapId, actorId, 'delete', 'edge', id, 'Deleted an edge');
}
