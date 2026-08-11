import { useEffect, useState } from 'react';
import type { MapMember } from '../types/graph';
import { mapsApi } from '../api/maps.api';

// Extracted from what used to be three separate copies of this exact fetch
// (GraphCanvas, FilterPanel, TaskListView) - now a fourth consumer
// (Toolbar's query-operator search, for `assignee:`) made the duplication
// worth collapsing. Plain useState/useEffect, not React Query - matches
// what all the original call sites already did, not a wholesale fetching-
// strategy change.
export function useMapMembers(mapId: string, enabled = true): MapMember[] {
  const [members, setMembers] = useState<MapMember[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMembers([]);
      return;
    }
    mapsApi.members(mapId).then(setMembers);
  }, [mapId, enabled]);

  return members;
}
