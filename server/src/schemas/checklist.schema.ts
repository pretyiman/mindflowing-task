import { z } from 'zod';

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500)
});

export const updateChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional()
});

export const reorderChecklistSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});
