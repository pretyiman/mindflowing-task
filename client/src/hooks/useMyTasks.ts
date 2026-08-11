import { useQueries } from '@tanstack/react-query';
import type { GraphNode, MindMap } from '../types/graph';
import { mapsApi } from '../api/maps.api';
import { graphQueryKey } from './useGraphData';
import { useAuthStore } from '../state/authStore';

export type MyTask = GraphNode & {
  mapName: string;
  statusColor: string | null;
  statusName: string | null;
  statusKind: string | null;
};

// Cross-project "my tasks" - every task assigned to the current user across
// every task-enabled project they have access to. Shared by TodayView and
// CalendarView (both personal-agenda surfaces, unlike TaskManagerHome's
// project-scoped "All Tasks" default), and reuses the exact same per-map
// graph fetch (and cache key) TaskListView/ProjectsDashboard already use, so
// opening a project from either view doesn't refetch.
export function useMyTasks(maps: MindMap[]) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const projects = maps.filter((m) => m.taskManagementEnabled);

  const graphQueries = useQueries({
    queries: projects.map((m) => ({ queryKey: graphQueryKey(m.id), queryFn: () => mapsApi.graph(m.id) }))
  });
  const isLoading = graphQueries.some((q) => q.isLoading);

  const myTasks: MyTask[] = [];
  projects.forEach((project, i) => {
    const graph = graphQueries[i].data;
    if (!graph || currentUserId == null) return;
    const statusById = new Map(graph.taskStatuses.map((s) => [s.id, s]));
    for (const n of graph.nodes) {
      if (!n.isTask || !n.assigneeIds.includes(currentUserId)) continue;
      const status = n.taskStatusId ? statusById.get(n.taskStatusId) : undefined;
      myTasks.push({
        ...n,
        mapName: project.name,
        statusColor: status?.color ?? null,
        statusName: status?.name ?? null,
        statusKind: status?.kind ?? null
      });
    }
  });

  return { myTasks, isLoading };
}
