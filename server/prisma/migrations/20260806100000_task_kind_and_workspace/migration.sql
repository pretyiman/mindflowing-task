-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('GRAPH', 'TASKS');

-- CreateEnum
CREATE TYPE "TaskStatusKind" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "maps" ADD COLUMN     "workspace_type" "WorkspaceType" NOT NULL DEFAULT 'GRAPH';

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable: kind replaces is_done - add with a default, backfill from the
-- old boolean, then drop it once no data depends on it.
ALTER TABLE "task_statuses" ADD COLUMN     "kind" "TaskStatusKind" NOT NULL DEFAULT 'TODO';

UPDATE "task_statuses" SET "kind" = 'DONE' WHERE "is_done" = true;

ALTER TABLE "task_statuses" DROP COLUMN "is_done";
