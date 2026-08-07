-- CreateTable
CREATE TABLE "node_assignees" (
    "node_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_assignees_pkey" PRIMARY KEY ("node_id","user_id")
);

-- AddForeignKey
ALTER TABLE "node_assignees" ADD CONSTRAINT "node_assignees_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_assignees" ADD CONSTRAINT "node_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing single assignee carries over as that task's only assignee.
INSERT INTO "node_assignees" ("node_id", "user_id")
  SELECT "id", "assignee_id" FROM "nodes" WHERE "assignee_id" IS NOT NULL;

-- DropForeignKey (the old single-assignee FK)
ALTER TABLE "nodes" DROP CONSTRAINT IF EXISTS "nodes_assignee_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "nodes_assignee_id_idx";

-- AlterTable
ALTER TABLE "nodes" DROP COLUMN "assignee_id";
