import { createContext, useContext } from 'react';
import type { GraphNode, MapMember, NodeCategory, TaskStatus } from '../../types/graph';

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
  // Edge-based task-to-node linking (the simple alternative to matching by
  // email/phone): any node connected by a plain edge to a task node shows a
  // small badge summarizing that task's status - no dedicated relation type
  // or schema change needed, an ordinary drawn connection is the link. Keyed
  // by node id, values are the linked task nodes themselves (never includes
  // task nodes as keys - see GraphCanvas.tsx's computation).
  linkedTasksByNodeId: Map<string, GraphNode[]>;
}

export const NodeInteractionContext = createContext<NodeInteractionContextValue | null>(null);

export function useNodeInteraction() {
  const ctx = useContext(NodeInteractionContext);
  if (!ctx) throw new Error('useNodeInteraction must be used within NodeInteractionContext.Provider');
  return ctx;
}
