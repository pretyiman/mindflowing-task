import { prisma } from '../db.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors.js';

async function assertTeamOwner(teamId: string, ownerId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new NotFoundError('Team');
  if (team.ownerId !== ownerId) throw new ForbiddenError('Not your team');
  return team;
}

export async function listTeams(ownerId: string) {
  return prisma.team.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'asc' },
    include: { members: { orderBy: { email: 'asc' } } }
  });
}

export async function createTeam(ownerId: string, name: string) {
  return prisma.team.create({ data: { ownerId, name }, include: { members: true } });
}

export async function deleteTeam(id: string, ownerId: string) {
  await assertTeamOwner(id, ownerId);
  await prisma.team.delete({ where: { id } });
}

export async function addMember(teamId: string, ownerId: string, email: string) {
  await assertTeamOwner(teamId, ownerId);
  const existing = await prisma.teamMember.findUnique({ where: { teamId_email: { teamId, email } } });
  if (existing) throw new ConflictError('This email is already on the team');
  return prisma.teamMember.create({ data: { teamId, email } });
}

export async function removeMember(memberId: string, ownerId: string) {
  const member = await prisma.teamMember.findUnique({ where: { id: memberId }, include: { team: true } });
  if (!member) throw new NotFoundError('Team member');
  if (member.team.ownerId !== ownerId) throw new ForbiddenError('Not your team');
  await prisma.teamMember.delete({ where: { id: memberId } });
}
