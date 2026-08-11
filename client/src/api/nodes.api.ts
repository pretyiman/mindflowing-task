import { api } from './client';
import type { GraphNode, PropertyValue, RecurrenceRule, TaskPriority } from '../types/graph';

type NodeInput = {
  categoryId?: string | null;
  name: string;
  iconOverride?: string | null;
  colorOverride?: string | null;
  notes?: string;
  properties?: Record<string, PropertyValue>;
  posX?: number | null;
  posY?: number | null;
  isTask?: boolean;
  taskStatusId?: string | null;
  assigneeIds?: string[];
  priority?: TaskPriority | null;
  dueDate?: string | null;
  recurrenceRule?: RecurrenceRule | null;
};

type NodeUpdateInput = Partial<NodeInput>;

export const nodesApi = {
  list: (mapId: string) => api.get<GraphNode[]>(`/maps/${mapId}/nodes`),
  create: (mapId: string, data: NodeInput) => api.post<GraphNode>(`/maps/${mapId}/nodes`, data),
  update: (id: string, data: NodeUpdateInput) => api.patch<GraphNode>(`/nodes/${id}`, data),
  remove: (id: string) => api.delete<void>(`/nodes/${id}`),
  createSubtask: (parentId: string, name: string) => api.post<GraphNode>(`/nodes/${parentId}/subtasks`, { name })
};
