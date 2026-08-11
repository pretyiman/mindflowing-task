import type { Prisma, RelationType } from '@prisma/client';
import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';
import { notifyAssignment } from './nodes.service.js';
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

function emailPropertyOf(properties: Prisma.JsonValue): string | null {
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return null;
  const email = (properties as Record<string, unknown>).email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

// Discriminated outcome so the client can tell the owner *why* nothing
// happened instead of it being a silent no-op - a matching email alone
// looking right but the person never having accepted their invite (still
// pending), or not being on this map at all, or a task/map name typo in the
// email property, are all easy to get wrong and impossible to debug from the
// UI otherwise. 'not-applicable' (not a task<->non-task edge, or drawn by a
// non-owner) is deliberately NOT surfaced as a hint - it's the common case
// for ordinary graph edges and would just be noise.
export type AutoAssignOutcome =
  | { status: 'not-applicable' }
  | { status: 'assigned'; personName: string; personEmail: string }
  | { status: 'already-assigned'; personName: string }
  | { status: 'no-email'; personName: string }
  | { status: 'no-match'; personName: string; email: string };

/**
 * Drawing an ordinary connection between a task node and a non-task node
 * (e.g. a person node carrying an `email` in its free-form properties) is
 * the "link" itself - see CustomNode.tsx's linked-tasks badge. This goes one
 * step further when that email matches an actual collaborator: auto-assigns
 * them to the task and, if the map restricts access, auto-grants them
 * visibility on it - so drawing the connection is the whole action, no
 * separate manual assignee-picker/access-checkbox trip required. Explicitly
 * additive only: never un-assigns or revokes on edge deletion, and manual
 * assignment of *additional* people alongside this one still works exactly
 * as before.
 *
 * Owner-only, same rule as manual assignment (assertActorIsMapOwner in
 * nodes.service.ts) - a non-owner EDITOR can still draw the connection, it
 * just doesn't also assign anyone, so this can't become a backdoor around
 * "only the owner assigns tasks". Silently 'not-applicable' in that case
 * rather than a hint, since a non-owner drawing ordinary edges all day is
 * completely normal and not an error.
 */
async function tryAutoAssignFromEdge(
  mapId: string,
  actorId: string,
  edge: { sourceNodeId: string; targetNodeId: string }
): Promise<AutoAssignOutcome> {
  const [source, target] = await Promise.all([
    prisma.node.findUnique({ where: { id: edge.sourceNodeId } }),
    prisma.node.findUnique({ where: { id: edge.targetNodeId } })
  ]);
  if (!source || !target) return { status: 'not-applicable' };

  const taskNode = source.isTask && !target.isTask ? source : target.isTask && !source.isTask ? target : null;
  const personNode = taskNode === source ? target : source;
  if (!taskNode) return { status: 'not-applicable' };

  const map = await prisma.map.findUnique({
    where: { id: mapId },
    select: { ownerId: true, restrictedAccessEnabled: true }
  });
  if (!map || map.ownerId !== actorId) return { status: 'not-applicable' };

  const email = emailPropertyOf(personNode.properties);
  if (!email) return { status: 'no-email', personName: personNode.name };

  const matchedUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true }
  });

  // A matching email alone isn't enough - they must actually be on this map
  // (owner or accepted collaborator), same rule assertAssigneeIsValid
  // enforces for manual assignment. A registered-but-not-yet-a-collaborator
  // account (e.g. invited but hasn't accepted) reports the same 'no-match'
  // hint as a non-existent email - both need the same fix (invite/accept),
  // and distinguishing them isn't worth the extra query.
  const isCollaborator =
    !!matchedUser &&
    (matchedUser.id === map.ownerId ||
      (await prisma.mapCollaborator.findUnique({
        where: { mapId_userId: { mapId, userId: matchedUser.id } },
        select: { id: true }
      })));
  if (!matchedUser || !isCollaborator) {
    return { status: 'no-match', personName: personNode.name, email };
  }

  const alreadyAssigned = await prisma.nodeAssignee.findUnique({
    where: { nodeId_userId: { nodeId: taskNode.id, userId: matchedUser.id } }
  });
  if (!alreadyAssigned) {
    await prisma.nodeAssignee.create({ data: { nodeId: taskNode.id, userId: matchedUser.id } });
    if (matchedUser.id !== actorId) notifyAssignment(mapId, taskNode.id, taskNode.name, matchedUser.id);
  }

  if (map.restrictedAccessEnabled && matchedUser.id !== map.ownerId) {
    await prisma.nodeAccessGrant.upsert({
      where: { nodeId_userId: { nodeId: taskNode.id, userId: matchedUser.id } },
      create: { nodeId: taskNode.id, userId: matchedUser.id },
      update: {}
    });
  }

  return alreadyAssigned
    ? { status: 'already-assigned', personName: personNode.name }
    : { status: 'assigned', personName: personNode.name, personEmail: matchedUser.email };
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

  let autoAssign: AutoAssignOutcome = { status: 'not-applicable' };
  try {
    autoAssign = await tryAutoAssignFromEdge(mapId, actorId, edge);
  } catch (err) {
    // Best-effort enhancement on top of a successful edge creation - never
    // fail the request over it.
    console.error('[edges.service] auto-assign-from-edge failed', err);
  }

  return { ...edge, autoAssign };
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
