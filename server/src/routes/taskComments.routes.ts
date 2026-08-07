import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireNodeVisible, requireResourceMapAccess, requireResourceNodeVisible } from '../plugins/authorization.js';
import { createCommentSchema } from '../schemas/taskComments.schema.js';
import * as taskCommentsService from '../services/taskComments.service.js';
import * as activityService from '../services/activity.service.js';

const lookupNode = (id: string) => prisma.node.findUnique({ where: { id }, select: { mapId: true } });

const lookupComment = async (id: string) => {
  const comment = await prisma.taskComment.findUnique({
    where: { id },
    select: { nodeId: true, node: { select: { mapId: true } } }
  });
  return comment ? { nodeId: comment.nodeId, mapId: comment.node.mapId } : null;
};

export async function taskCommentsRoutes(app: FastifyInstance) {
  // VIEWER-level, not EDITOR - commenting (and reading a node's own history)
  // is lower-friction than editing the task itself; anyone who can already
  // see this node can discuss it.
  app.get<{ Params: { id: string } }>(
    '/nodes/:id/comments',
    { preHandler: [requireAuth, requireResourceMapAccess(lookupNode, 'VIEWER'), requireNodeVisible()] },
    async (request) => taskCommentsService.listComments(request.params.id)
  );

  app.post<{ Params: { id: string } }>(
    '/nodes/:id/comments',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupNode, 'VIEWER'),
        requireNodeVisible()
      ]
    },
    async (request, reply) => {
      const body = createCommentSchema.parse(request.body);
      const comment = await taskCommentsService.createComment(request.params.id, request.user!.id, body.body);
      reply.status(201).send(comment);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/comments/:id',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupComment, 'VIEWER'),
        requireResourceNodeVisible(lookupComment)
      ]
    },
    async (request, reply) => {
      await taskCommentsService.deleteComment(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/nodes/:id/activity',
    { preHandler: [requireAuth, requireResourceMapAccess(lookupNode, 'VIEWER'), requireNodeVisible()] },
    async (request) => activityService.listNodeActivity(request.params.id, request.query.cursor)
  );
}
