import { useState } from 'react';
import type { MindMap, WorkspaceType } from '../../types/graph';
import { ApiError } from '../../api/client';
import ProjectsDashboard from './ProjectsDashboard';

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
  onCreateMap: (name: string, workspaceType: WorkspaceType) => Promise<void>;
  onOpenTeams: () => void;
}

// Task Manager app-mode home: a project list, each card a clickable
// entry point into that project's own task list (via onOpenMap - App.tsx
// forces the task view for every project, so opening one always lands on
// "list of tasks", never the detail page directly). Deliberately just a
// project picker, not also a flattened cross-project task table - drilling
// into a project is what shows its tasks; see ProjectsDashboard for the
// per-card stats.
export default function TaskManagerHome({ maps, onOpenMap, onCreateMap, onOpenTeams }: Props) {
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const taskMaps = maps.filter((m) => m.taskManagementEnabled);

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      await onCreateMap(newBoardName.trim(), 'TASKS');
      setNewBoardName('');
      setShowNewBoard(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    }
  };

  return (
    <div className="maps-page">
      <div className="maps-page-header">
        <h1>Projects</h1>
        <div className="inline-form">
          <button className="action-btn" onClick={onOpenTeams} title="Create a reusable team, or manage existing ones">
            👥 Manage Teams
          </button>
          {showNewBoard && (
            <input
              autoFocus
              placeholder="Project name"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
            />
          )}
          <button
            className="action-btn primary"
            onClick={() => (showNewBoard ? handleCreateBoard() : setShowNewBoard(true))}
          >
            + New Project
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {taskMaps.length === 0 ? (
        <p className="hint-text maps-empty">No projects yet - create your first one above.</p>
      ) : (
        <ProjectsDashboard maps={maps} onOpenMap={onOpenMap} />
      )}
    </div>
  );
}
