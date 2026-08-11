import type { MindMap } from '../../types/graph';
import ProjectsDashboard from './ProjectsDashboard';

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
}

// Task Manager app-mode home: a project list, each card a clickable
// entry point into that project's own task list (via onOpenMap - App.tsx
// forces the task view for every project, so opening one always lands on
// "list of tasks", never the detail page directly). Deliberately just a
// project picker, not also a flattened cross-project task table - drilling
// into a project is what shows its tasks; see ProjectsDashboard for the
// per-row stats. Project creation and Manage Teams live in
// TaskManagerSidebar now, not here - matches tududi's own minimal top
// header (just a title), all navigation/creation actions in the sidebar.
// Uses the same full-width .tm-page wrapper TodayView does, not .maps-page's
// centered ~760px column - a list of dashboard rows needs the room.
export default function TaskManagerHome({ maps, onOpenMap }: Props) {
  const taskMaps = maps.filter((m) => m.taskManagementEnabled);

  return (
    <div className="tm-page">
      <div className="maps-page-header">
        <h1>Projects</h1>
      </div>

      {taskMaps.length === 0 ? (
        <p className="hint-text maps-empty">No projects yet - create one from the sidebar.</p>
      ) : (
        <ProjectsDashboard maps={maps} onOpenMap={onOpenMap} />
      )}
    </div>
  );
}
