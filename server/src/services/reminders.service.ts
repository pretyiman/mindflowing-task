import { prisma } from '../db.js';
import { NotFoundError, ForbiddenError } from '../errors.js';
import { notify } from '../lib/notifications.js';
import { sendReminderEmail } from '../lib/email.js';
import { getOrCreateInboxMap } from './inbox.service.js';

type ReminderInput = {
  title: string;
  note?: string | null;
  remindAt: string;
};

export async function createReminder(userId: string, data: ReminderInput) {
  return prisma.reminder.create({
    data: { userId, title: data.title, note: data.note ?? null, remindAt: new Date(data.remindAt) }
  });
}

// No map/collaborator concept at all - a reminder is 100% personal, so
// "list mine" is the only visibility rule. No date-range params (v1) - the
// expected volume per user is small, and CalendarView already fetches/
// filters a month's worth of cross-project tasks client-side the same way.
export async function listReminders(userId: string) {
  return prisma.reminder.findMany({ where: { userId }, orderBy: { remindAt: 'asc' } });
}

export async function deleteReminder(id: string, userId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder) throw new NotFoundError('Reminder');
  if (reminder.userId !== userId) throw new ForbiddenError('Not your reminder');
  await prisma.reminder.delete({ where: { id } });
}

/**
 * Finds reminders whose moment has arrived (remindAt <= now) and haven't
 * fired yet, and sends the same notify+email pipeline the rest of the app
 * uses. One-shot per reminder (notifiedAt is set once and never reset -
 * unlike Node.dueSoonNotifiedAt, there's no "still ignored, nag again"
 * concept here, since a reminder isn't an actionable task with a done
 * state to check). Routes through each user's own Inbox project purely to
 * satisfy Notification.mapId (non-nullable) - a reminder isn't really
 * "about" that project, but every personal notification needs some map to
 * hang off of, and Inbox (get-or-created lazily, see inbox.service.ts) is
 * the closest thing this app has to a user's own home base.
 */
export async function checkReminders(): Promise<{ remindersSent: number }> {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: { remindAt: { lte: now }, notifiedAt: null },
    include: { user: { select: { id: true, email: true } } }
  });

  let remindersSent = 0;
  for (const reminder of due) {
    const map = await getOrCreateInboxMap(reminder.userId);
    void notify(reminder.userId, map.id, null, 'REMINDER', reminder.title);
    sendReminderEmail(reminder.user.email, reminder.title, reminder.note, reminder.remindAt).catch((err) =>
      console.error('[reminders.service] failed to send reminder email', err)
    );
    await prisma.reminder.update({ where: { id: reminder.id }, data: { notifiedAt: now } });
    remindersSent++;
  }

  return { remindersSent };
}
