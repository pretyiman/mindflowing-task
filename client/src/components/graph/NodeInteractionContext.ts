import { createContext, useContext } from 'react';
import type { MapMember, NodeCategory, TaskStatus } from '../../types/graph';

export interface QuickAddPayload {
  name: string;
  categoryId: string | null;
}

export interface NodeInteractionContextValue {
  categories: NodeCategory[];
  onQuickAdd: (sourceNodeId: string, payload: QuickAddPayload) => Promise<void>;
  canEdit: boolean;
  isOwner: boolean;
  taskManagementEnabled: boolean;
  taskStatuses: TaskStatus[];
  members: MapMember[];
}

export const NodeInteractionContext = createContext<NodeInteractionContextValue | null>(null);

export function useNodeInteraction() {
  const ctx = useContext(NodeInteractionContext);
  if (!ctx) throw new Error('useNodeInteraction must be used within NodeInteractionContext.Provider');
  return ctx;
}
