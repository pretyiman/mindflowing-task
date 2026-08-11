import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { mapsRoutes } from './routes/maps.routes.js';
import { categoriesRoutes } from './routes/categories.routes.js';
import { relationTypesRoutes } from './routes/relationTypes.routes.js';
import { nodesRoutes } from './routes/nodes.routes.js';
import { edgesRoutes } from './routes/edges.routes.js';
import { tagsRoutes } from './routes/tags.routes.js';
import { groupsRoutes } from './routes/groups.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { collaboratorsRoutes } from './routes/collaborators.routes.js';
import { invitesRoutes } from './routes/invites.routes.js';
import { activityRoutes } from './routes/activity.routes.js';
import { taskStatusesRoutes } from './routes/taskStatuses.routes.js';
import { taskCommentsRoutes } from './routes/taskComments.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { taskAttachmentsRoutes } from './routes/taskAttachments.routes.js';
import { teamsRoutes } from './routes/teams.routes.js';
import { cronRoutes } from './routes/cron.routes.js';
import { inboxRoutes } from './routes/inbox.routes.js';
import { remindersRoutes } from './routes/reminders.routes.js';
import { checklistRoutes } from './routes/checklist.routes.js';

// Builds the API-only Fastify app - no .listen(), no static-file serving.
// Shared by index.ts (local dev + Render, which add static serving and call
// .listen()) and api/[...slug].ts (Vercel, which wraps this as a serverless
// function - Vercel serves client/dist as static output on its own, so
// there's nothing static for this app to serve there).
//
// registerNotFoundHandler defaults on (that's all api/[...slug].ts needs -
// plain JSON 404s). index.ts passes false and installs its own instead,
// since Fastify throws if setNotFoundHandler is called twice on one
// instance - its version also has to handle the SPA fallback, which this
// one doesn't know about.
export async function createApp(options: { registerNotFoundHandler?: boolean } = {}) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  registerErrorHandler(app);

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }));
      await api.register(mapsRoutes);
      await api.register(categoriesRoutes);
      await api.register(relationTypesRoutes);
      await api.register(nodesRoutes);
      await api.register(edgesRoutes);
      await api.register(tagsRoutes);
      await api.register(groupsRoutes);
      await api.register(authRoutes);
      await api.register(collaboratorsRoutes);
      await api.register(invitesRoutes);
      await api.register(activityRoutes);
      await api.register(taskStatusesRoutes);
      await api.register(taskCommentsRoutes);
      await api.register(notificationsRoutes);
      await api.register(taskAttachmentsRoutes);
      await api.register(teamsRoutes);
      await api.register(cronRoutes);
      await api.register(inboxRoutes);
      await api.register(remindersRoutes);
      await api.register(checklistRoutes);
    },
    { prefix: '/api' }
  );

  if (options.registerNotFoundHandler !== false) {
    app.setNotFoundHandler((_request, reply) => {
      reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    });
  }

  return app;
}
