import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentCommentId: z.string().uuid().nullable().optional()
});
