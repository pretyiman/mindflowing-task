import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export type ActivityAction = 'create' | 'update' | 'delete' | 'view';
export type ActivityTargetType = 'node' | 'edge' | 'group' | 'category' | 'relationType' | 'tag' | 'taskStatus';

/**
 * Best-effort audit trail write - never throws into the caller. A failed log
 * write must not fail (or roll back) the mutation it's describing; the owner
 * losing one activity row is a far smaller problem than a user's edit
 * silently failing because logging had a hiccup.
 */
export async function logActivity(
  mapId: string,
  userId: string | null,
  action: ActivityAction,
  targetType: ActivityTargetType,
  targetId: string | null,
  summary: string,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.activityLog.create({
      data: {
        mapId,
        userId,
        action,
        targetType,
        targetId,
        summary,
        metadata: metadata as Prisma.InputJsonValue | undefined
      }
    });
  } catch (err) {
    console.error('[activityLog] failed to write activity log entry', err);
  }
}
