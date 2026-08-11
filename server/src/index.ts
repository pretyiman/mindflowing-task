import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { createApp } from './app.js';
import { env } from './env.js';
import { checkDueSoonReminders } from './lib/dueSoonReminders.js';
import { checkReminders } from './services/reminders.service.js';

// Fastify only allows one setNotFoundHandler call per instance, and this
// file always needs to install its own (see below) - so createApp() is told
// not to register its default one.
const app = await createApp({ registerNotFoundHandler: false });

// In dev, Vite's own dev server serves the client (see vite.config.ts's proxy).
// On Render there's no separate frontend host - this process runs with
// cwd = server/ (npm workspaces convention), so client/dist sits one level
// up. Only registered when that build actually exists, so a plain dev/test
// run of the compiled server never needs it. (Vercel doesn't run this file
// at all - see api/[...slug].ts - it serves client/dist as static output
// directly, so this block is Render/local-only.)
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
const hasClientBuild = fs.existsSync(clientDistPath);
if (hasClientBuild) {
  await app.register(fastifyStatic, { root: clientDistPath });
}
// SPA fallback: any GET that isn't a static asset or an /api/* route (e.g.
// a hard refresh on /invite/:token) still gets index.html, so client-side
// routing can take over. API 404s (and everything when there's no client
// build at all, e.g. a plain API-only local run) stay JSON.
app.setNotFoundHandler((request, reply) => {
  if (hasClientBuild && request.method === 'GET' && !request.url.startsWith('/api')) {
    reply.sendFile('index.html');
    return;
  }
  reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
});

app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Vercel has no long-running process for a setInterval to live in - it uses
// vercel.json's crons + routes/cron.routes.ts instead. This process (local
// dev, or Render if that's ever revived) DOES stay up, so it can just run
// the same checks on a timer directly. 15 minutes is frequent enough that a
// task crossing into the 24h due-soon window - or a personal Reminder's own
// remindAt moment - is caught promptly, without hammering the DB.
const REMINDER_CHECK_INTERVAL_MS = 15 * 60 * 1000;
setInterval(() => {
  checkDueSoonReminders().catch((err) => app.log.error(err, '[dueSoonReminders] periodic check failed'));
  checkReminders().catch((err) => app.log.error(err, '[reminders] periodic check failed'));
}, REMINDER_CHECK_INTERVAL_MS);
