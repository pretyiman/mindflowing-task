import { z } from 'zod';

export const quickCaptureSchema = z.object({
  name: z.string().min(1).max(200)
});
