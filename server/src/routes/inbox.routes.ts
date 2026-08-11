import type { FastifyInstance } from 'fastify';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { quickCaptureSchema } from '../schemas/inbox.schema.js';
import * as inboxService from '../services/inbox.service.js';

// No requireMapAccess/requireNodeVisible here - unlike every other node
// mutation route, this one never takes a mapId from the client at all. The
// target (the actor's own Inbox project) is always resolved server-side from
// the actor's own id, so there's nothing to authorize beyond "is this a real,
// verified user" - the same bar POST /maps/:mapId/nodes already sets.
export async function inboxRoutes(app: FastifyInstance) {
  app.post(
    '/inbox/quick-capture',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      const body = quickCaptureSchema.parse(request.body);
      const result = await inboxService.quickCapture(request.user!.id, body.name);
      reply.status(201).send(result);
    }
  );
}
