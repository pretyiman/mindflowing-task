import { prisma } from '../db.js';
import { notify } from './notifications.js';
import { sendDueSoonEmail } from './email.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
// How long a single reminder covers before the SAME task nags again. This is
// what makes a still-overdue, still-ignored task keep resurfacing instead of
// reminding once and going silent forever - dueSoonNotifiedAt is "last time
// we reminded about this", not a one-shot flag: eligibility is "never
// reminded, or reminded more than a day ago", not "never reminded".
const RENOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Finds not-done tasks due within the next 24h (or already overdue) that
 * either haven't been reminded about yet, or were last reminded more than
 * RENOTIFY_INTERVAL_MS ago - so a task that's still sitting untouched keeps
 * getting nagged about once a day rather than reminding once and staying
 * silent no matter how long it's ignored afterward. Fires the same
 * notify+email pipeline assignment already uses, just with the DUE_SOON
 * type. "Not done" is completedAt === null - see schema.prisma's
 * Node.completedAt comment: it's set iff the task is currently in a
 * DONE-kind status, so this needs no TaskStatus join. nodes.service.ts
 * resets dueSoonNotifiedAt to null on any dueDate change, so rescheduling
 * also re-arms the very next check rather than waiting out the interval.
 */
export async function checkDueSoonReminders(): Promise<{ tasksReminded: number; remindersSent: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);
  const renotifyBefore = new Date(now.getTime() - RENOTIFY_INTERVAL_MS);

  const tasks = await prisma.node.findMany({
    where: {
      isTask: true,
      completedAt: null,
      dueDate: { not: null, lte: windowEnd },
      OR: [{ dueSoonNotifiedAt: null }, { dueSoonNotifiedAt: { lt: renotifyBefore } }]
    },
    select: {
      id: true,
      mapId: true,
      name: true,
      dueDate: true,
      map: { select: { name: true } },
      assignees: { select: { user: { select: { id: true, email: true } } } }
    }
  });

  let remindersSent = 0;
  for (const task of tasks) {
    // Genuinely overdue vs. still just "coming up soon" - both fall inside
    // the same lookup window, but they deserve different wording; nagging
    // about something "due soon" that's actually three days overdue reads as
    // broken.
    const isOverdue = (task.dueDate as Date).getTime() < now.getTime();
    const message = isOverdue ? `"${task.name}" is overdue` : `"${task.name}" is due soon`;
    for (const { user } of task.assignees) {
      void notify(user.id, task.mapId, task.id, 'DUE_SOON', message);
      sendDueSoonEmail(user.email, task.name, task.map.name, task.dueDate as Date).catch((err) =>
        console.error('[dueSoonReminders] failed to send due-soon email', err)
      );
      remindersSent++;
    }
    // Marked reminded even with zero assignees - an unassigned task due soon
    // has nobody to notify, and re-checking it every run in the meantime
    // would be pure waste; it's still eligible again after the same
    // RENOTIFY_INTERVAL_MS, in case it picks up an assignee later.
    await prisma.node.update({ where: { id: task.id }, data: { dueSoonNotifiedAt: now } });
  }

  return { tasksReminded: tasks.length, remindersSent };
}
