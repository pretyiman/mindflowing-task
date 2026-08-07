import { prisma } from '../db.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { notify } from '../lib/notifications.js';

const authorSelect = { id: true, email: true, name: true } as const;

export async function listComments(nodeId: string) {
  return prisma.taskComment.findMany({
    where: { nodeId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: authorSelect } }
  });
}

export async function createComment(nodeId: string, authorId: string, body: string) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true, mapId: true, name: true, assignees: { select: { userId: true } } }
  });
  if (!node) throw new NotFoundError('Node');

  const comment = await prisma.taskComment.create({
    data: { nodeId, authorId, body },
    include: { author: { select: authorSelect } }
  });

  // Notify every assignee when someone else comments on their task - never
  // for commenting on your own assigned task.
  for (const { userId } of node.assignees) {
    if (userId !== authorId) {
      void notify(userId, node.mapId, node.id, 'COMMENT', `New comment on "${node.name}"`);
    }
  }

  return comment;
}

// Author or map owner only - not "any editor", since deleting someone else's
// comment is a moderation action, not ordinary content editing.
export async function deleteComment(id: string, actorId: string) {
  const comment = await prisma.taskComment.findUnique({
    where: { id },
    include: { node: { select: { mapId: true } } }
  });
  if (!comment) throw new NotFoundError('Comment');

  if (comment.authorId !== actorId) {
    const map = await prisma.map.findUnique({ where: { id: comment.node.mapId }, select: { ownerId: true } });
    if (!map || map.ownerId !== actorId) {
      throw new ForbiddenError('You can only delete your own comments');
    }
  }

  await prisma.taskComment.delete({ where: { id } });
}
