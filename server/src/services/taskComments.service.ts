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

export async function createComment(
  nodeId: string,
  authorId: string,
  body: string,
  parentCommentId?: string | null
) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true, mapId: true, name: true, assignees: { select: { userId: true } } }
  });
  if (!node) throw new NotFoundError('Node');

  // Single level of nesting only - a reply to a reply re-parents onto that
  // reply's own top-level comment, so the client only ever renders two tiers
  // (see schema.prisma's TaskComment comment).
  let resolvedParentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parentCommentId) {
    const parent = await prisma.taskComment.findUnique({
      where: { id: parentCommentId },
      select: { nodeId: true, parentCommentId: true, authorId: true }
    });
    if (!parent || parent.nodeId !== nodeId) throw new NotFoundError('Comment');
    resolvedParentId = parent.parentCommentId ?? parentCommentId;
    parentAuthorId = parent.authorId;
  }

  const comment = await prisma.taskComment.create({
    data: { nodeId, authorId, body, parentCommentId: resolvedParentId },
    include: { author: { select: authorSelect } }
  });

  // Notify every assignee, plus the comment/reply this is replying to (if
  // any), when someone else comments - never for commenting on/replying to
  // yourself. A Set dedupes the (common) case of the parent author also
  // being an assignee, so they don't get double-notified.
  const notifyIds = new Set(node.assignees.map((a) => a.userId));
  if (parentAuthorId) notifyIds.add(parentAuthorId);
  notifyIds.delete(authorId);
  for (const userId of notifyIds) {
    void notify(userId, node.mapId, node.id, 'COMMENT', `New comment on "${node.name}"`);
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
