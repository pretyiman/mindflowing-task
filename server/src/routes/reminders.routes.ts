import type { FastifyInstance } from 'fastify';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { createReminderSchema } from '../schemas/reminders.schema.js';
import * as remindersService from '../services/reminders.service.js';

// No map/collaborator gating anywhere here - a reminder has no Map at all
// (see schema.prisma's Reminder comment), so requireAuth alone is the whole
// access-control story: you can only ever list/create/delete your own.
export async function remindersRoutes(app: FastifyInstance) {
  app.get('/reminders', { preHandler: requireAuth }, async (request) =>
    remindersService.listReminders(request.user!.id)
  );

  app.post(
    '/reminders',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      const body = createReminderSchema.parse(request.body);
      const reminder = await remindersService.createReminder(request.user!.id, body);
      reply.status(201).send(reminder);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/reminders/:id',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      await remindersService.deleteReminder(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );
}
