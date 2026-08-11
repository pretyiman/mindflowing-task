import { prisma } from '../db.js';
import { logActivity } from '../lib/activityLog.js';

const INBOX_MAP_NAME = 'Inbox';

/**
 * Lazily get-or-creates this user's personal capture zone - a `TASKS`
 * workspace map named "Inbox", owned by them, matched by (ownerId, name).
 * Mirrors nodes.service.ts's getOrCreateSubtaskRelationType: no eager
 * seeding at account-creation time, just created on first actual use.
 *
 * Known limitation, accepted rather than solved: matched by NAME, not a
 * dedicated flag - renaming your own auto-created Inbox means the next
 * quick-capture creates a second "Inbox" project rather than reusing the
 * renamed one. Rare (you'd have to deliberately rename your own capture
 * zone) and non-destructive (nothing is lost, just a second project to
 * rename/merge by hand) - not worth a schema field to guard against.
 *
 * There is deliberately no "move this task to another project" feature -
 * captured items are triaged (renamed, prioritized, assigned, statused)
 * inside the Inbox project itself, not relocated out of it.
 */
export async function getOrCreateInboxMap(userId: string) {
  const existing = await prisma.map.findFirst({
    where: { ownerId: userId, workspaceType: 'TASKS', name: INBOX_MAP_NAME }
  });
  if (existing) return existing;

  return prisma.map.create({
    data: {
      ownerId: userId,
      name: INBOX_MAP_NAME,
      workspaceType: 'TASKS',
      taskManagementEnabled: true
    }
  });
}

export async function quickCapture(userId: string, name: string) {
  const map = await getOrCreateInboxMap(userId);
  const node = await prisma.node.create({
    data: { mapId: map.id, name, isTask: true }
  });
  await logActivity(map.id, userId, 'create', 'node', node.id, `Created node "${node.name}"`);
  // Deliberately not the full GraphNode shape (assigneeIds/tagIds/etc.) - the
  // client only needs enough to navigate to what it just created.
  return { mapId: map.id, nodeId: node.id, nodeName: node.name };
}
