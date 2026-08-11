// Built-in relation type name for sub-tasks - lazily get-or-created per map
// server-side (see nodes.service.ts's getOrCreateSubtaskRelationType).
// Shared here so every client surface that computes sub-task/parent-task
// relationships (TaskEditPanel, NodeDetailPanel) agrees on the same name.
export const SUBTASK_RELATION_NAME = 'Sub-task of';
