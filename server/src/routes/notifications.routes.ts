import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as notificationsService from '../services/notifications.service.js';

export async function notificationsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { cursor?: string } }>(
    '/notifications',
    { preHandler: requireAuth },
    async (request) => notificationsService.listNotifications(request.user!.id, request.query.cursor)
  );

  app.patch<{ Params: { id: string } }>(
    '/notifications/:id',
    { preHandler: requireAuth },
    async (request) => notificationsService.markRead(request.params.id, request.user!.id)
  );

  app.post(
    '/notifications/read-all',
    { preHandler: requireAuth },
    async (request, reply) => {
      await notificationsService.markAllRead(request.user!.id);
      reply.status(204).send();
    }
  );
}
