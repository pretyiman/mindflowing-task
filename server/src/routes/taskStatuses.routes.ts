import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { requireMapAccess, requireResourceMapAccess } from '../plugins/authorization.js';
import { createTaskStatusSchema, updateTaskStatusSchema } from '../schemas/taskStatuses.schema.js';
import * as taskStatusesService from '../services/taskStatuses.service.js';

const lookupTaskStatus = (id: string) =>
  prisma.taskStatus.findUnique({ where: { id }, select: { mapId: true } });

export async function taskStatusesRoutes(app: FastifyInstance) {
  app.get<{ Params: { mapId: string } }>(
    '/maps/:mapId/task-statuses',
    { preHandler: [requireAuth, requireMapAccess('VIEWER')] },
    async (request) => taskStatusesService.listTaskStatuses(request.params.mapId)
  );

  app.post<{ Params: { mapId: string } }>(
    '/maps/:mapId/task-statuses',
    { preHandler: [requireAuth, requireVerifiedEmail, requireMapAccess('EDITOR')] },
    async (request, reply) => {
      const body = createTaskStatusSchema.parse(request.body);
      const status = await taskStatusesService.createTaskStatus(request.params.mapId, body, request.user!.id);
      reply.status(201).send(status);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/task-statuses/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupTaskStatus, 'EDITOR')] },
    async (request) => {
      const body = updateTaskStatusSchema.parse(request.body);
      return taskStatusesService.updateTaskStatus(request.params.id, body, request.user!.id);
    }
  );

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/task-statuses/:id',
    { preHandler: [requireAuth, requireVerifiedEmail, requireResourceMapAccess(lookupTaskStatus, 'EDITOR')] },
    async (request, reply) => {
      await taskStatusesService.deleteTaskStatus(
        request.params.id,
        request.query.force === 'true',
        request.user!.id
      );
      reply.status(204).send();
    }
  );
}
