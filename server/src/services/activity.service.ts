import { prisma } from '../db.js';

const PAGE_SIZE = 50;

export async function listActivity(mapId: string, cursor?: string) {
  const entries = await prisma.activityLog.findMany({
    where: { mapId },
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

// Per-node activity, for TaskDiscussion's merged comments+activity timeline -
// deliberately a DIFFERENT visibility rule than listActivity above (which
// stays owner-only): anyone who can already see this node can see its own
// history, same bar as commenting on it.
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
