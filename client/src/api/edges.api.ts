import { api } from './client';
import type { GraphEdge, HandleId, PropertyValue } from '../types/graph';

type EdgeInput = {
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId: string;
  labelOverride?: string | null;
  properties?: Record<string, PropertyValue>;
  sourceHandle?: HandleId | null;
  targetHandle?: HandleId | null;
  colorOverride?: string | null;
  lineStyleOverride?: 'solid' | 'dashed' | 'dotted' | null;
  widthOverride?: number | null;
};

type EdgeUpdateInput = Pick<
  EdgeInput,
  'labelOverride' | 'properties' | 'colorOverride' | 'lineStyleOverride' | 'widthOverride'
>;

// Reported alongside a newly-created edge so a task<->person connection that
// SHOULD have auto-assigned but silently couldn't (no email on the node, no
// matching/accepted collaborator) is diagnosable instead of a silent no-op -
// see edges.service.ts's AutoAssignOutcome, which this mirrors.
export type AutoAssignOutcome =
  | { status: 'not-applicable' }
  | { status: 'assigned'; personName: string; personEmail: string }
  | { status: 'already-assigned'; personName: string }
  | { status: 'no-email'; personName: string }
  | { status: 'no-match'; personName: string; email: string };

export const edgesApi = {
  list: (mapId: string) => api.get<GraphEdge[]>(`/maps/${mapId}/edges`),
  create: (mapId: string, data: EdgeInput) =>
    api.post<GraphEdge & { autoAssign: AutoAssignOutcome }>(`/maps/${mapId}/edges`, data),
  update: (id: string, data: Partial<EdgeUpdateInput>) => api.patch<GraphEdge>(`/edges/${id}`, data),
  remove: (id: string) => api.delete<void>(`/edges/${id}`)
};
