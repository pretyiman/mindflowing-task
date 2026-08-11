import { create } from 'zustand';
import type { TaskPriority } from '../types/graph';
import type { DueFilterValue } from '../components/graph/filterGraph';

interface FilterState {
  searchQuery: string;
  selectedTagIds: string[];
  selectedGroupId: string | null;
  connectedToNodeId: string | null;
  selectedAssigneeId: string | null;
  selectedTaskStatusId: string | null;
  selectedPriority: TaskPriority | null;
  selectedDueFilter: DueFilterValue | null;
}

const emptyFilterState: FilterState = {
  searchQuery: '',
  selectedTagIds: [],
  selectedGroupId: null,
  connectedToNodeId: null,
  selectedAssigneeId: null,
  selectedTaskStatusId: null,
  selectedPriority: null,
  selectedDueFilter: null
};

interface GraphUiState extends FilterState {
  currentMapId: string | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isManageCategoriesOpen: boolean;
  isManageRelationTypesOpen: boolean;
  isManageTagsOpen: boolean;
  isManageTaskStatusesOpen: boolean;
  isActivityOpen: boolean;
  isProgressOpen: boolean;
  isMapSettingsOpen: boolean;
  isAccountSettingsOpen: boolean;
  isManageTeamsOpen: boolean;
  // The map a Share modal is open for - set from either the maps list page's
  // row menu or (when open) the current board, independent of currentMapId.
  shareModalMapId: string | null;
  // Session-local view toggle for a GRAPH map with task management on -
  // null means "use the role-based default" (owner -> canvas, non-owner ->
  // My Tasks); explicitly set once someone uses the in-app toggle to switch
  // for the rest of this visit. Reset whenever the current map changes (see
  // setCurrentMapId below), so it's never "sticky" across maps or reloads.
  viewOverride: 'canvas' | 'tasks' | null;

  setCurrentMapId: (mapId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  setManageCategoriesOpen: (open: boolean) => void;
  setManageRelationTypesOpen: (open: boolean) => void;
  setManageTagsOpen: (open: boolean) => void;
  setManageTaskStatusesOpen: (open: boolean) => void;
  setActivityOpen: (open: boolean) => void;
  setProgressOpen: (open: boolean) => void;
  setMapSettingsOpen: (open: boolean) => void;
  setAccountSettingsOpen: (open: boolean) => void;
  setManageTeamsOpen: (open: boolean) => void;
  setShareModalMapId: (mapId: string | null) => void;
  setViewOverride: (override: 'canvas' | 'tasks' | null) => void;

  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tagId: string) => void;
  setSelectedGroupId: (groupId: string | null) => void;
  setConnectedToNodeId: (nodeId: string | null) => void;
  setSelectedAssigneeId: (userId: string | null) => void;
  setSelectedTaskStatusId: (statusId: string | null) => void;
  setSelectedPriority: (priority: TaskPriority | null) => void;
  setSelectedDueFilter: (due: DueFilterValue | null) => void;
  clearFilters: () => void;
}

export const useGraphStore = create<GraphUiState>((set) => ({
  currentMapId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  isManageCategoriesOpen: false,
  isManageRelationTypesOpen: false,
  isManageTagsOpen: false,
  isManageTaskStatusesOpen: false,
  isActivityOpen: false,
  isProgressOpen: false,
  isMapSettingsOpen: false,
  isAccountSettingsOpen: false,
  isManageTeamsOpen: false,
  shareModalMapId: null,
  viewOverride: null,
  ...emptyFilterState,

  setCurrentMapId: (mapId) =>
    set({
      currentMapId: mapId,
      selectedNodeId: null,
      selectedEdgeId: null,
      viewOverride: null,
      ...emptyFilterState
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),
  setManageCategoriesOpen: (open) => set({ isManageCategoriesOpen: open }),
  setManageRelationTypesOpen: (open) => set({ isManageRelationTypesOpen: open }),
  setManageTagsOpen: (open) => set({ isManageTagsOpen: open }),
  setManageTaskStatusesOpen: (open) => set({ isManageTaskStatusesOpen: open }),
  setActivityOpen: (open) => set({ isActivityOpen: open }),
  setProgressOpen: (open) => set({ isProgressOpen: open }),
  setMapSettingsOpen: (open) => set({ isMapSettingsOpen: open }),
  setAccountSettingsOpen: (open) => set({ isAccountSettingsOpen: open }),
  setManageTeamsOpen: (open) => set({ isManageTeamsOpen: open }),
  setShareModalMapId: (mapId) => set({ shareModalMapId: mapId }),
  setViewOverride: (override) => set({ viewOverride: override }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleFilterTag: (tagId) =>
    set((state) => ({
      selectedTagIds: state.selectedTagIds.includes(tagId)
        ? state.selectedTagIds.filter((id) => id !== tagId)
        : [...state.selectedTagIds, tagId]
    })),
  setSelectedGroupId: (groupId) => set({ selectedGroupId: groupId }),
  setConnectedToNodeId: (nodeId) => set({ connectedToNodeId: nodeId }),
  setSelectedAssigneeId: (userId) => set({ selectedAssigneeId: userId }),
  setSelectedTaskStatusId: (statusId) => set({ selectedTaskStatusId: statusId }),
  setSelectedPriority: (priority) => set({ selectedPriority: priority }),
  setSelectedDueFilter: (due) => set({ selectedDueFilter: due }),
  clearFilters: () => set(emptyFilterState)
}));
