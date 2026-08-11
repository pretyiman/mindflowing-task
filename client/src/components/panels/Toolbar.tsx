import { useState, type KeyboardEvent } from 'react';
import type { GraphData } from '../../types/graph';
import { useGraphStore } from '../../state/graphStore';
import { useMapMembers } from '../../hooks/useMapMembers';
import { isFilterActive, filterGraph } from '../graph/filterGraph';
import { parseSearchQuery } from '../../utils/searchQuery';
import FilterPanel from './FilterPanel';

interface Props {
  mapId: string;
  mapName: string;
  onBack: () => void;
  graph: GraphData | null;
  taskManagementEnabled: boolean;
  onOpenMapSettings: () => void;
  isOwner: boolean;
  onOpenShare: () => void;
  showGraphFilters?: boolean;
}

export default function Toolbar({
  mapId,
  mapName,
  onBack,
  graph,
  taskManagementEnabled,
  onOpenMapSettings,
  isOwner,
  onOpenShare,
  showGraphFilters = true
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const members = useMapMembers(mapId, taskManagementEnabled);

  const {
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    selectedGroupId,
    connectedToNodeId,
    selectedAssigneeId,
    setSelectedAssigneeId,
    selectedTaskStatusId,
    setSelectedTaskStatusId,
    selectedPriority,
    setSelectedPriority,
    selectedDueFilter,
    setSelectedDueFilter
  } = useGraphStore();
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
  const filterActive = isFilterActive(filterState);
  // Search box covers name/tags/properties on its own - the advanced popover
  // is only "active" for the dimensions that still live there.
  const advancedActive =
    selectedTagIds.length > 0 ||
    selectedGroupId !== null ||
    connectedToNodeId !== null ||
    selectedAssigneeId !== null ||
    selectedTaskStatusId !== null ||
    selectedPriority !== null ||
    selectedDueFilter !== null;
  const matchCount = graph && filterActive ? filterGraph(graph, filterState).size : null;

  // Query-operator search (priority:/due:/status:/assignee:) - resolved on
  // Enter, not on every keystroke, so the box shows exactly what you type
  // while typing and only "commits" into filters + remaining free text once
  // you're done. Not a new filtering capability - see searchQuery.ts - just
  // a faster way to set the same dropdowns FilterPanel already exposes.
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !graph) return;
    const { freeText, operators } = parseSearchQuery(searchQuery, graph.taskStatuses, members);
    if (Object.keys(operators).length === 0) return;
    setSearchQuery(freeText);
    if (operators.priority !== undefined) setSelectedPriority(operators.priority);
    if (operators.dueFilter !== undefined) setSelectedDueFilter(operators.dueFilter);
    if (operators.taskStatusId !== undefined) setSelectedTaskStatusId(operators.taskStatusId);
    if (operators.assigneeId !== undefined) setSelectedAssigneeId(operators.assigneeId);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="back-btn" onClick={onBack} title="Back to your maps">
          ← Maps
        </button>
        <h1 className="board-title">{mapName}</h1>
        {isOwner && (
          <button className="icon-btn" onClick={onOpenShare} title="Share / invite people">
            👥
          </button>
        )}
        <button className="icon-btn" onClick={onOpenMapSettings} title="Map Settings">
          ⚙️
        </button>
      </div>

      {graph && (
        <div className="toolbar-group search-group">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search, or try priority:high due:today assignee:name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button className="icon-btn search-clear" onClick={() => setSearchQuery('')} title="Clear search">
                ✕
              </button>
            )}
            {filterActive && matchCount !== null && (
              <span className="search-count">
                {matchCount}/{graph.nodes.length}
              </span>
            )}
          </div>

          <div className="filter-trigger-wrap">
            <button
              className={`icon-tool-btn${advancedActive ? ' icon-tool-btn-active' : ''}`}
              onClick={() => setShowAdvanced((v) => !v)}
              title="More filters: tags, groups, connections"
            >
              🎚️
              {advancedActive && <span className="icon-tool-dot" />}
            </button>
            {showAdvanced && (
              <>
                <div className="row-menu-scrim" onClick={() => setShowAdvanced(false)} />
                <FilterPanel
                  mapId={mapId}
                  graph={graph}
                  taskManagementEnabled={taskManagementEnabled}
                  showGraphFilters={showGraphFilters}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
