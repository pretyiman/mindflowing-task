import { useState } from 'react';
import type { MindMap } from '../../types/graph';
import { ApiError } from '../../api/client';

const CAPTURE_CONFIRM_MS = 2000;

interface Props {
  maps: MindMap[];
  currentMapId: string | null;
  // Which of the two map-less home pages is active - only meaningful when
  // currentMapId is null, but always passed so the sidebar can highlight the
  // right nav item without needing App.tsx to null it out on every project
  // open (homeView is preserved across an open-project round trip, so
  // clicking Back returns to whichever of Today/Projects you were on).
  homeView: 'projects' | 'today' | 'calendar' | 'review';
  onOpenHome: () => void;
  onOpenToday: () => void;
  onOpenCalendar: () => void;
  onOpenReview: () => void;
  onOpenMap: (mapId: string) => void;
  onOpenTeams: () => void;
  onOpenSettings: () => void;
  onCreateMap: (name: string) => Promise<void>;
  onQuickCapture: (name: string) => Promise<void>;
}

// Persistent left nav for Task Manager app mode, styled after tududi's
// sidebar (screenshot referenced in conversation) - a fixed-width rail with
// an icon-forward nav list and an uppercase "PROJECTS" section listing the
// user's actual projects, rather than tududi's own Inbox/Today/Upcoming/
// Notes/Areas/Tags (concepts this app doesn't have) - the ask was to copy
// the *style*, populated with the features this app actually has. Persists
// across both the project-list home and an open project (see App.tsx),
// matching tududi's own sidebar staying put across its Today/Upcoming/
// Project views. AccountBadge (avatar/notifications/theme) deliberately
// stays exactly where it already was (fixed top-right) rather than moving
// in here - that's also where tududi keeps its own avatar/bell, separate
// from the sidebar.
export default function TaskManagerSidebar({
  maps,
  currentMapId,
  homeView,
  onOpenHome,
  onOpenToday,
  onOpenCalendar,
  onOpenReview,
  onOpenMap,
  onOpenTeams,
  onOpenSettings,
  onCreateMap,
  onQuickCapture
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [captureText, setCaptureText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const projects = maps.filter((m) => m.taskManagementEnabled);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await onCreateMap(newName.trim());
      setNewName('');
      setCreating(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project');
    }
  };

  const handleCapture = async () => {
    const name = captureText.trim();
    if (!name || capturing) return;
    setCapturing(true);
    try {
      await onQuickCapture(name);
      setCaptureText('');
      setCaptureError(null);
      setCaptured(true);
      setTimeout(() => setCaptured(false), CAPTURE_CONFIRM_MS);
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : 'Failed to capture');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-brand">
        <span className="tm-sidebar-logo">🧭</span> Mindflow
      </div>

      <div className="tm-sidebar-capture">
        <input
          placeholder="Quick capture... (Enter)"
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
          disabled={capturing}
          title="Dump a task here from anywhere - it lands in your Inbox project to triage later"
        />
        {captured && <span className="tm-sidebar-capture-confirm">Added to Inbox ✓</span>}
        {captureError && <span className="error-text tm-sidebar-capture-error">{captureError}</span>}
      </div>

      <nav>
        <button
          type="button"
          className={`tm-sidebar-nav-item${!currentMapId && homeView === 'today' ? ' tm-sidebar-nav-item-active' : ''}`}
          onClick={onOpenToday}
        >
          📅 Today
        </button>
        <button
          type="button"
          className={`tm-sidebar-nav-item${!currentMapId && homeView === 'calendar' ? ' tm-sidebar-nav-item-active' : ''}`}
          onClick={onOpenCalendar}
        >
          📆 Calendar
        </button>
        <button
          type="button"
          className={`tm-sidebar-nav-item${!currentMapId && homeView === 'review' ? ' tm-sidebar-nav-item-active' : ''}`}
          onClick={onOpenReview}
        >
          🧹 Review
        </button>
        <button
          type="button"
          className={`tm-sidebar-nav-item${!currentMapId && homeView === 'projects' ? ' tm-sidebar-nav-item-active' : ''}`}
          onClick={onOpenHome}
        >
          🏠 Projects
        </button>
      </nav>

      <div className="tm-sidebar-section">
        <div className="tm-sidebar-section-header">
          <span>Projects</span>
          <button type="button" onClick={() => setCreating((v) => !v)} title="New project">
            +
          </button>
        </div>

        {creating && (
          <div className="tm-sidebar-new-project-form">
            <input
              autoFocus
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button type="button" className="action-btn" onClick={handleCreate}>
              Create
            </button>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}

        {projects.length === 0 ? (
          <p className="tm-sidebar-empty">No projects yet</p>
        ) : (
          <div className="tm-sidebar-project-list">
            {projects.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`tm-sidebar-nav-item${currentMapId === m.id ? ' tm-sidebar-nav-item-active' : ''}`}
                onClick={() => onOpenMap(m.id)}
                title={m.name}
              >
                {m.workspaceType === 'TASKS' ? '✅' : '🗺️'} {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tm-sidebar-section">
        <div className="tm-sidebar-section-header">
          <span>Teams</span>
        </div>
        <button type="button" className="tm-sidebar-nav-item" onClick={onOpenTeams}>
          👥 Manage Teams
        </button>
      </div>

      <div className="tm-sidebar-footer">
        <span>Mindflow Task Manager</span>
        <button type="button" className="tm-sidebar-settings-btn" onClick={onOpenSettings} title="Account Settings">
          ⚙️
        </button>
      </div>
    </aside>
  );
}
