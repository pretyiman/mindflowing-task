import { z } from 'zod';

export const inviteCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['VIEWER', 'EDITOR'])
});

export const updateCollaboratorSchema = z
  .object({
    role: z.enum(['VIEWER', 'EDITOR']).optional(),
    // Which tags this collaborator is scoped to - only meaningful once the
    // map has restrictedAccessEnabled on, ignored otherwise. Replace-all:
    // sending [] clears all scoping (collaborator then sees nothing but
    // explicit node grants, once restricted access is on).
    scopeTagIds: z.array(z.string().uuid()).optional()
  })
  .refine((data) => data.role !== undefined || data.scopeTagIds !== undefined, {
    message: 'Provide role, scopeTagIds, or both'
  });
