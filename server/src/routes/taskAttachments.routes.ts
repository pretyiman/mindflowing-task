import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireNodeVisible, requireResourceMapAccess, requireResourceNodeVisible } from '../plugins/authorization.js';
import { createAttachmentSchema } from '../schemas/taskAttachments.schema.js';
import * as taskAttachmentsService from '../services/taskAttachments.service.js';

const lookupNode = (id: string) => prisma.node.findUnique({ where: { id }, select: { mapId: true } });

const lookupAttachment = async (id: string) => {
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id },
    select: { nodeId: true, node: { select: { mapId: true } } }
  });
  return attachment ? { nodeId: attachment.nodeId, mapId: attachment.node.mapId } : null;
};

export async function taskAttachmentsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/nodes/:id/attachments',
    { preHandler: [requireAuth, requireResourceMapAccess(lookupNode, 'VIEWER'), requireNodeVisible()] },
    async (request) => taskAttachmentsService.listAttachments(request.params.id)
  );

  // EDITOR-gated (unlike comments, which are VIEWER-level) - adding/removing
  // a link modifies the task's own content, not a lightweight discussion reply.
  app.post<{ Params: { id: string } }>(
    '/nodes/:id/attachments',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupNode, 'EDITOR'),
        requireNodeVisible()
      ]
    },
    async (request, reply) => {
      const body = createAttachmentSchema.parse(request.body);
      const attachment = await taskAttachmentsService.createAttachment(
        request.params.id,
        request.user!.id,
        body.name,
        body.url
      );
      reply.status(201).send(attachment);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/attachments/:id',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupAttachment, 'EDITOR'),
        requireResourceNodeVisible(lookupAttachment)
      ]
    },
    async (request, reply) => {
      await taskAttachmentsService.deleteAttachment(request.params.id);
      reply.status(204).send();
    }
  );
}
