import { useState } from 'react';
import type { GraphData } from '../../types/graph';
import { useGraphStore } from '../../state/graphStore';
import { isFilterActive, filterGraph } from '../graph/filterGraph';
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

  const {
    searchQuery,
    setSearchQuery,
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
  // Search box covers name/tags/properties on its own - the advanced popover
  // is only "active" for the dimensions that still live there.
  const advancedActive =
    selectedTagIds.length > 0 ||
    selectedGroupId !== null ||
    connectedToNodeId !== null ||
    selectedAssigneeId !== null ||
    selectedTaskStatusId !== null ||
    selectedPriority !== null;
  const matchCount = graph && filterActive ? filterGraph(graph, filterState).size : null;

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
              placeholder="Search nodes, tags, properties…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
