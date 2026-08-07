import { z } from 'zod';

export const createAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000)
});
