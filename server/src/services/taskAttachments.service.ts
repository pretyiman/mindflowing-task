import { prisma } from '../db.js';
import { NotFoundError } from '../errors.js';

const uploaderSelect = { id: true, email: true, name: true } as const;

export async function listAttachments(nodeId: string) {
  return prisma.taskAttachment.findMany({
    where: { nodeId },
    orderBy: { createdAt: 'asc' },
    include: { uploader: { select: uploaderSelect } }
  });
}

export async function createAttachment(nodeId: string, uploaderId: string, name: string, url: string) {
  const node = await prisma.node.findUnique({ where: { id: nodeId }, select: { id: true } });
  if (!node) throw new NotFoundError('Node');

  return prisma.taskAttachment.create({
    data: { nodeId, uploaderId, name, url },
    include: { uploader: { select: uploaderSelect } }
  });
}

export async function deleteAttachment(id: string) {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment');
  await prisma.taskAttachment.delete({ where: { id } });
}
