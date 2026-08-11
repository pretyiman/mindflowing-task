import { z } from 'zod';

export const createReminderSchema = z.object({
  title: z.string().min(1).max(200),
  note: z.string().max(2000).nullable().optional(),
  remindAt: z.string().datetime()
});
