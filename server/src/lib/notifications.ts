import { prisma } from '../db.js';

export type NotificationType = 'ASSIGNED' | 'COMMENT' | 'MENTION' | 'STATUS_CHANGED';

/**
 * Best-effort, fire-and-forget - same contract as logActivity: never throws
 * into the caller, a failed notification write must not fail (or roll back)
 * the mutation it's describing.
 */
export async function notify(
  userId: string,
  mapId: string,
  nodeId: string | null,
  type: NotificationType,
  message: string
) {
  try {
    await prisma.notification.create({ data: { userId, mapId, nodeId, type, message } });
  } catch (err) {
    console.error('[notifications] failed to write notification', err);
  }
}
