import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import { createCategorySchema, updateCategorySchema } from '../schemas/categories.schema.js';
import * as categoriesService from '../services/categories.service.js';

const lookupCategory = (id: string) =>
  prisma.nodeCategory.findUnique({ where: { id }, select: { mapId: true } });

export async function categoriesRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/categories',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => categoriesService.listCategories(request.params.mapId)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/categories',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createCategorySchema.parse(request.body);
      const category = await categoriesService.createCategory(request.params.mapId, body, request.user!.id);
      reply.status(201).send(category);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/categories/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupCategory, 'EDITOR')] },
    async (request) => {
      const body = updateCategorySchema.parse(request.body);
      return categoriesService.updateCategory(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/categories/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupCategory, 'EDITOR')] },
    async (request, reply) => {
      await categoriesService.deleteCategory(request.params.id, request.query.force === 'true', request.user!.id);
      reply.status(204).send();
    }
  );
}
