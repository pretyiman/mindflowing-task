import type { FastifyInstance } from 'fastify';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess } from '../plugins/authorization.js';
import { createMapSchema, updateMapSchema } from '../schemas/maps.schema.js';
import * as mapsService from '../services/maps.service.js';

export async function mapsRoutes(app: FastifyInstance) {
  app.get('/maps', { preHandler: requireAuth }, async (request) => {
    return mapsService.listMaps(request.user!.id);
  });

  app.post('/maps', { preHandler: [requireAuth, requireVerifiedEmail] }, async (request, reply) => {
    const body = createMapSchema.parse(request.body);
    const map = await mapsService.createMap(request.user!.id, body);
    reply.status(201).send(map);
  });

  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => mapsService.getMap(request.params.mapId)
  );

  app.patch<{ Params: { mapId: string } }>(
    '/maps/:mapId',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request) => {
      const body = updateMapSchema.parse(request.body);
      return mapsService.updateMap(request.params.mapId, body, request.user!.id);
    }
  );

  app.delete<{ Params: { mapId: string } }>(
    '/maps/:mapId',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      await mapsService.deleteMap(request.params.mapId, request.user!.id);
      reply.status(204).send();
    }
  );

  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/graph',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => mapsService.getGraph(request.params.mapId, request.user!.id)
  );

  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/members',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => mapsService.listMapMembers(request.params.mapId)
  );
}
