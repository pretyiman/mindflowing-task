import { prisma } from '../db.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { getVisibleNodeIdFilter } from './visibility.js';

export async function listMaps(userId: string) {
  const [maps, collaborations] = await Promise.all([
    prisma.map.findMany({
      where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.mapCollaborator.findMany({ where: { userId }, select: { mapId: true, role: true } })
  ]);
  const roleByMapId = new Map(collaborations.map((c) => [c.mapId, c.role]));
  return maps.map((map) => ({
    ...map,
    myRole: map.ownerId === userId ? 'OWNER' : (roleByMapId.get(map.id) ?? 'VIEWER')
  }));
}

export async function createMap(
  ownerId: string,
  data: { name: string; description?: string; workspaceType?: 'GRAPH' | 'TASKS' }
) {
  const workspaceType = data.workspaceType ?? 'GRAPH';
  const map = await prisma.map.create({
    data: {
      ...data,
      workspaceType,
      ownerId,
      // A TASKS workspace has no graph UI to opt into it from, so the
      // feature is just always on - see schema.prisma's workspaceType
      // comment.
      taskManagementEnabled: workspaceType === 'TASKS'
    }
  });
  // So a brand-new map can be connected immediately, the same way a node
  // doesn't require a category to exist first - relies on RelationType's own
  // schema defaults (solid line, directional, #cccccc). Purely a starting
  // point: rename it or add more from Relation Types like any other.
  // Only meaningful for GRAPH workspaces - a TASKS one never surfaces edges/
  // relation types in its UI at all, so skip creating an unused default row.
  if (workspaceType === 'GRAPH') {
    await prisma.relationType.create({ data: { mapId: map.id, name: 'Connection' } });
  }
  return map;
}

export async function getMap(id: string) {
  const map = await prisma.map.findUnique({ where: { id } });
  if (!map) throw new NotFoundError('Map');
  return map;
}

type MapUpdateInput = {
  name?: string;
  description?: string;
  restrictedAccessEnabled?: boolean;
  taskManagementEnabled?: boolean;
  targetDate?: string | null;
};

// Owner-only, full stop - name/description included. This route is only
// EDITOR-gated at the router level (so any collaborator can reach it at
// all), so ownership is enforced a level deeper here. Renaming/describing a
// project is a structural decision about the project itself, not ordinary
// content editing - an EDITOR scoped via Restricted Access to a single task
// must not be able to touch it, same reasoning as restrictedAccessEnabled/
// taskManagementEnabled already being owner-only.
export async function updateMap(id: string, data: MapUpdateInput, requestUserId: string) {
  const map = await getMap(id);
  if (map.ownerId !== requestUserId) {
    throw new ForbiddenError('Only the map owner can change project settings');
  }
  return prisma.map.update({
    where: { id },
    data: {
      ...data,
      targetDate: data.targetDate === undefined ? undefined : data.targetDate === null ? null : new Date(data.targetDate)
    }
  });
}

// Owner-only - deleting the whole project is irreversible and affects every
// collaborator, not just the actor. This was previously missing entirely
// (any EDITOR could delete the project), a real gap surfaced once a single
// task could be shared without sharing the rest of the project.
export async function deleteMap(id: string, requestUserId: string) {
  const map = await getMap(id);
  if (map.ownerId !== requestUserId) {
    throw new ForbiddenError('Only the map owner can delete this project');
  }
  await prisma.map.delete({ where: { id } });
}

// Lightweight "who can this task be assigned to" list - deliberately NOT
// gated owner-only like /collaborators (which also carries pending invites
// and scopeTagIds): any editor can assign a task (see plan decision #7), so
// they need to see the same owner+collaborator set without needing
// requireMapOwner's elevated access.
export async function listMapMembers(mapId: string) {
  const map = await prisma.map.findUnique({
    where: { id: mapId },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      collaborators: { include: { user: { select: { id: true, email: true, name: true } } } }
    }
  });
  if (!map) throw new NotFoundError('Map');

  type Member = { id: string; email: string; name: string | null; role: 'OWNER' | 'EDITOR' | 'VIEWER' };
  const members: Member[] = map.owner ? [{ ...map.owner, role: 'OWNER' }] : [];
  for (const c of map.collaborators) {
    members.push({ ...c.user, role: c.role });
  }
  return members;
}

export async function getGraph(mapId: string, viewerId: string) {
  await getMap(mapId);
  const [categories, relationTypes, tags, nodesRaw, edgesRaw, groups, taskStatuses] = await Promise.all([
    prisma.nodeCategory.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } }),
    prisma.relationType.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } }),
    prisma.tag.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } }),
    prisma.node.findMany({
      where: { mapId },
      orderBy: { createdAt: 'asc' },
      include: {
        nodeTags: { select: { tagId: true } },
        _count: { select: { accessGrants: true } },
        assignees: { select: { userId: true } }
      }
    }),
    prisma.edge.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } }),
    prisma.nodeGroup.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } }),
    prisma.taskStatus.findMany({ where: { mapId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
  ]);

  const visible = await getVisibleNodeIdFilter(mapId, viewerId);
  const nodesFiltered = visible === null ? nodesRaw : nodesRaw.filter((n) => visible.has(n.id));
  const edges =
    visible === null
      ? edgesRaw
      : edgesRaw.filter((e) => visible.has(e.sourceNodeId) && visible.has(e.targetNodeId));

  const nodes = nodesFiltered.map(({ nodeTags, _count, assignees, ...node }) => ({
    ...node,
    tagIds: nodeTags.map((nt) => nt.tagId),
    hasAccessGrants: _count.accessGrants > 0,
    assigneeIds: assignees.map((a) => a.userId)
  }));
  return { categories, relationTypes, tags, nodes, edges, groups, taskStatuses };
}
