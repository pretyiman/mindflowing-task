import { z } from 'zod';

export const TASK_STATUS_KINDS = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

export const createTaskStatusSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().optional(),
  kind: z.enum(TASK_STATUS_KINDS).optional()
});

export const updateTaskStatusSchema = createTaskStatusSchema.partial();
