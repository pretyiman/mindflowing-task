import { z } from 'zod';

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const createNodeSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  iconOverride: z.string().max(20).nullable().optional(),
  colorOverride: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  notes: z.string().max(20000).optional(),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  posX: z.number().nullable().optional(),
  posY: z.number().nullable().optional(),
  // Whether this node counts as a task at all - see its own schema.prisma
  // comment. Not privileged (any editor can set it), unlike assigneeIds/dueDate.
  isTask: z.boolean().optional(),
  // Meaningless unless the map has taskManagementEnabled on - validated in
  // nodes.service.ts (taskStatusId belongs to the same map, each assignee is
  // the map owner or an existing collaborator). Full-replace-the-set: an
  // array sets the complete assignee list, no add/remove-one endpoint.
  taskStatusId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional()
});

export const updateNodeSchema = createNodeSchema.partial();

export const createSubtaskSchema = z.object({
  name: z.string().min(1).max(200)
});
