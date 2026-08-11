export type MapRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export type WorkspaceType = 'GRAPH' | 'TASKS';

export interface MindMap {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  myRole: MapRole;
  restrictedAccessEnabled: boolean;
  taskManagementEnabled: boolean;
  workspaceType: WorkspaceType;
  // Optional project target completion date, owner-settable via Map
  // Settings - purely a pace signal (see ProjectsDashboard's computeStats),
  // no other behavior depends on it.
  targetDate: string | null;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatusKind = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface TaskStatus {
  id: string;
  mapId: string;
  name: string;
  color: string;
  order: number;
  kind: TaskStatusKind;
}

export interface MapMember {
  id: string;
  email: string;
  name: string | null;
  role: MapRole;
}

export interface NodeCategory {
  id: string;
  mapId: string;
  name: string;
  icon: string;
  color: string;
}

export interface RelationType {
  id: string;
  mapId: string;
  name: string;
  isDirectional: boolean;
  isHierarchy: boolean;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  maxOutgoingPerSource: number | null;
  maxIncomingPerTarget: number | null;
}

export type PropertyValue = string | number | boolean | null;

export interface Tag {
  id: string;
  mapId: string;
  name: string;
  color: string;
}

export interface GraphNode {
  id: string;
  mapId: string;
  categoryId: string | null;
  name: string;
  iconOverride: string | null;
  colorOverride: string | null;
  notes: string;
  properties: Record<string, PropertyValue>;
  // Absolute canvas position when ungrouped; relative to the parent group's own
  // posX/posY when groupId is set (matches React Flow's parent/child convention).
  posX: number | null;
  posY: number | null;
  tagIds: string[];
  groupId: string | null;
  restrictToGrantsOnly: boolean;
  hasAccessGrants: boolean;
  // Whether this node is tracked as a task - see schema.prisma's own comment
  // on Node.isTask. False for ordinary canvas content nodes even on a map
  // with task management enabled.
  isTask: boolean;
  taskStatusId: string | null;
  // Multi-assignee, no primary/secondary distinction - see NodeAssignee's
  // own schema.prisma comment. Empty array, never null, when unassigned.
  assigneeIds: string[];
  priority: TaskPriority | null;
  dueDate: string | null;
  // Opt-in "fluid" recurrence - see schema.prisma's Node.recurrenceRule
  // comment. Meaningless without dueDate also set.
  recurrenceRule: RecurrenceRule | null;
  // Auto-tracked server-side, never client-editable - see the schema.prisma
  // comment on Node.startedAt/completedAt for the exact transition rules.
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceRule = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'WEEKDAYS';

export interface NodeGroup {
  id: string;
  mapId: string;
  name: string;
  color: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
}

export type HandleId = 'top' | 'bottom' | 'left' | 'right';

export interface GraphEdge {
  id: string;
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationTypeId: string;
  labelOverride: string | null;
  properties: Record<string, PropertyValue>;
  sourceHandle: HandleId | null;
  targetHandle: HandleId | null;
  colorOverride: string | null;
  lineStyleOverride: 'solid' | 'dashed' | 'dotted' | null;
  widthOverride: number | null;
}

export interface GraphData {
  categories: NodeCategory[];
  relationTypes: RelationType[];
  tags: Tag[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: NodeGroup[];
  taskStatuses: TaskStatus[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
