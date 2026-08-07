-- CreateEnum
CREATE TYPE "AppMode" AS ENUM ('TASK_MANAGER', 'MINDFLOW', 'BOTH');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "app_mode" "AppMode" NOT NULL DEFAULT 'BOTH';
