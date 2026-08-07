import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import { createGroupSchema, updateGroupSchema } from '../schemas/groups.schema.js';
import * as groupsService from '../services/groups.service.js';

const lookupGroup = (id: string) =>
  prisma.nodeGroup.findUnique({ where: { id }, select: { mapId: true } });

export async function groupsRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/groups',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => groupsService.listGroups(request.params.mapId)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/groups',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createGroupSchema.parse(request.body);
      const group = await groupsService.createGroup(request.params.mapId, body, request.user!.id);
      reply.status(201).send(group);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupGroup, 'EDITOR')] },
    async (request) => {
      const body = updateGroupSchema.parse(request.body);
      return groupsService.updateGroup(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupGroup, 'EDITOR')] },
    async (request, reply) => {
      await groupsService.deleteGroup(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );
}
