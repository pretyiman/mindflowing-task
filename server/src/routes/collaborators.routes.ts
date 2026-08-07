import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapOwner, requireResourceMapOwner } from '../plugins/authorization.js';
import { inviteCollaboratorSchema, updateCollaboratorSchema } from '../schemas/collaborators.schema.js';
import * as collaboratorsService from '../services/collaborators.service.js';
import { listPendingInvites } from '../services/invites.service.js';

const lookupCollaborator = (id: string) =>
  prisma.mapCollaborator.findUnique({ where: { id }, select: { mapId: true } });

export async function collaboratorsRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/collaborators',
    { preHandler: [requireAuth, requireMapOwner()] },
    async (request) => {
      const [collaborators, pendingInvites] = await Promise.all([
        collaboratorsService.listCollaborators(request.params.mapId),
        listPendingInvites(request.params.mapId)
      ]);
      return { collaborators, pendingInvites };
    }
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/collaborators',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapOwner()] },
    async (request, reply) => {
      const body = inviteCollaboratorSchema.parse(request.body);
      const invite = await collaboratorsService.inviteCollaborator(
        request.params.mapId,
        request.user!.id,
        body.email,
        body.role
      );
      reply.status(201).send(invite);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/collaborators/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapOwner(lookupCollaborator)] },
    async (request) => {
      const body = updateCollaboratorSchema.parse(request.body);
      return collaboratorsService.updateCollaborator(request.params.id, body);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/collaborators/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapOwner(lookupCollaborator)] },
    async (request, reply) => {
      await collaboratorsService.removeCollaborator(request.params.id);
      reply.status(204).send();
    }
  );
}
