import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import {
  createRelationTypeSchema,
  updateRelationTypeSchema
} from '../schemas/relationTypes.schema.js';
import * as relationTypesService from '../services/relationTypes.service.js';

const lookupRelationType = (id: string) =>
  prisma.relationType.findUnique({ where: { id }, select: { mapId: true } });

export async function relationTypesRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/relation-types',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => relationTypesService.listRelationTypes(request.params.mapId)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/relation-types',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createRelationTypeSchema.parse(request.body);
      const relationType = await relationTypesService.createRelationType(
        request.params.mapId,
        body,
        request.user!.id
      );
      reply.status(201).send(relationType);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/relation-types/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupRelationType, 'EDITOR')] },
    async (request) => {
      const body = updateRelationTypeSchema.parse(request.body);
      return relationTypesService.updateRelationType(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/relation-types/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupRelationType, 'EDITOR')] },
    async (request, reply) => {
      await relationTypesService.deleteRelationType(
        request.params.id,
        request.query.force === 'true',
        request.user!.id
      );
      reply.status(204).send();
    }
  );
}
