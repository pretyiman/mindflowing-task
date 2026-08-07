import type { FastifyInstance } from 'fastify';
import { requireAuth, requireVerifiedEmail } from '../plugins/auth.js';
import { addTeamMemberSchema, createTeamSchema } from '../schemas/teams.schema.js';
import * as teamsService from '../services/teams.service.js';

export async function teamsRoutes(app: FastifyInstance) {
  app.get('/teams', { preHandler: requireAuth }, async (request) => teamsService.listTeams(request.user!.id));

  app.post('/teams', { preHandler: [requireAuth, requireVerifiedEmail] }, async (request, reply) => {
    const body = createTeamSchema.parse(request.body);
    const team = await teamsService.createTeam(request.user!.id, body.name);
    reply.status(201).send(team);
  });

  app.delete<{ Params: { id: string } }>(
    '/teams/:id',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      await teamsService.deleteTeam(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );

  app.post<{ Params: { id: string } }>(
    '/teams/:id/members',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      const body = addTeamMemberSchema.parse(request.body);
      const member = await teamsService.addMember(request.params.id, request.user!.id, body.email);
      reply.status(201).send(member);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/team-members/:id',
    { preHandler: [requireAuth, requireVerifiedEmail] },
    async (request, reply) => {
      await teamsService.removeMember(request.params.id, request.user!.id);
      reply.status(204).send();
    }
  );
}
