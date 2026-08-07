import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';
import { sendTaskAssignmentEmail } from '../lib/email.js';
import { notify } from '../lib/notifications.js';
import { resizeGroupToFitMembers } from './groups.service.js';
import { getVisibleNodeIdFilter } from './visibility.js';

type NodeInput = {
  categoryId?: string | null;
  name: string;
  iconOverride?: string | null;
  colorOverride?: string | null;
  notes?: string;
  properties?: Record<string, unknown>;
  posX?: number | null;
  posY?: number | null;
  isTask?: boolean;
  taskStatusId?: string | null;
  // Full-replace-the-set semantics - undefined means untouched, an array
  // (including []) sets the complete assignee list. No primary/secondary
  // distinction; see NodeAssignee's own schema comment.
  assigneeIds?: string[];
  priority?: string | null;
  dueDate?: string | null;
};

type NodeUpdateInput = Partial<NodeInput>;

const assigneesInclude = { assignees: { select: { userId: true } } } as const;

function withAssigneeIds<T extends { assignees: { userId: string }[] }>(node: T) {
  const { assignees, ...rest } = node;
  return { ...rest, assigneeIds: assignees.map((a) => a.userId) };
}

export async function listNodes(mapId: string, viewerId: string) {
  const nodes = await prisma.node.findMany({
    where: { mapId },
    orderBy: { createdAt: 'asc' },
    include: assigneesInclude
  });
  const visible = await getVisibleNodeIdFilter(mapId, viewerId);
  const filtered = visible === null ? nodes : nodes.filter((n) => visible.has(n.id));
  return filtered.map(withAssigneeIds);
}

async function assertCategoryBelongsToMap(
  client: Prisma.TransactionClient,
  mapId: string,
  categoryId: string
) {
  const category = await client.nodeCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.mapId !== mapId) throw new NotFoundError('Category');
}

async function assertTaskStatusBelongsToMap(
  client: Prisma.TransactionClient,
  mapId: string,
  taskStatusId: string
) {
  const status = await client.taskStatus.findUnique({ where: { id: taskStatusId } });
  if (!status || status.mapId !== mapId) throw new NotFoundError('Task status');
  return status;
}

type TaskStatusKind = 'TODO' | 'IN_PROGRESS' | 'DONE';

/**
 * Resolves the new status's kind whenever taskStatusId is part of this
 * update (undefined if the field wasn't touched at all, null if explicitly
 * cleared) - the single source both createNode and updateNode use to derive
 * the startedAt/completedAt auto-timestamp patch below.
 */
async function resolveNewStatusKind(
  client: Prisma.TransactionClient,
  mapId: string,
  taskStatusId: string | null | undefined
): Promise<TaskStatusKind | null | undefined> {
  if (taskStatusId === undefined) return undefined;
  if (taskStatusId === null) return null;
  const status = await assertTaskStatusBelongsToMap(client, mapId, taskStatusId);
  return status.kind;
}

/**
 * Auto-tracked, never client-editable (see Node.startedAt/completedAt's own
 * schema comment). startedAt is a first-touched marker - set once the task
 * ever reaches IN_PROGRESS or DONE, never cleared again. completedAt tracks
 * only the current DONE-ness - set on entering a DONE-kind status, cleared
 * if the task moves back out of one (including losing its status entirely).
 */
function computeTaskTimestampPatch(
  currentStartedAt: Date | null,
  currentCompletedAt: Date | null,
  newKind: TaskStatusKind | null | undefined
): { startedAt?: Date; completedAt?: Date | null } {
  if (newKind === undefined) return {};
  const patch: { startedAt?: Date; completedAt?: Date | null } = {};
  if ((newKind === 'IN_PROGRESS' || newKind === 'DONE') && !currentStartedAt) {
    patch.startedAt = new Date();
  }
  if (newKind === 'DONE') {
    if (!currentCompletedAt) patch.completedAt = new Date();
  } else if (currentCompletedAt) {
    patch.completedAt = null;
  }
  return patch;
}

async function assertAssigneeIsValid(client: Prisma.TransactionClient, mapId: string, assigneeId: string) {
  const map = await client.map.findUnique({ where: { id: mapId }, select: { ownerId: true } });
  if (map?.ownerId === assigneeId) return;
  const collaborator = await client.mapCollaborator.findUnique({
    where: { mapId_userId: { mapId, userId: assigneeId } }
  });
  if (!collaborator) throw new NotFoundError('Assignee must be the map owner or an existing collaborator');
}

// Assigning is a different kind of power than editing a task's own status/
// priority/due date - an assignee reassigning their own task (including
// bouncing it back to the owner) would otherwise let them override who's
// accountable for it. Kept owner-only, mirroring how restrictedAccessEnabled/
// taskManagementEnabled are also owner-gated a level below the router.
async function assertActorIsMapOwner(client: Prisma.TransactionClient, mapId: string, actorId: string) {
  const map = await client.map.findUnique({ where: { id: mapId }, select: { ownerId: true } });
  if (map?.ownerId !== actorId) {
    throw new ForbiddenError('Only the map owner can assign or reassign tasks');
  }
}

function toDueDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

/**
 * Fire-and-forget, called once per newly-added assignee - every assignee at
 * createNode time, or updateNode's addedIds diff thereafter - never for
 * someone already on the task, and never for assigning yourself.
 */
function notifyAssignment(mapId: string, nodeId: string, taskName: string, assigneeId: string) {
  Promise.all([
    prisma.user.findUnique({ where: { id: assigneeId }, select: { email: true } }),
    prisma.map.findUnique({ where: { id: mapId }, select: { name: true } })
  ])
    .then(([assignee, map]) => {
      if (assignee && map) return sendTaskAssignmentEmail(assignee.email, taskName, map.name);
    })
    .catch((err) => console.error('[nodes.service] failed to send task assignment email', err));

  void notify(assigneeId, mapId, nodeId, 'ASSIGNED', `You were assigned "${taskName}"`);
}

export async function createNode(mapId: string, data: NodeInput, actorId: string) {
  const node = await prisma.$transaction(async (tx) => {
    if (data.categoryId) await assertCategoryBelongsToMap(tx, mapId, data.categoryId);
    if (data.assigneeIds !== undefined || data.dueDate !== undefined) {
      await assertActorIsMapOwner(tx, mapId, actorId);
    }
    for (const userId of data.assigneeIds ?? []) await assertAssigneeIsValid(tx, mapId, userId);
    const newKind = await resolveNewStatusKind(tx, mapId, data.taskStatusId);
    const timestampPatch = computeTaskTimestampPatch(null, null, newKind);

    return tx.node.create({
      data: {
        mapId,
        categoryId: data.categoryId ?? null,
        name: data.name,
        iconOverride: data.iconOverride,
        colorOverride: data.colorOverride,
        notes: data.notes ?? '',
        properties: (data.properties ?? {}) as Prisma.InputJsonValue,
        posX: data.posX,
        posY: data.posY,
        isTask: data.isTask,
        taskStatusId: data.taskStatusId,
        assignees: { create: (data.assigneeIds ?? []).map((userId) => ({ userId })) },
        priority: data.priority,
        dueDate: toDueDate(data.dueDate),
        ...timestampPatch
      },
      include: assigneesInclude
    });
  });
  const result = withAssigneeIds(node);
  await logActivity(mapId, actorId, 'create', 'node', result.id, `Created node "${result.name}"`);

  // Same "notify everyone newly on the assignee set, never yourself" rule as
  // updateNode's addedIds diff - at creation time every assignee is new, so
  // this is just that diff with an empty previous set.
  for (const uid of result.assigneeIds) {
    if (uid !== actorId) notifyAssignment(mapId, result.id, result.name, uid);
  }

  return result;
}

async function getNodeOrThrow(id: string) {
  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) throw new NotFoundError('Node');
  return node;
}

export async function updateNode(id: string, data: NodeUpdateInput, actorId: string) {
  const existing = await getNodeOrThrow(id);

  const { node, previousAssigneeIds } = await prisma.$transaction(async (tx) => {
    if (data.categoryId) await assertCategoryBelongsToMap(tx, existing.mapId, data.categoryId);
    // Renaming/re-prioritizing an EXISTING task redefines what it *is*, not
    // just how it's progressing - kept owner-only same as assigning/due
    // dates, so someone scoped via Restricted Access to just this one task
    // can work it (status/notes/sub-tasks) without being able to redefine
    // it. Only applies to existing tasks (existing.isTask) on update - never
    // gates createNode, since whoever creates a task obviously has to be
    // able to name it. Plain (non-task) nodes are unaffected either way -
    // renaming ordinary canvas content stays a normal EDITOR action.
    const editsTaskDefinition = existing.isTask && (data.name !== undefined || data.priority !== undefined);
    if (data.assigneeIds !== undefined || data.dueDate !== undefined || editsTaskDefinition) {
      await assertActorIsMapOwner(tx, existing.mapId, actorId);
    }
    for (const userId of data.assigneeIds ?? []) await assertAssigneeIsValid(tx, existing.mapId, userId);
    const newKind = await resolveNewStatusKind(tx, existing.mapId, data.taskStatusId);
    const timestampPatch = computeTaskTimestampPatch(existing.startedAt, existing.completedAt, newKind);

    let previousAssigneeIds: string[] = [];
    if (data.assigneeIds !== undefined) {
      const currentAssignees = await tx.nodeAssignee.findMany({ where: { nodeId: id }, select: { userId: true } });
      previousAssigneeIds = currentAssignees.map((a) => a.userId);
      await tx.nodeAssignee.deleteMany({ where: { nodeId: id } });
      if (data.assigneeIds.length > 0) {
        await tx.nodeAssignee.createMany({ data: data.assigneeIds.map((userId) => ({ nodeId: id, userId })) });
      }
    }

    const node = await tx.node.update({
      where: { id },
      data: {
        categoryId: data.categoryId,
        name: data.name,
        iconOverride: data.iconOverride,
        colorOverride: data.colorOverride,
        notes: data.notes,
        properties: data.properties as Prisma.InputJsonValue | undefined,
        posX: data.posX,
        posY: data.posY,
        isTask: data.isTask,
        taskStatusId: data.taskStatusId,
        priority: data.priority,
        dueDate: toDueDate(data.dueDate),
        ...timestampPatch
      },
      include: assigneesInclude
    });

    return { node, previousAssigneeIds };
  });

  const result = withAssigneeIds(node);

  // A grouped node stays independently draggable, and its name drives the
  // group's own width - either changing means the box may need to resize,
  // so re-fit it around the group's current members whenever either happens.
  if (existing.groupId && (data.posX !== undefined || data.posY !== undefined || data.name !== undefined)) {
    await resizeGroupToFitMembers(existing.groupId);
  }

  // Only notify people newly added to the assignee set, never for someone
  // who was already there, and never for assigning yourself.
  if (data.assigneeIds !== undefined) {
    const addedIds = data.assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid) && uid !== actorId);
    for (const uid of addedIds) notifyAssignment(existing.mapId, id, result.name, uid);
  }

  await logActivity(existing.mapId, actorId, 'update', 'node', id, `Updated node "${result.name}"`);
  return result;
}

export async function deleteNode(id: string, actorId: string) {
  const existing = await getNodeOrThrow(id);
  // DB-level cascade (see schema.prisma) removes dependent edges regardless of
  // which side (source/target) the deleted node was on.
  await prisma.node.delete({ where: { id } });
  await logActivity(existing.mapId, actorId, 'delete', 'node', id, `Deleted node "${existing.name}"`);
}

const SUBTASK_RELATION_NAME = 'Sub-task of';

// Lazily get-or-create the built-in "Sub-task of" relation type for a map -
// not seeded at map creation, so this also just works for maps created
// before sub-tasks existed, with no backfill needed. Race-safe via the
// (mapId, name) unique constraint already on RelationType.
async function getOrCreateSubtaskRelationType(client: Prisma.TransactionClient, mapId: string) {
  return client.relationType.upsert({
    where: { mapId_name: { mapId, name: SUBTASK_RELATION_NAME } },
    create: { mapId, name: SUBTASK_RELATION_NAME, isHierarchy: true },
    update: {}
  });
}

// Sub-tasks are plain tasks (isTask: true) linked to their parent by an edge
// (source: child, target: parent) using the built-in "Sub-task of" relation -
// reuses Edge/RelationType rather than adding parent/child columns to Node,
// consistent with how this app models every other relationship. Deliberately
// minimal input (name only) - full editing happens by opening the created
// sub-task's own panel afterward, same as the top-level "+ New Task" flow.
export async function createSubtask(parentNodeId: string, name: string, actorId: string) {
  const parent = await getNodeOrThrow(parentNodeId);

  const child = await prisma.$transaction(async (tx) => {
    const childNode = await tx.node.create({
      data: { mapId: parent.mapId, name, isTask: true }
    });
    const relationType = await getOrCreateSubtaskRelationType(tx, parent.mapId);
    await tx.edge.create({
      data: {
        mapId: parent.mapId,
        sourceNodeId: childNode.id,
        targetNodeId: parent.id,
        relationTypeId: relationType.id
      }
    });
    return childNode;
  });

  await logActivity(parent.mapId, actorId, 'create', 'node', child.id, `Created sub-task "${child.name}" of "${parent.name}"`);
  return { ...child, assigneeIds: [] };
}

export async function setNodeTags(nodeId: string, tagIds: string[]) {
  const node = await getNodeOrThrow(nodeId);

  if (tagIds.length > 0) {
    const validCount = await prisma.tag.count({ where: { id: { in: tagIds }, mapId: node.mapId } });
    if (validCount !== new Set(tagIds).size) {
      throw new NotFoundError('One or more tags');
    }
  }

  await prisma.$transaction([
    prisma.nodeTag.deleteMany({ where: { nodeId } }),
    prisma.nodeTag.createMany({ data: tagIds.map((tagId) => ({ nodeId, tagId })) })
  ]);

  return { nodeId, tagIds };
}
