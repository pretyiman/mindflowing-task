import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import { createTagSchema, setNodeTagsSchema, updateTagSchema } from '../schemas/tags.schema.js';
import * as tagsService from '../services/tags.service.js';
import * as nodesService from '../services/nodes.service.js';

const lookupTag = (id: string) => prisma.tag.findUnique({ where: { id }, select: { mapId: true } });
const lookupNode = (id: string) => prisma.node.findUnique({ where: { id }, select: { mapId: true } });

export async function tagsRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/tags',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => tagsService.listTags(request.params.mapId)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/tags',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createTagSchema.parse(request.body);
      const tag = await tagsService.createTag(request.params.mapId, body, request.user!.id);
      reply.status(201).send(tag);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/tags/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupTag, 'EDITOR')] },
    async (request) => {
      const body = updateTagSchema.parse(request.body);
      return tagsService.updateTag(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/tags/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupTag, 'EDITOR')] },
    async (request, reply) => {
      await tagsService.deleteTag(request.params.id, request.query.force === 'true', request.user!.id);
      reply.status(204).send();
    }
  );

  app.put<{ Params: { id: string } }>(
    '/nodes/:id/tags',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupNode, 'EDITOR')] },
    async (request) => {
      const body = setNodeTagsSchema.parse(request.body);
      return nodesService.setNodeTags(request.params.id, body.tagIds);
    }
  );
}
