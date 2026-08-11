import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { checkDueSoonReminders } from '../lib/dueSoonReminders.js';
import { checkReminders } from '../services/reminders.service.js';

// Not gated by requireAuth (that's for logged-in users, not Vercel's own
// scheduler) - CRON_SECRET is a separate shared secret Vercel automatically
// sends as `Authorization: Bearer <CRON_SECRET>` on requests it makes to
// trigger a job declared in vercel.json's crons. If CRON_SECRET was never
// set (local dev/Render, where the periodic check runs via index.ts's
// setInterval instead), this route simply always 404s - it does nothing
// harmful, just isn't wired to anything.
export async function cronRoutes(app: FastifyInstance) {
  // GET, not POST - Vercel Cron Jobs invoke the configured path with a plain
  // GET request (see vercel.json's crons). Covers both due-soon/overdue task
  // nags and personal Reminders - one route, one cron job, both checks -
  // deliberately not two separate cron entries (Vercel's Hobby plan caps
  // cron invocation frequency per job, not job count, but there's no reason
  // to spend a second job slot on what's really the same "periodic check"
  // concept).
  app.get('/cron/reminders', async (request, reply) => {
    if (!env.CRON_SECRET || request.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
      reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    const [dueSoon, reminders] = await Promise.all([checkDueSoonReminders(), checkReminders()]);
    return { dueSoon, reminders };
  });
}
