import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import {
  requireMapAccess,
  requireNodeVisible,
  requireResourceMapAccess,
  requireResourceMapOwner
} from '../plugins/authorization.js';
import { createNodeSchema, createSubtaskSchema, updateNodeSchema } from '../schemas/nodes.schema.js';
import { setNodeAccessSchema } from '../schemas/nodeAccess.schema.js';
import * as nodesService from '../services/nodes.service.js';
import * as nodeAccessService from '../services/nodeAccess.service.js';

const lookupNode = (id: string) => prisma.node.findUnique({ where: { id }, select: { mapId: true } });

export async function nodesRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/nodes',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => nodesService.listNodes(request.params.mapId, request.user!.id)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/nodes',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createNodeSchema.parse(request.body);
      const node = await nodesService.createNode(request.params.mapId, body, request.user!.id);
      reply.status(201).send(node);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/nodes/:id/subtasks',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupNode, 'EDITOR'),
        requireNodeVisible()
      ]
    },
    async (request, reply) => {
      const body = createSubtaskSchema.parse(request.body);
      const child = await nodesService.createSubtask(request.params.id, body.name, request.user!.id);
      reply.status(201).send(child);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/nodes/:id',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupNode, 'EDITOR'),
        requireNodeVisible()
      ]
    },
    async (request) => {
      const body = updateNodeSchema.parse(request.body);
      return nodesService.updateNode(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/nodes/:id',
    {
      preHandler: [
        requireAuth,
        requireVerifiedEmail,
        requireResourceMapAccess(lookupNode, 'EDITOR'),
        requireNodeVisible()
      ]
    },
    async (request, reply) => {
      await nodesService.deleteNode(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );

  // Owner-only: manage a node's grant list / restrictToGrantsOnly override.
  // Deliberately NOT gated by requireNodeVisible - the owner manages access
  // for nodes they can already always see, and a non-owner can't reach these
  // routes at all (requireResourceMapOwner).
  app.get<{ Params: { id: string } }>(
    '/nodes/:id/access',
    { preHandler: [requireAuth, requireResourceMapOwner(lookupNode)] },
    async (request) => nodeAccessService.getAccess(request.params.id)
  );

  app.put<{ Params: { id: string } }>(
    '/nodes/:id/access',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapOwner(lookupNode)] },
    async (request) => {
      const body = setNodeAccessSchema.parse(request.body);
      return nodeAccessService.setAccess(request.params.id, body);
    }
  );
}
