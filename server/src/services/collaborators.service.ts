import { prisma } from '../db.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { createInvite } from './invites.service.js';

type Role = 'VIEWER' | 'EDITOR';

const userSelect = { id: true, email: true, name: true } as const;

export async function listCollaborators(mapId: string) {
  const rows = await prisma.mapCollaborator.findMany({
    where: { mapId },
    include: { user: { select: userSelect }, scopeTags: { select: { tagId: true } } },
    orderBy: { createdAt: 'asc' }
  });
  return rows.map(({ scopeTags, ...row }) => ({ ...row, scopeTagIds: scopeTags.map((s) => s.tagId) }));
}

// Doesn't require the invited email to already have an account, and doesn't
// grant access instantly - it creates a pending invite (see
// invites.service.ts). The recipient logs in and accepts it themselves,
// either from the email address it was created for or from the link the
// owner hands them directly.
export async function inviteCollaborator(mapId: string, ownerId: string, email: string, role: Role) {
  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (owner?.email === email) throw new ConflictError('The map owner already has full access');

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existing = await prisma.mapCollaborator.findUnique({
      where: { mapId_userId: { mapId, userId: existingUser.id } }
    });
    if (existing) throw new ConflictError('This user is already a collaborator on this map');
  }

  return createInvite(mapId, email, role);
}

export async function updateCollaborator(
  id: string,
  data: { role?: Role; scopeTagIds?: string[] }
) {
  const existing = await prisma.mapCollaborator.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Collaborator');

  if (data.scopeTagIds) {
    const validCount = await prisma.tag.count({
      where: { id: { in: data.scopeTagIds }, mapId: existing.mapId }
    });
    if (validCount !== new Set(data.scopeTagIds).size) {
      throw new NotFoundError('One or more tags');
    }
    await prisma.$transaction([
      prisma.collaboratorTagScope.deleteMany({ where: { collaboratorId: id } }),
      prisma.collaboratorTagScope.createMany({
        data: data.scopeTagIds.map((tagId) => ({ collaboratorId: id, tagId }))
      })
    ]);
  }

  if (data.role) {
    await prisma.mapCollaborator.update({ where: { id }, data: { role: data.role } });
  }

  const [updated, scopeTags] = await Promise.all([
    prisma.mapCollaborator.findUniqueOrThrow({
      where: { id },
      include: { user: { select: userSelect } }
    }),
    prisma.collaboratorTagScope.findMany({ where: { collaboratorId: id }, select: { tagId: true } })
  ]);
  return { ...updated, scopeTagIds: scopeTags.map((s) => s.tagId) };
}

export async function removeCollaborator(id: string) {
  const existing = await prisma.mapCollaborator.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Collaborator');
  await prisma.mapCollaborator.delete({ where: { id } });
}
