import { prisma } from '../db.js';

const PAGE_SIZE = 50;

// How long a single "opened this task" entry covers before another open by
// the same person logs a fresh one - without this, switching tabs or
// re-opening the same task a few times in a row would spam the History feed
// with entries that carry no new information.
const VIEW_DEDUPE_WINDOW_MINUTES = 30;

/**
 * Fire-and-forget "X opened this task" trail entry, called from
 * TaskEditPanel on mount - this is the concrete evidence-of-engagement the
 * owner-only History tab was missing (a generic "Updated node" line doesn't
 * tell you whether an assignee ever actually looked at their task). Deduped
 * per (node, user) within VIEW_DEDUPE_WINDOW_MINUTES.
 *
 * Serialized with a Postgres advisory lock, not just a plain read-then-check
 * -then-write - React 18 StrictMode double-invokes mount effects in dev,
 * firing two near-simultaneous requests for the same open on two different
 * connections; even a single atomic "INSERT...WHERE NOT EXISTS" statement
 * doesn't prevent this under READ COMMITTED, since each connection's WHERE
 * NOT EXISTS is evaluated against a snapshot with neither row committed yet.
 * The advisory lock forces the second request to wait for the first to
 * commit (and release the lock) before it re-checks, so it correctly sees
 * the first request's row and skips. hashtext() collapses each id into one
 * lock key - a collision would just briefly and harmlessly over-serialize
 * two unrelated views, never cause incorrect data.
 */
export async function recordNodeView(nodeId: string, mapId: string, userId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${nodeId}), hashtext(${userId}))`;
      const recent = await tx.activityLog.findFirst({
        where: { targetType: 'node', targetId: nodeId, userId, action: 'view' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      if (recent && Date.now() - recent.createdAt.getTime() < VIEW_DEDUPE_WINDOW_MINUTES * 60 * 1000) return;
      await tx.activityLog.create({
        data: { mapId, userId, action: 'view', targetType: 'node', targetId: nodeId, summary: 'Opened this task' }
      });
    });
  } catch (err) {
    console.error('[activity.service] failed to record node view', err);
  }
}

export async function listActivity(mapId: string, cursor?: string) {
  const entries = await prisma.activityLog.findMany({
    // 'view' entries (see recordNodeView above) are a per-task engagement
    // signal, not a structural map change - excluded here so this map-wide
    // feed isn't drowned out by "opened this task" noise from every viewer of
    // every task. They still show up in that task's own History tab, via
    // listNodeActivity below, which is exactly where they belong.
    where: { mapId, action: { not: 'view' } },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { user: { select: { id: true, email: true, name: true } } }
  });

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

  return {
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].id : null
  };
}

// Per-node activity, rendered in TaskDiscussion's own History tab - owner-only
// same as listActivity above (see taskComments.routes.ts's /nodes/:id/activity),
// unlike comments on the same node which are VIEWER-level.
export async function listNodeActivity(nodeId: string, cursor?: string) {
  const entries = await prisma.activityLog.findMany({
    where: { targetType: 'node', targetId: nodeId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { user: { select: { id: true, email: true, name: true } } }
  });

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

  return {
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].id : null
  };
}
