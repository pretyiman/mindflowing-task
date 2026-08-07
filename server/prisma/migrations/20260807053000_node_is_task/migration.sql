-- AlterTable
ALTER TABLE "nodes" ADD COLUMN "is_task" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every node in a TASKS workspace was already created through the
-- task flow (that workspace has no canvas at all); a GRAPH map's node counts
-- as a pre-existing task only if it already has some task field set. Plain
-- content nodes (no task field ever touched) stay is_task = false.
UPDATE "nodes" n
SET "is_task" = true
FROM "maps" m
WHERE n.map_id = m.id
  AND (
    m.workspace_type = 'TASKS'
    OR n.task_status_id IS NOT NULL
    OR n.assignee_id IS NOT NULL
    OR n.priority IS NOT NULL
    OR n.due_date IS NOT NULL
  );
