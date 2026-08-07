import { z } from 'zod';

export const setNodeAccessSchema = z.object({
  restrictToGrantsOnly: z.boolean(),
  userIds: z.array(z.string().uuid())
});
