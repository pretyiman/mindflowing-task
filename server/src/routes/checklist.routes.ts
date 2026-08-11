import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireNodeOwnerOrAssignee, requireResourceNodeOwnerOrAssignee } from '../plugins/authorization.js';
import {
  createChecklistItemSchema,
  reorderChecklistSchema,
  updateChecklistItemSchema
} from '../schemas/checklist.schema.js';
import * as checklistService from '../services/checklist.service.js';

const lookupItem = async (id: string) => {
  const item = await prisma.checklistItem.findUnique({
    where: { id },
    select: { nodeId: true, node: { select: { mapId: true } } }
  });
  return item ? { nodeId: item.nodeId, mapId: item.node.mapId } : null;
};

// Every route here uses requireNodeOwnerOrAssignee (or its resource-id
// variant) instead of the usual requireResourceMapAccess + requireNodeVisible
// pair - a checklist's own visibility rule is narrower than "any editor" or
// "anyone who can see the node", see schema.prisma's ChecklistItem comment.
export async function checklistRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/nodes/:id/checklist',
    { preHandler: [requireAuth, requireNodeOwnerOrAssignee()] },
    async (request) => checklistService.listChecklistItems(request.params.id)
  );

  app.post<{ Params: { id: string } }>(
    '/nodes/:id/checklist',
    { preHandler: [requireAuth, requireVerifiedEmail, requireNodeOwnerOrAssignee()] },
    async (request, reply) => {
      const body = createChecklistItemSchema.parse(request.body);
      const item = await checklistService.createChecklistItem(request.params.id, body.text);
      reply.status(201).send(item);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/nodes/:id/checklist/reorder',
    { preHandler: [requireAuth, requireVerifiedEmail, requireNodeOwnerOrAssignee()] },
    async (request) => {
      const body = reorderChecklistSchema.parse(request.body);
      return checklistService.reorderChecklistItems(request.params.id, body.orderedIds);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/checklist/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceNodeOwnerOrAssignee(lookupItem)] },
    async (request) => {
      const body = updateChecklistItemSchema.parse(request.body);
      return checklistService.updateChecklistItem(request.params.id, body);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/checklist/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceNodeOwnerOrAssignee(lookupItem)] },
    async (request, reply) => {
      await checklistService.deleteChecklistItem(request.params.id);
      reply.status(204).send();
    }
  );
}
