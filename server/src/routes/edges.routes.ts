import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import { createEdgeSchema, updateEdgeSchema } from '../schemas/edges.schema.js';
import * as edgesService from '../services/edges.service.js';

const lookupEdge = (id: string) => prisma.edge.findUnique({ where: { id }, select: { mapId: true } });

export async function edgesRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/edges',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => edgesService.listEdges(request.params.mapId, request.user!.id)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/edges',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createEdgeSchema.parse(request.body);
      const edge = await edgesService.createEdge(request.params.mapId, body, request.user!.id);
      reply.status(201).send(edge);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/edges/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupEdge, 'EDITOR')] },
    async (request) => {
      const body = updateEdgeSchema.parse(request.body);
      return edgesService.updateEdge(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/edges/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupEdge, 'EDITOR')] },
    async (request, reply) => {
      await edgesService.deleteEdge(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );
}
