import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { requireMapOwner } from '../plugins/authorization.js';
import * as activityService from '../services/activity.service.js';

export async function activityRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string }; Querystring: { cursor?: string } }>(
    '/maps/:mapId/activity',
    { preHandler: [requireAuth, requireMapOwner()] },
    async (request) => activityService.listActivity(request.params.mapId, request.query.cursor)
  );
}
