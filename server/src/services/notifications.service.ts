import { prisma } from '../db.js';
import { ForbiddenError, NotFoundError } from '../errors.js';

const PAGE_SIZE = 50;

export async function listNotifications(userId: string, cursor?: string) {
  const [entries, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    }),
    prisma.notification.count({ where: { userId, read: false } })
  ]);

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

  return {
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    unreadCount
  };
}

export async function markRead(id: string, userId: string) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new NotFoundError('Notification');
  if (notification.userId !== userId) throw new ForbiddenError('Not your notification');

  return prisma.notification.update({ where: { id }, data: { read: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}
