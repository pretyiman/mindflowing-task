import { useState } from 'react';
import type { GraphData } from '../../types/graph';
import { useGraphStore } from '../../state/graphStore';
import { useAuthStore } from '../../state/authStore';
import { useMapMembers } from '../../hooks/useMapMembers';
import { filterGraph, isFilterActive, type DueFilterValue } from '../graph/filterGraph';

interface Props {
  mapId: string;
  graph: GraphData;
  taskManagementEnabled: boolean;
  // false for a Project workspace (or the task-only worker view) - there's
  // no canvas there, so "connected to" tracing has nothing meaningful to
  // trace through. Group is unaffected: it already hides itself whenever
  // graph.groups is empty, which is always true in those same contexts.
  showGraphFilters?: boolean;
}

export default function FilterPanel({ mapId, graph, taskManagementEnabled, showGraphFilters = true }: Props) {
  const {
    searchQuery,
    selectedTagIds,
    toggleFilterTag,
    selectedGroupId,
    setSelectedGroupId,
    connectedToNodeId,
    setConnectedToNodeId,
    selectedAssigneeId,
    setSelectedAssigneeId,
    selectedTaskStatusId,
    setSelectedTaskStatusId,
    selectedPriority,
    setSelectedPriority,
    selectedDueFilter,
    setSelectedDueFilter,
    clearFilters
  } = useGraphStore();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [showTagPicker, setShowTagPicker] = useState(false);
  const members = useMapMembers(mapId, taskManagementEnabled);

  const filterState = {
    searchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    selectedTaskStatusId,
    selectedPriority,
    selectedDueFilter
  };
  const active = isFilterActive(filterState);
  const matchCount = active ? filterGraph(graph, filterState).size : graph.nodes.length;
  const selectedTags = graph.tags.filter((t) => selectedTagIds.includes(t.id));
  const connectableNodes = graph.nodes;
  const isMyTasksActive = currentUserId !== undefined && selectedAssigneeId === currentUserId;

  if (
    graph.tags.length === 0 &&
    graph.groups.length === 0 &&
    graph.nodes.length === 0 &&
    !taskManagementEnabled
  )
    return null;

  return (
    <div className="filter-popover" onClick={(e) => e.stopPropagation()}>
      <p className="hint-text" style={{ margin: 0, width: '100%' }}>
        {showGraphFilters
          ? 'Narrow the search box further, or trace connections from a specific node.'
          : 'Narrow the search box further.'}
      </p>

      {graph.tags.length > 0 && (
        <div className="filter-tag-control">
          <button className="action-btn" onClick={() => setShowTagPicker((v) => !v)}>
            🏷 Tags{selectedTagIds.length > 0 ? ` (${selectedTagIds.length})` : ''}
          </button>
          {/* Selected tags always show as removable chips even when the picker is
              collapsed, so an active filter stays visible without listing every tag. */}
          {selectedTags.length > 0 && (
            <div className="tag-chip-list">
              {selectedTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tag-chip tag-chip-active"
                  style={{ background: t.color, borderColor: t.color }}
                  onClick={() => toggleFilterTag(t.id)}
                  title="Click to remove from filter"
                >
                  {t.name} ✕
                </button>
              ))}
            </div>
          )}
          {showTagPicker && (
            <div className="filter-tag-popover">
              <div className="tag-chip-list">
                {graph.tags.map((t) => {
                  const isSelected = selectedTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tag-chip${isSelected ? ' tag-chip-active' : ''}`}
                      style={
                        isSelected ? { background: t.color, borderColor: t.color } : { borderColor: t.color }
                      }
                      onClick={() => toggleFilterTag(t.id)}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {graph.groups.length > 0 && (
        <select value={selectedGroupId ?? ''} onChange={(e) => setSelectedGroupId(e.target.value || null)}>
          <option value="">Group...</option>
          {graph.groups.map((g) => {
            const memberCount = graph.nodes.filter((n) => n.groupId === g.id).length;
            const label = g.name.trim() || `Unnamed group`;
            return (
              <option key={g.id} value={g.id}>
                {label} ({memberCount})
              </option>
            );
          })}
        </select>
      )}

      {showGraphFilters && connectableNodes.length > 0 && (
        <select value={connectedToNodeId ?? ''} onChange={(e) => setConnectedToNodeId(e.target.value || null)}>
          <option value="">Connected to...</option>
          {connectableNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}

      {taskManagementEnabled && (
        <>
          {currentUserId !== undefined && (
            <button
              className={`action-btn${isMyTasksActive ? ' icon-tool-btn-active' : ''}`}
              onClick={() => setSelectedAssigneeId(isMyTasksActive ? null : currentUserId)}
            >
              🙋 My Tasks
            </button>
          )}

          {members.length > 0 && (
            <select value={selectedAssigneeId ?? ''} onChange={(e) => setSelectedAssigneeId(e.target.value || null)}>
              <option value="">Assignee...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          )}

          {graph.taskStatuses.length > 0 && (
            <select
              value={selectedTaskStatusId ?? ''}
              onChange={(e) => setSelectedTaskStatusId(e.target.value || null)}
            >
              <option value="">Status...</option>
              {graph.taskStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedPriority ?? ''}
            onChange={(e) => setSelectedPriority((e.target.value as typeof selectedPriority) || null)}
          >
            <option value="">Priority...</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          <select
            value={selectedDueFilter ?? ''}
            onChange={(e) => setSelectedDueFilter((e.target.value as DueFilterValue) || null)}
          >
            <option value="">Due...</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Due this week</option>
            <option value="none">No due date</option>
          </select>
        </>
      )}

      {active && (
        <button className="action-btn" onClick={clearFilters}>
          Clear filters
        </button>
      )}

      <span className="filter-panel-count">
        {matchCount} of {graph.nodes.length} match
      </span>
    </div>
  );
}
