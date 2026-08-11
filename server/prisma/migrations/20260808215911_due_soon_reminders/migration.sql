-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DUE_SOON';

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "due_soon_notified_at" TIMESTAMP(3);
