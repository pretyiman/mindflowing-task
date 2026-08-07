import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { logActivity } from '../lib/activityLog.js';

// Matches CustomNode's actual rendered card (icon-left/name-right, fixed
// 44px height, 14px/500-weight text). GROUP_MARGIN is the small fixed gap
// between a member's edge and the group border on all four sides. Members
// are always forced left-aligned at that margin - horizontal drag within a
// group isn't a persisted layout choice, only vertical position is. Width
// follows whichever member's name is widest (see estimateNodeWidth); height
// is deliberately flexible - it just grows/shrinks to fit however far apart
// the members' own vertical positions are, so dragging one further down (or
// closer) is respected rather than snapped to a fixed gap.
const NODE_HEIGHT = 44;
const GROUP_MARGIN = 12;

// No real font metrics are available server-side, so a node's rendered
// width is approximated from its name's character count (overhead for the
// icon + gap + horizontal padding, plus ~8.5px/character at this card's
// 14px/500-weight font) - clamped to the card's own CSS bounds (90-200px)
// so the estimate can never disagree with what actually renders by more
// than the approximation error within that range.
const WIDTH_OVERHEAD = 46;
const CHAR_WIDTH_ESTIMATE = 8.5;
const MIN_NODE_WIDTH = 90;
const MAX_NODE_WIDTH = 200;

function estimateNodeWidth(name: string): number {
  const estimate = Math.round(WIDTH_OVERHEAD + name.length * CHAR_WIDTH_ESTIMATE);
  return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, estimate));
}

type GroupUpdateInput = {
  name?: string;
  color?: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
};

export async function listGroups(mapId: string) {
  return prisma.nodeGroup.findMany({ where: { mapId }, orderBy: { createdAt: 'asc' } });
}

async function getGroupOrThrow(id: string) {
  const group = await prisma.nodeGroup.findUnique({ where: { id } });
  if (!group) throw new NotFoundError('Group');
  return group;
}

/**
 * Wraps 2+ ungrouped nodes into one draggable box - purely visual/organizational,
 * never touches edges. Each member keeps its own independent identity; only its
 * posX/posY changes meaning, from absolute canvas coordinates to coordinates
 * relative to the new group (matching React Flow's own parent/child convention),
 * so nothing has to be converted again at render time. Grouping never squeezes
 * members together - whatever vertical spacing already existed between them is
 * preserved (just re-anchored to the group's own origin); resizeGroupToFitMembers
 * does the actual box-fitting math immediately after, exactly as it would after
 * any later drag, so creation and drag-driven resizing can never disagree.
 */
export async function createGroup(
  mapId: string,
  data: { nodeIds: string[]; name?: string; color?: string },
  actorId: string
) {
  if (data.nodeIds.length < 2) throw new ConflictError('Select at least 2 nodes to group');

  const group = await prisma.$transaction(async (tx) => {
    const nodes = await tx.node.findMany({ where: { id: { in: data.nodeIds } } });
    if (nodes.length !== new Set(data.nodeIds).size) throw new NotFoundError('One or more nodes');
    if (nodes.some((n) => n.mapId !== mapId)) throw new ConflictError('Nodes belong to a different map');
    if (nodes.some((n) => n.groupId)) {
      throw new ConflictError('One or more nodes are already in a group - ungroup first');
    }

    // Anchor the box where the topmost/leftmost member already was, so
    // grouping doesn't jump the whole cluster somewhere unexpected.
    const anchorX = Math.min(...nodes.map((n) => n.posX ?? 0));
    const anchorY = Math.min(...nodes.map((n) => n.posY ?? 0));

    const created = await tx.nodeGroup.create({
      data: {
        mapId,
        name: data.name ?? '',
        color: data.color ?? '#4a4a6a',
        posX: anchorX,
        posY: anchorY,
        // Placeholder box - resizeGroupToFitMembers (called right after this
        // transaction commits) computes the real size.
        width: 1,
        height: 1
      }
    });

    await Promise.all(
      nodes.map((n) =>
        tx.node.update({
          where: { id: n.id },
          data: {
            groupId: created.id,
            posX: (n.posX ?? 0) - anchorX,
            posY: (n.posY ?? 0) - anchorY
          }
        })
      )
    );

    return created;
  });

  const resized = await resizeGroupToFitMembers(group.id);
  await logActivity(
    mapId,
    actorId,
    'create',
    'group',
    group.id,
    `Grouped ${data.nodeIds.length} nodes${group.name ? ` as "${group.name}"` : ''}`
  );
  return resized;
}

/**
 * Recomputes a group's box around its current members: width from whichever
 * member's name is widest (with GROUP_MARGIN on the left/right), height from
 * their actual vertical spread (with GROUP_MARGIN top/bottom) - and forces
 * every member back to horizontal alignment at the margin, since horizontal
 * position is never a persisted choice. Called by nodes.service.ts's
 * updateNode whenever a grouped node's position OR name changes, since
 * either can change what this box needs to be.
 */
export async function resizeGroupToFitMembers(groupId: string) {
  const group = await getGroupOrThrow(groupId);
  const members = await prisma.node.findMany({ where: { groupId } });
  if (members.length === 0) return group;

  const contentWidth = Math.max(...members.map((m) => estimateNodeWidth(m.name)));
  const minY = Math.min(...members.map((m) => m.posY ?? 0));
  const maxY = Math.max(...members.map((m) => (m.posY ?? 0) + NODE_HEIGHT));

  const deltaY = GROUP_MARGIN - minY;
  const width = contentWidth + GROUP_MARGIN * 2;
  const height = maxY - minY + GROUP_MARGIN * 2;

  return prisma.$transaction(async (tx) => {
    const updatedGroup = await tx.nodeGroup.update({
      where: { id: groupId },
      data: {
        // Left edge never needs to move - every member is always pinned to
        // GROUP_MARGIN horizontally, so only width (not X) responds to name
        // changes. Vertical extent can move in either direction, so the
        // origin shifts by delta the same way width/height do.
        posY: group.posY - deltaY,
        width,
        height
      }
    });

    await Promise.all(
      members.map((m) =>
        tx.node.update({
          where: { id: m.id },
          data: { posX: GROUP_MARGIN, posY: (m.posY ?? 0) + deltaY }
        })
      )
    );

    return updatedGroup;
  });
}

export async function updateGroup(id: string, data: GroupUpdateInput, actorId: string) {
  const existing = await getGroupOrThrow(id);
  const updated = await prisma.nodeGroup.update({ where: { id }, data });
  await logActivity(
    existing.mapId,
    actorId,
    'update',
    'group',
    id,
    `Updated group "${updated.name || existing.name || 'Unnamed'}"`
  );
  return updated;
}

/** Ungroups (never deletes) every member, converting each back to an absolute
 * position first so nothing visually jumps once it's independent again. */
export async function deleteGroup(id: string, actorId: string) {
  const group = await getGroupOrThrow(id);

  await prisma.$transaction(async (tx) => {
    const members = await tx.node.findMany({ where: { groupId: id } });
    await Promise.all(
      members.map((n) =>
        tx.node.update({
          where: { id: n.id },
          data: {
            groupId: null,
            posX: (n.posX ?? 0) + group.posX,
            posY: (n.posY ?? 0) + group.posY
          }
        })
      )
    );
    await tx.nodeGroup.delete({ where: { id } });
  });

  await logActivity(group.mapId, actorId, 'delete', 'group', id, `Ungrouped "${group.name || 'Unnamed'}"`);
}
