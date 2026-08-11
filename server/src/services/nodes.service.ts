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
  recurrenceRule?: string | null;
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

/**
 * Mirrors edges.service.ts's tryAutoAssignFromEdge grant behavior for the
 * ordinary assignee-picker path (TaskEditPanel/NodeDetailPanel's chip list) -
 * being assigned a task should be enough to see and work it, without the
 * owner separately visiting that task's Access section for every single
 * assignment. No-op unless the map has restrictedAccessEnabled on (a grant
 * is meaningless otherwise) and the assignee isn't the owner (who already
 * sees everything regardless). Additive only, same as the edge-based path -
 * removing someone from the assignee set never revokes a grant; access can
 * still be pulled manually from the task's own Access section if that's ever
 * wanted. Called with only the NEWLY added ids (createNode: everyone, since
 * every assignee is new at creation time; updateNode: the addedIds diff), so
 * re-saving an unchanged assignee set never re-touches an existing grant.
 */
async function grantAccessForNewAssignees(
  client: Prisma.TransactionClient,
  mapId: string,
  nodeId: string,
  newAssigneeIds: string[]
) {
  if (newAssigneeIds.length === 0) return;
  const map = await client.map.findUnique({
    where: { id: mapId },
    select: { ownerId: true, restrictedAccessEnabled: true }
  });
  if (!map?.restrictedAccessEnabled) return;
  for (const userId of newAssigneeIds) {
    if (userId === map.ownerId) continue;
    await client.nodeAccessGrant.upsert({
      where: { nodeId_userId: { nodeId, userId } },
      create: { nodeId, userId },
      update: {}
    });
  }
}

async function assertAssigneeIsValid(client: Prisma.TransactionClient, mapId: string, assigneeId: string) {
  const map = await client.map.findUnique({ where: { id: mapId }, select: { ownerId: true } });
  if (map?.ownerId === assigneeId) return;
  const collaborator = await client.mapCollaborator.findUnique({
    where: { mapId_userId: { mapId, userId: assigneeId } }
  });
  if (!collaborator) throw new NotFoundError('Assignee must be the map owner or an existing collaborator');
}

// Assigning/reassigning, and redefining what a task IS (name, priority,
// instructions), are a different kind of power than editing its own status/
// due date - an assignee reassigning their own task (including bouncing it
// back to the owner) or quietly rewriting their own brief would otherwise
// let them override who's accountable for it or what they were actually
// asked to do. Kept owner-only, mirroring how restrictedAccessEnabled/
// taskManagementEnabled are also owner-gated a level below the router.
// Shared across several call sites (assigneeIds/dueDate/name/priority/notes),
// so the message stays generic rather than naming one specific field.
async function assertActorIsMapOwner(client: Prisma.TransactionClient, mapId: string, actorId: string) {
  const map = await client.map.findUnique({ where: { id: mapId }, select: { ownerId: true } });
  if (map?.ownerId !== actorId) {
    throw new ForbiddenError('Only the map owner can change this - assignment, due date, name, priority, and instructions are owner-only');
  }
}

function toDueDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined ? undefined : value === null ? null : new Date(value);
}

/**
 * Fire-and-forget, called once per newly-added assignee - every assignee at
 * createNode time, updateNode's addedIds diff thereafter, or edges.service.ts's
 * auto-assign-from-edge - never for someone already on the task, and never
 * for assigning yourself. Exported for that last caller.
 */
export function notifyAssignment(mapId: string, nodeId: string, taskName: string, assigneeId: string) {
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

    const created = await tx.node.create({
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
        recurrenceRule: data.recurrenceRule,
        dueDate: toDueDate(data.dueDate),
        ...timestampPatch
      },
      include: assigneesInclude
    });
    await grantAccessForNewAssignees(tx, mapId, created.id, data.assigneeIds ?? []);
    return created;
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

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };

/**
 * Builds a specific "changed status to Done"/"reassigned to X" History
 * summary instead of the generic "Updated node" line every field change used
 * to produce - that generic line gave the owner no way to tell, from a
 * task's own History tab, what an assignee had actually DONE to it. Returns
 * null when nothing task-relevant changed (e.g. a canvas posX/posY drag),
 * so the caller can fall back to the old generic message for those.
 * Deliberately only covers the fields assertActorIsMapOwner already gates
 * (name/priority/notes/dueDate/assigneeIds) plus status - the fields anyone
 * with access can change day-to-day.
 */
const RECURRENCE_LABEL: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  WEEKDAYS: 'Weekdays'
};

async function describeNodeUpdate(
  existing: {
    name: string;
    taskStatusId: string | null;
    priority: string | null;
    dueDate: Date | null;
    notes: string;
    isTask: boolean;
    recurrenceRule: string | null;
  },
  data: NodeUpdateInput,
  previousAssigneeIds: string[]
): Promise<string | null> {
  const parts: string[] = [];
  let renamed = false;

  if (data.name !== undefined && data.name !== existing.name) {
    parts.push(`renamed "${existing.name}" to "${data.name}"`);
    renamed = true;
  }

  if (data.taskStatusId !== undefined && data.taskStatusId !== existing.taskStatusId) {
    if (data.taskStatusId === null) {
      parts.push('cleared its status');
    } else {
      const status = await prisma.taskStatus.findUnique({ where: { id: data.taskStatusId }, select: { name: true } });
      if (status) parts.push(`changed status to "${status.name}"`);
    }
  }

  if (data.priority !== undefined && data.priority !== existing.priority) {
    parts.push(data.priority ? `changed priority to ${PRIORITY_LABEL[data.priority] ?? data.priority}` : 'cleared priority');
  }

  if (data.dueDate !== undefined && toDueDate(data.dueDate)?.getTime() !== existing.dueDate?.getTime()) {
    parts.push(data.dueDate ? `changed due date to ${data.dueDate.slice(0, 10)}` : 'cleared the due date');
  }

  if (data.recurrenceRule !== undefined && data.recurrenceRule !== existing.recurrenceRule) {
    parts.push(
      data.recurrenceRule ? `set to repeat ${RECURRENCE_LABEL[data.recurrenceRule] ?? data.recurrenceRule}` : 'turned off repeating'
    );
  }

  if (existing.isTask && data.notes !== undefined && data.notes !== existing.notes) {
    parts.push('updated instructions');
  }

  if (data.assigneeIds !== undefined) {
    const added = data.assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid));
    const removed = previousAssigneeIds.filter((uid) => !data.assigneeIds!.includes(uid));
    if (added.length > 0 || removed.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: [...added, ...removed] } },
        select: { id: true, name: true, email: true }
      });
      const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email]));
      if (added.length > 0) parts.push(`assigned to ${added.map((uid) => nameById.get(uid) ?? 'someone').join(', ')}`);
      if (removed.length > 0) parts.push(`unassigned ${removed.map((uid) => nameById.get(uid) ?? 'someone').join(', ')}`);
    }
  }

  if (parts.length === 0) return null;
  // The rename phrase already names the node (old -> new); everything else
  // needs the node's own name stated explicitly, since the map-wide Activity
  // panel (unlike this task's own History tab) shows entries from every node
  // on the map with nothing but this summary text to say which one.
  const joined = renamed ? parts.join(', ') : `${parts.join(', ')} on "${existing.name}"`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// "Fluid" recurrence - the next occurrence is computed from the moment the
// task is actually completed, not from the (possibly stale/overdue) old
// dueDate, so completing something late doesn't leave the next occurrence
// already overdue too. WEEKDAYS skips forward past a Sat/Sun landing.
function computeNextDueDate(rule: string, from: Date): Date {
  const next = new Date(from);
  switch (rule) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'WEEKDAYS':
      next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      break;
  }
  return next;
}

async function findDefaultTodoStatus(client: Prisma.TransactionClient, mapId: string) {
  return client.taskStatus.findFirst({
    where: { mapId, kind: 'TODO' },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
  });
}

export async function updateNode(id: string, data: NodeUpdateInput, actorId: string) {
  const existing = await getNodeOrThrow(id);

  const { node, previousAssigneeIds, recurrenceAdvancedTo } = await prisma.$transaction(async (tx) => {
    if (data.categoryId) await assertCategoryBelongsToMap(tx, existing.mapId, data.categoryId);
    // Renaming/re-prioritizing/re-instructing an EXISTING task redefines
    // what it *is*, not just how it's progressing - kept owner-only same as
    // assigning/due dates, so someone scoped via Restricted Access to just
    // this one task can work it (status, sub-tasks, discussion) without
    // being able to redefine it. notes joined this rule deliberately: it
    // holds the actual instructions for whoever is assigned, and letting the
    // assignee themselves edit it invited exactly the kind of silent
    // rewrite-your-own-brief confusion this whole rule exists to prevent -
    // clarifying questions/updates belong in the task's Discussion (comments)
    // instead. Only applies to existing tasks (existing.isTask) on update -
    // never gates createNode, since whoever creates a task obviously has to
    // be able to write its own initial name/instructions. Plain (non-task)
    // nodes are unaffected either way - editing ordinary canvas content
    // stays a normal EDITOR action.
    const editsTaskDefinition =
      existing.isTask && (data.name !== undefined || data.priority !== undefined || data.notes !== undefined);
    if (
      data.assigneeIds !== undefined ||
      data.dueDate !== undefined ||
      data.recurrenceRule !== undefined ||
      editsTaskDefinition
    ) {
      await assertActorIsMapOwner(tx, existing.mapId, actorId);
    }
    for (const userId of data.assigneeIds ?? []) await assertAssigneeIsValid(tx, existing.mapId, userId);
    const newKind = await resolveNewStatusKind(tx, existing.mapId, data.taskStatusId);
    const timestampPatch = computeTaskTimestampPatch(existing.startedAt, existing.completedAt, newKind);

    // Recurring task completing: override the plain DONE transition above -
    // advance dueDate instead of leaving it DONE. Only on the actual
    // TODO/IN_PROGRESS -> DONE edge (existing.completedAt null), never on a
    // no-op re-save of an already-DONE task, and only when there's a
    // dueDate to compute the next occurrence from.
    let finalTaskStatusId = data.taskStatusId;
    let finalDueDate = data.dueDate;
    let finalTimestampPatch = timestampPatch;
    let recurrenceAdvancedTo: Date | null = null;
    if (newKind === 'DONE' && !existing.completedAt && existing.recurrenceRule && existing.dueDate) {
      const defaultStatus = await findDefaultTodoStatus(tx, existing.mapId);
      recurrenceAdvancedTo = computeNextDueDate(existing.recurrenceRule, new Date());
      finalTaskStatusId = defaultStatus?.id ?? null;
      finalDueDate = recurrenceAdvancedTo.toISOString();
      finalTimestampPatch = { completedAt: null };
    }

    let previousAssigneeIds: string[] = [];
    if (data.assigneeIds !== undefined) {
      const currentAssignees = await tx.nodeAssignee.findMany({ where: { nodeId: id }, select: { userId: true } });
      previousAssigneeIds = currentAssignees.map((a) => a.userId);
      await tx.nodeAssignee.deleteMany({ where: { nodeId: id } });
      if (data.assigneeIds.length > 0) {
        await tx.nodeAssignee.createMany({ data: data.assigneeIds.map((userId) => ({ nodeId: id, userId })) });
      }
      const addedAssigneeIds = data.assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid));
      await grantAccessForNewAssignees(tx, existing.mapId, id, addedAssigneeIds);
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
        taskStatusId: finalTaskStatusId,
        priority: data.priority,
        recurrenceRule: data.recurrenceRule,
        dueDate: toDueDate(finalDueDate),
        // A changed dueDate (including a recurrence auto-advance) makes the
        // task eligible for a fresh due-soon reminder - see
        // dueSoonReminders.ts. Reset regardless of the new value (including
        // back to null) since the old reminder no longer describes the
        // current deadline either way.
        dueSoonNotifiedAt: finalDueDate !== undefined ? null : undefined,
        ...finalTimestampPatch
      },
      include: assigneesInclude
    });

    return { node, previousAssigneeIds, recurrenceAdvancedTo };
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

  const specificSummary = await describeNodeUpdate(existing, data, previousAssigneeIds);
  await logActivity(
    existing.mapId,
    actorId,
    'update',
    'node',
    id,
    specificSummary ?? `Updated node "${result.name}"`
  );

  // A separate, system-generated (userId: null) entry - the actor's own
  // "changed status to Done" line above already narrates what THEY did;
  // this one narrates what the recurrence engine did in response, so the
  // owner isn't left wondering why a "done" task is showing up as active
  // again with a new due date.
  if (recurrenceAdvancedTo) {
    await logActivity(
      existing.mapId,
      null,
      'update',
      'node',
      id,
      `Recurring task reset for next cycle - due ${recurrenceAdvancedTo.toISOString().slice(0, 10)}`
    );
  }

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
