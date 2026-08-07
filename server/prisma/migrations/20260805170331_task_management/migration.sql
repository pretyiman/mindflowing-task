-- AlterTable
ALTER TABLE "maps" ADD COLUMN     "task_management_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "assignee_id" TEXT,
ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "task_status_id" TEXT;

-- CreateTable
CREATE TABLE "task_statuses" (
    "id" TEXT NOT NULL,
    "map_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_statuses_map_id_name_key" ON "task_statuses"("map_id", "name");

-- CreateIndex
CREATE INDEX "nodes_task_status_id_idx" ON "nodes"("task_status_id");

-- CreateIndex
CREATE INDEX "nodes_assignee_id_idx" ON "nodes"("assignee_id");

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_task_status_id_fkey" FOREIGN KEY ("task_status_id") REFERENCES "task_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
