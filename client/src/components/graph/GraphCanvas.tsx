import {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphData, HandleId, MapMember } from '../../types/graph';
import { edgesApi } from '../../api/edges.api';
import { nodesApi } from '../../api/nodes.api';
import { groupsApi } from '../../api/groups.api';
import { mapsApi } from '../../api/maps.api';
import { ApiError } from '../../api/client';
import { useGraphStore } from '../../state/graphStore';
import CustomEdge from './CustomEdge';
import CustomNode from './CustomNode';
import GroupNode from './GroupNode';
import { filterGraph, isFilterActive } from './filterGraph';
import { toFlowGraph, type RFEdge, type RFNode } from './graphAdapter';
import { NodeInteractionContext } from './NodeInteractionContext';
import { getCurrentViewportCenter, registerViewportCenter } from './viewportCenter';

/** Publishes the current pane-center flow position so the toolbar can place
 * new nodes where the user is actually looking. Must live inside
 * ReactFlowProvider to use useReactFlow(). */
function ViewportCenterRegistrar() {
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    registerViewportCenter(() => {
      const pane = document.querySelector('.react-flow__pane');
      const rect = pane?.getBoundingClientRect();
      const cx = rect ? rect.x + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.y + rect.height / 2 : window.innerHeight / 2;
      return screenToFlowPosition({ x: cx, y: cy });
    });
    return () => registerViewportCenter(null);
  }, [screenToFlowPosition]);

  return null;
}

const DIMMED_OPACITY = 0.12;

const nodeTypes = { entity: CustomNode, group: GroupNode };
const edgeTypes = { relation: CustomEdge };

interface Props {
  mapId: string;
  data: GraphData;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onBackgroundClick: () => void;
  onChanged: () => void;
  canEdit: boolean;
  isOwner: boolean;
  taskManagementEnabled: boolean;
  onOpenCategories: () => void;
  onOpenRelationTypes: () => void;
  onOpenTags: () => void;
  onOpenActivity: () => void;
  onOpenTaskStatuses: () => void;
  onOpenProgress: () => void;
  // Only passed when this GRAPH map has task management on - switches to the
  // task list view for the rest of this visit (see App.tsx's viewOverride).
  onViewTaskList?: () => void;
}

interface PendingConnection {
  source: string;
  target: string;
  sourceHandle: HandleId | null;
  targetHandle: HandleId | null;
}

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

export default function GraphCanvas({
  mapId,
  data,
  selectedNodeId,
  onNodeClick,
  onBackgroundClick,
  onChanged,
  canEdit,
  isOwner,
  taskManagementEnabled,
  onOpenCategories,
  onOpenRelationTypes,
  onOpenTags,
  onOpenActivity,
  onOpenTaskStatuses,
  onOpenProgress,
  onViewTaskList
}: Props) {
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const [members, setMembers] = useState<MapMember[]>([]);

  useEffect(() => {
    if (!taskManagementEnabled) {
      setMembers([]);
      return;
    }
    mapsApi.members(mapId).then(setMembers);
  }, [mapId, taskManagementEnabled]);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [pendingRelationTypeId, setPendingRelationTypeId] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<RFEdge | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#cccccc');
  const [editLineStyle, setEditLineStyle] = useState<(typeof LINE_STYLES)[number]>('solid');
  const [editWidth, setEditWidth] = useState(2);
  const [editError, setEditError] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeCategoryId, setNewNodeCategoryId] = useState('');
  const [addNodeError, setAddNodeError] = useState<string | null>(null);
  const addNodePopoverRef = useRef<HTMLDivElement>(null);

  const closeAddNode = useCallback(() => {
    setShowAddNode(false);
    setNewNodeName('');
    setNewNodeCategoryId('');
    setAddNodeError(null);
  }, []);

  // Esc or a click outside the popover both back out of "Add Node" without
  // creating anything - same cancel affordance the other modals here already
  // get for free from .modal-overlay, which this floating popover doesn't use.
  useEffect(() => {
    if (!showAddNode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddNode();
    };
    const handleClickAway = (e: MouseEvent) => {
      if (addNodePopoverRef.current && !addNodePopoverRef.current.contains(e.target as Node)) {
        closeAddNode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    // Capture phase - React Flow's pane stops propagation on its own mousedown
    // handler (for pan/drag), which would otherwise swallow this before it
    // ever reaches a bubble-phase document listener.
    document.addEventListener('mousedown', handleClickAway, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickAway, true);
    };
  }, [showAddNode, closeAddNode]);

  // Space is used as the selection-box modifier, but the browser's own
  // default behavior for Space is "activate whatever element currently has
  // focus" (e.g. re-clicking a toolbar button that was last clicked) or
  // "scroll the page" - either one firing on every press is exactly what
  // made holding Space feel laggy/like it was fighting the drag. Suppressed
  // here, except while actually typing into a text field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Must be a stable reference - React Flow's internal selection listener
  // re-subscribes whenever this callback's identity changes, and an inline
  // arrow function here creates a new one every render, which was causing an
  // infinite render loop ("Maximum update depth exceeded").
  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: RFNode[] }) => {
    setMultiSelectedIds((prev) => {
      const next = selected.map((n) => n.id);
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
      return next;
    });
  }, []);

  const {
    searchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    selectedTaskStatusId,
    selectedPriority
  } = useGraphStore();
  const filterState = {
    searchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    selectedTaskStatusId,
    selectedPriority
  };
  const filterActive = isFilterActive(filterState);
  const matchedIds = useMemo(() => filterGraph(data, filterState), [data, JSON.stringify(filterState)]);

  // Data is the source of truth (server state); local nodes/edges state exists only so
  // React Flow can give smooth interactive dragging. Reset whenever upstream data changes.
  useEffect(() => {
    const { nodes: flowNodes, edges: flowEdges } = toFlowGraph(data);
    setNodes(
      flowNodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))
    );
    setEdges(flowEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === selectedNodeId })));
  }, [selectedNodeId]);

  const handleNodesChange = (changes: NodeChange<RFNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  };

  const handleEdgesChange = (changes: EdgeChange<RFEdge>[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  };

  const handleNodeDragStop = (_: unknown, node: RFNode) => {
    // A group's own drag updates its absolute position; a member's drag stays
    // relative-to-group (already what RF reports for a parentId child) - either
    // way it's just node.position, no conversion needed on this side.
    const persist =
      node.type === 'group'
        ? groupsApi.update(node.id, { posX: node.position.x, posY: node.position.y })
        : nodesApi.update(node.id, { posX: node.position.x, posY: node.position.y });
    persist
      .then(() => {
        // A grouped member's drag can trigger a server-side box resize (and
        // forces its horizontal position back to the group's margin) - the
        // local optimistic position from the drag itself doesn't know about
        // that, so refetch to pick up the corrected state.
        if (node.type !== 'group' && node.parentId) onChanged();
      })
      .catch(() => {
        /* best-effort persistence; local drag position stays visually correct regardless */
      });
  };

  const handleConnect = (connection: Connection) => {
    if (!canEdit) return;
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setConnectError(null);
    setPendingRelationTypeId(data.relationTypes[0]?.id ?? '');
    setPendingConnection({
      source: connection.source,
      target: connection.target,
      sourceHandle: (connection.sourceHandle as HandleId | null) ?? null,
      targetHandle: (connection.targetHandle as HandleId | null) ?? null
    });
  };

  const confirmConnection = async () => {
    if (!pendingConnection || !pendingRelationTypeId) return;
    try {
      await edgesApi.create(mapId, {
        sourceNodeId: pendingConnection.source,
        targetNodeId: pendingConnection.target,
        relationTypeId: pendingRelationTypeId,
        sourceHandle: pendingConnection.sourceHandle,
        targetHandle: pendingConnection.targetHandle
      });
      setPendingConnection(null);
      onChanged();
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : 'Failed to create connection');
    }
  };

  const handleEdgeClick = (edge: RFEdge) => {
    const raw = data.edges.find((e) => e.id === edge.id);
    setEditLabel(raw?.labelOverride ?? edge.data?.label ?? '');
    setEditColor(edge.data?.color ?? '#cccccc');
    setEditLineStyle((edge.data?.lineStyle ?? 'solid') as (typeof LINE_STYLES)[number]);
    setEditWidth(edge.data?.width ?? 2);
    setEditError(null);
    setSelectedEdge(edge);
  };

  const confirmEditEdge = async () => {
    if (!selectedEdge) return;
    try {
      await edgesApi.update(selectedEdge.id, {
        labelOverride: editLabel.trim() || null,
        colorOverride: editColor,
        lineStyleOverride: editLineStyle,
        widthOverride: editWidth
      });
      setSelectedEdge(null);
      onChanged();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to update connection');
    }
  };

  const confirmDeleteEdge = async () => {
    if (!selectedEdge) return;
    await edgesApi.remove(selectedEdge.id);
    setSelectedEdge(null);
    onChanged();
  };

  const handleQuickAdd = async (sourceNodeId: string, payload: { name: string; categoryId: string | null }) => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const relationTypeId = data.relationTypes[0]?.id;
    if (!relationTypeId) {
      throw new Error('Create a relation type first (Relation Types in the toolbar) before adding a connected node.');
    }
    // Quick-add is the mindmup-style "add child" shortcut, so the new node lands below
    // and wires bottom (of source) -> top (of new node), matching the vertical
    // parent/child convention.
    const newNode = await nodesApi.create(mapId, {
      categoryId: payload.categoryId,
      name: payload.name,
      posX: (sourceNode?.position.x ?? 0) + (Math.random() * 120 - 60),
      posY: (sourceNode?.position.y ?? 0) + 180
    });
    await edgesApi.create(mapId, {
      sourceNodeId,
      targetNodeId: newNode.id,
      relationTypeId,
      sourceHandle: 'bottom',
      targetHandle: 'top'
    });
    onChanged();
  };

  // Only entity nodes can be grouped - a group box selected alongside its own
  // members (or another group) isn't a meaningful "group these" action.
  const groupableSelectedIds = multiSelectedIds.filter((id) => data.nodes.some((n) => n.id === id));

  const handleGroupSelected = async () => {
    setGroupError(null);
    try {
      await groupsApi.create(mapId, { nodeIds: groupableSelectedIds });
      setMultiSelectedIds([]);
      onChanged();
    } catch (err) {
      setGroupError(err instanceof ApiError ? err.message : 'Failed to group selected nodes');
    }
  };

  const handleAddNode = async () => {
    if (!newNodeName.trim()) {
      setAddNodeError('Enter a node name.');
      return;
    }
    try {
      // Place at the current viewport center (with light jitter so repeated
      // adds don't stack exactly) so the new node is always visible right
      // away - the array-index grid fallback in graphAdapter.ts otherwise
      // lands off-screen once the map has been dragged into a real layout.
      const center = getCurrentViewportCenter();
      const jitter = () => Math.random() * 80 - 40;
      const newNode = await nodesApi.create(mapId, {
        categoryId: newNodeCategoryId || null,
        name: newNodeName.trim(),
        posX: center ? center.x + jitter() : undefined,
        posY: center ? center.y + jitter() : undefined
      });
      setNewNodeName('');
      setShowAddNode(false);
      setAddNodeError(null);
      onChanged();
      // The popover sits by the bottom-left icon-bar, but the node lands at
      // viewport center to guarantee it's visible - selecting it immediately
      // (opens the detail panel + selection ring) makes that jump obvious
      // instead of reading as "did this even save?".
      onNodeClick(newNode.id);
    } catch (err) {
      setAddNodeError(err instanceof ApiError ? err.message : 'Failed to add node');
    }
  };

  // Dimming is a pure render-time concern - computed fresh from the matched-id set
  // rather than stored in state, so it never fights with drag/position updates.
  // matchedIds only ever contains entity node ids (filterGraph works off
  // data.nodes) - a group box's own visibility instead follows whether any of
  // its members matched, so selecting a group (or a member matching a search/
  // tag) lights up the box around them instead of always dimming it.
  const styledNodes = filterActive
    ? nodes.map((n) => {
        const visible =
          n.type === 'group'
            ? data.nodes.some((dn) => dn.groupId === n.id && matchedIds.has(dn.id))
            : matchedIds.has(n.id);
        return { ...n, style: { ...n.style, opacity: visible ? 1 : DIMMED_OPACITY } };
      })
    : nodes;
  const styledEdges = filterActive
    ? edges.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: matchedIds.has(e.source) && matchedIds.has(e.target) ? 1 : DIMMED_OPACITY
        }
      }))
    : edges;

  return (
    <ReactFlowProvider>
      <NodeInteractionContext.Provider
        value={{
          categories: data.categories,
          onQuickAdd: handleQuickAdd,
          canEdit,
          isOwner,
          taskManagementEnabled,
          taskStatuses: data.taskStatuses,
          members
        }}
      >
        <div className="graph-panel">
          <ViewportCenterRegistrar />
          {canEdit && groupableSelectedIds.length >= 2 && (
            <div className="canvas-toast canvas-toast-action">
              <button className="action-btn" onClick={handleGroupSelected}>
                ⛶ Group {groupableSelectedIds.length} nodes
              </button>
            </div>
          )}
          {groupError && (
            <div className="canvas-toast error-text" onClick={() => setGroupError(null)}>
              {groupError}
            </div>
          )}
          <ReactFlow
            nodes={styledNodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onNodeClick={(event, node) => {
              // A Ctrl/Cmd+click is a multi-select toggle, not "open this node's
              // detail panel" - if it also fired the single-select callback,
              // the effect below (which forces every OTHER node's `selected`
              // flag to false to match the single selectedNodeId) would wipe
              // out React Flow's own multi-selection the instant a 2nd node
              // was clicked, which is exactly the "blink and disappear" bug.
              if (event.ctrlKey || event.metaKey) return;
              onNodeClick(node.id);
            }}
            onEdgeClick={(_, edge) => handleEdgeClick(edge)}
            onPaneClick={onBackgroundClick}
            onSelectionChange={handleSelectionChange}
            // Plain click-drag pans by default (as it always did); holding
            // Space switches a drag into a selection box instead - Space
            // replaces Shift here since Shift-drag was flaky/error-prone, and
            // this keeps plain drag/scroll free for panning on trackpads
            // where there's no separate right/middle-click drag. Two-finger
            // scroll also pans directly. Ctrl+click still toggles individual
            // nodes (React Flow's default on Windows).
            selectionKeyCode="Space"
            panActivationKeyCode={null}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            fitView
          >
            <Background />
            <Controls>
              {/* .react-flow__controls is a flex column - these get a negative
                  `order` (see index.css) so they appear ABOVE React Flow's
                  built-in zoom/fit/lock buttons without needing to reimplement
                  those buttons ourselves. */}
              {canEdit && (
                <>
                  <ControlButton
                    className="canvas-tool-btn"
                    onClick={() => (showAddNode ? closeAddNode() : setShowAddNode(true))}
                    title="Add Node"
                  >
                    🔷
                  </ControlButton>
                  <ControlButton className="canvas-tool-btn" onClick={onOpenCategories} title="Categories">
                    🗂
                  </ControlButton>
                  <ControlButton className="canvas-tool-btn" onClick={onOpenRelationTypes} title="Relation Types">
                    🔗
                  </ControlButton>
                  <ControlButton className="canvas-tool-btn" onClick={onOpenTags} title="Tags">
                    🏷
                  </ControlButton>
                  {taskManagementEnabled && (
                    <ControlButton className="canvas-tool-btn" onClick={onOpenTaskStatuses} title="Task Statuses">
                      ✅
                    </ControlButton>
                  )}
                </>
              )}
              {isOwner && (
                <ControlButton className="canvas-tool-btn" onClick={onOpenActivity} title="Activity">
                  📜
                </ControlButton>
              )}
              {taskManagementEnabled && (
                <ControlButton className="canvas-tool-btn" onClick={onOpenProgress} title="Progress">
                  📊
                </ControlButton>
              )}
              {onViewTaskList && (
                <ControlButton className="canvas-tool-btn" onClick={onViewTaskList} title="Task List">
                  📋
                </ControlButton>
              )}
            </Controls>
            <MiniMap pannable zoomable />
          </ReactFlow>

          {showAddNode && canEdit && (
            <div className="canvas-add-node-popover" ref={addNodePopoverRef}>
              <input
                autoFocus
                placeholder="Node name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNode()}
              />
              <select value={newNodeCategoryId} onChange={(e) => setNewNodeCategoryId(e.target.value)}>
                <option value="">No category</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <div className="canvas-add-node-actions">
                <button className="action-btn" onClick={handleAddNode}>
                  Save
                </button>
                <button className="action-btn" onClick={closeAddNode}>
                  Cancel
                </button>
              </div>
              {addNodeError && <p className="error-text">{addNodeError}</p>}
            </div>
          )}

          {pendingConnection && (
            <div className="modal-overlay" onClick={() => setPendingConnection(null)}>
              <div className="modal" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Connect nodes</h2>
                  <button className="icon-btn" onClick={() => setPendingConnection(null)}>
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  {data.relationTypes.length === 0 ? (
                    <p className="hint-text">
                      Create a relation type first (Relation Types in the toolbar), then draw the
                      connection again.
                    </p>
                  ) : (
                    <>
                      <div className="property">
                        <label>Relation type</label>
                        <select
                          value={pendingRelationTypeId}
                          onChange={(e) => setPendingRelationTypeId(e.target.value)}
                        >
                          {data.relationTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="action-btn" onClick={confirmConnection}>
                        Create connection
                      </button>
                    </>
                  )}
                  {connectError && <p className="error-text">{connectError}</p>}
                </div>
              </div>
            </div>
          )}

          {selectedEdge && (
            <div className="modal-overlay" onClick={() => setSelectedEdge(null)}>
              <div className="modal" style={{ width: 340 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Edit connection</h2>
                  <button className="icon-btn" onClick={() => setSelectedEdge(null)}>
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div className="property">
                    <label>Label</label>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className="property">
                    <label>Color</label>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="property">
                    <label>Shape</label>
                    <select
                      value={editLineStyle}
                      onChange={(e) => setEditLineStyle(e.target.value as (typeof LINE_STYLES)[number])}
                      disabled={!canEdit}
                    >
                      {LINE_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="property">
                    <label>Width</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      step={0.5}
                      value={editWidth}
                      onChange={(e) => setEditWidth(Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  </div>
                  {editError && <p className="error-text">{editError}</p>}
                  {canEdit && (
                    <div className="actions">
                      <button className="action-btn" onClick={confirmEditEdge}>
                        Save
                      </button>
                      <button className="action-btn danger" onClick={confirmDeleteEdge}>
                        🗑 Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </NodeInteractionContext.Provider>
    </ReactFlowProvider>
  );
}
