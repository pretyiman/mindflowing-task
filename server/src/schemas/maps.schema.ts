import { z } from 'zod';

export const createMapSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Set once at creation, never in updateMapSchema below - immutable after
  // that (see maps.service.ts's createMap and the schema.prisma comment on
  // Map.workspaceType for why).
  workspaceType: z.enum(['GRAPH', 'TASKS']).optional()
});

export const updateMapSchema = createMapSchema
  .omit({ workspaceType: true })
  .partial()
  .extend({
    // Owner-only - enforced in maps.service.ts's updateMap, not just here.
    restrictedAccessEnabled: z.boolean().optional(),
    taskManagementEnabled: z.boolean().optional()
  });
