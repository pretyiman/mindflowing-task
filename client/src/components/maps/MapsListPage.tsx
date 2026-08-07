import { useState } from 'react';
import type { MindMap, MapRole, WorkspaceType } from '../../types/graph';
import { ApiError } from '../../api/client';

interface Props {
  maps: MindMap[];
  onOpenMap: (mapId: string) => void;
  onCreateMap: (name: string, workspaceType: WorkspaceType) => Promise<void>;
  onDeleteMap: (mapId: string) => Promise<void>;
  onShareMap: (mapId: string) => void;
  // Off in Mindflow app mode - a mode with task UI fully hidden has nothing
  // to do with a Project map (zero canvas), so the picker is dropped
  // entirely and every new map is a Mind Map.
  allowTaskBoards?: boolean;
}

const WORKSPACE_TYPE_ICON: Record<WorkspaceType, string> = { GRAPH: '🗺️', TASKS: '✅' };

const ROLE_LABEL: Record<MapRole, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  VIEWER: 'Viewer'
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MapsListPage({
  maps,
  onOpenMap,
  onCreateMap,
  onDeleteMap,
  onShareMap,
  allowTaskBoards = true
}: Props) {
  const [showNewMap, setShowNewMap] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [newMapType, setNewMapType] = useState<WorkspaceType>('GRAPH');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newMapName.trim()) return;
    try {
      await onCreateMap(newMapName.trim(), allowTaskBoards ? newMapType : 'GRAPH');
      setNewMapName('');
      setNewMapType('GRAPH');
      setShowNewMap(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create map');
    }
  };

  const handleDelete = async (mapId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await onDeleteMap(mapId);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete map');
    }
  };

  return (
    <div className="maps-page">
      <div className="maps-page-header">
        <h1>Your Maps</h1>
        <div className="inline-form">
          {showNewMap && (
            <>
              {allowTaskBoards && (
                <div className="tag-chip-list">
                  <button
                    type="button"
                    className={`tag-chip${newMapType === 'GRAPH' ? ' tag-chip-active' : ''}`}
                    onClick={() => setNewMapType('GRAPH')}
                    title="A graph/mind-map you can also assign tasks on"
                  >
                    🗺️ Mind Map
                  </button>
                  <button
                    type="button"
                    className={`tag-chip${newMapType === 'TASKS' ? ' tag-chip-active' : ''}`}
                    onClick={() => setNewMapType('TASKS')}
                    title="A focused task list/board - no canvas, no graph vocabulary"
                  >
                    ✅ Project
                  </button>
                </div>
              )}
              <input
                autoFocus
                placeholder={allowTaskBoards && newMapType === 'TASKS' ? 'Project name' : 'Map name'}
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </>
          )}
          <button
            className="action-btn primary"
            onClick={() => (showNewMap ? handleCreate() : setShowNewMap(true))}
          >
            + New Map
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {maps.length === 0 ? (
        <p className="hint-text maps-empty">No maps yet - create your first one above.</p>
      ) : (
        <div className="maps-list">
          {maps.map((m) => (
            <div key={m.id} className="map-row" onClick={() => onOpenMap(m.id)}>
              <div className="map-row-main">
                <span className="map-row-icon">{WORKSPACE_TYPE_ICON[m.workspaceType]}</span>
                <div>
                  <div className="map-row-name">{m.name}</div>
                  <div className="map-row-meta">Updated {formatDate(m.updatedAt)}</div>
                </div>
              </div>
              <div className="map-row-end" onClick={(e) => e.stopPropagation()}>
                <span className={`map-role-badge map-role-${m.myRole.toLowerCase()}`}>
                  {ROLE_LABEL[m.myRole]}
                </span>
                {m.myRole === 'OWNER' && (
                <div className="row-menu">
                  <button
                    className="icon-btn"
                    onClick={() => setOpenMenuId((id) => (id === m.id ? null : m.id))}
                    title="More actions"
                  >
                    ⋮
                  </button>
                  {openMenuId === m.id && (
                    <>
                      <div className="row-menu-scrim" onClick={() => setOpenMenuId(null)} />
                      <div className="row-menu-popover">
                        {m.myRole === 'OWNER' && (
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onShareMap(m.id);
                            }}
                          >
                            👥 Share
                          </button>
                        )}
                        {m.myRole === 'OWNER' && (
                          <button
                            className="danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              handleDelete(m.id, m.name);
                            }}
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
