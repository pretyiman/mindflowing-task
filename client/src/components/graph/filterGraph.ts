import type { GraphData, GraphNode, TaskPriority } from '../../types/graph';

export interface FilterState {
  searchQuery: string;
  selectedTagIds: string[];
  selectedGroupId: string | null;
  connectedToNodeId: string | null;
  selectedAssigneeId: string | null;
  selectedTaskStatusId: string | null;
  selectedPriority: TaskPriority | null;
}

export function isFilterActive(filter: FilterState): boolean {
  return (
    filter.searchQuery.trim() !== '' ||
    filter.selectedTagIds.length > 0 ||
    filter.selectedGroupId !== null ||
    filter.connectedToNodeId !== null ||
    filter.selectedAssigneeId !== null ||
    filter.selectedTaskStatusId !== null ||
    filter.selectedPriority !== null
  );
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((x) => b.has(x)));
}

/**
 * One search box covering everything a node can be found by: its own name,
 * any tag it carries, or any property value regardless of which key it's
 * stored under - so "Multan" finds it whether it's in `city`, `address`, or
 * anything else, without having to know or pick the field first.
 */
function nodeMatchesSearch(node: GraphNode, needle: string, tagNameById: Map<string, string>): boolean {
  if (node.name.toLowerCase().includes(needle)) return true;
  for (const tagId of node.tagIds) {
    if (tagNameById.get(tagId)?.toLowerCase().includes(needle)) return true;
  }
  for (const value of Object.values(node.properties)) {
    if (value != null && String(value).toLowerCase().includes(needle)) return true;
  }
  return false;
}

/**
 * Adjacency map for "connected to" tracing: every edge counts as a link in
 * both directions, and being in the same group counts as a link too (so
 * tracing through one half of a couple pulls in the other half's own
 * connections as well, not just their shared children).
 */
function buildNeighborMap(data: GraphData): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const edge of data.edges) {
    link(edge.sourceNodeId, edge.targetNodeId);
    link(edge.targetNodeId, edge.sourceNodeId);
  }
  const byGroup = new Map<string, string[]>();
  for (const node of data.nodes) {
    if (!node.groupId) continue;
    const list = byGroup.get(node.groupId) ?? [];
    list.push(node.id);
    byGroup.set(node.groupId, list);
  }
  for (const members of byGroup.values()) {
    for (const a of members) for (const b of members) if (a !== b) link(a, b);
  }
  return map;
}

/**
 * Pure client-side filter over the already-fetched graph - no backend query
 * language needed since the whole map is already in memory. Combines search,
 * tag, and connection filters with AND; each dimension itself is an OR
 * (e.g. matching ANY selected tag) - search matches are exact-node-only, no
 * neighbor expansion (that's what "connected to" is for).
 */
export function filterGraph(data: GraphData, filter: FilterState): Set<string> {
  const allIds = new Set(data.nodes.map((n) => n.id));
  if (!isFilterActive(filter)) return allIds;

  let matched = allIds;

  if (filter.searchQuery.trim()) {
    const needle = filter.searchQuery.trim().toLowerCase();
    const tagNameById = new Map(data.tags.map((t) => [t.id, t.name]));
    const searchMatch = new Set(
      data.nodes.filter((n) => nodeMatchesSearch(n, needle, tagNameById)).map((n) => n.id)
    );
    matched = intersect(matched, searchMatch);
  }

  if (filter.selectedTagIds.length > 0) {
    const tagMatch = new Set(
      data.nodes.filter((n) => n.tagIds.some((id) => filter.selectedTagIds.includes(id))).map((n) => n.id)
    );
    matched = intersect(matched, tagMatch);
  }

  if (filter.selectedGroupId) {
    const groupMatch = new Set(data.nodes.filter((n) => n.groupId === filter.selectedGroupId).map((n) => n.id));
    matched = intersect(matched, groupMatch);
  }

  if (filter.selectedAssigneeId) {
    const assigneeMatch = new Set(
      data.nodes.filter((n) => n.assigneeIds.includes(filter.selectedAssigneeId!)).map((n) => n.id)
    );
    matched = intersect(matched, assigneeMatch);
  }

  if (filter.selectedTaskStatusId) {
    const statusMatch = new Set(
      data.nodes.filter((n) => n.taskStatusId === filter.selectedTaskStatusId).map((n) => n.id)
    );
    matched = intersect(matched, statusMatch);
  }

  if (filter.selectedPriority) {
    const priorityMatch = new Set(data.nodes.filter((n) => n.priority === filter.selectedPriority).map((n) => n.id));
    matched = intersect(matched, priorityMatch);
  }

  if (filter.connectedToNodeId) {
    // Bounded trace: the selected node, its neighbors, and their neighbors -
    // 2 hops out in every direction (either edge direction, plus group
    // membership).
    const CONNECTION_DEPTH = 2;
    const neighborMap = buildNeighborMap(data);
    const visited = new Set<string>([filter.connectedToNodeId]);
    let frontier = [filter.connectedToNodeId];
    for (let hop = 0; hop < CONNECTION_DEPTH && frontier.length > 0; hop++) {
      const nextFrontier: string[] = [];
      for (const current of frontier) {
        for (const next of neighborMap.get(current) ?? []) {
          if (!visited.has(next)) {
            visited.add(next);
            nextFrontier.push(next);
          }
        }
      }
      frontier = nextFrontier;
    }

    matched = intersect(matched, visited);
  }

  return matched;
}
