import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../common/Modal';
import { mapsApi } from '../../api/maps.api';
import { ApiError } from '../../api/client';
import type { MindMap } from '../../types/graph';

interface Props {
  map: MindMap;
  isOwner: boolean;
  onClose: () => void;
}

export default function MapSettingsModal({ map, isOwner, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['maps'] });

  const handleSaveName = async () => {
    if (!name.trim() || name === map.name) return;
    try {
      await mapsApi.update(map.id, { name });
      invalidate();
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update name');
    }
  };

  const handleSaveDescription = async () => {
    if (description === (map.description ?? '')) return;
    try {
      await mapsApi.update(map.id, { description });
      invalidate();
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update description');
    }
  };

  const handleToggleRestrictedAccess = async () => {
    try {
      await mapsApi.update(map.id, { restrictedAccessEnabled: !map.restrictedAccessEnabled });
      invalidate();
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change access mode');
    }
  };

  const handleToggleTaskManagement = async () => {
    try {
      await mapsApi.update(map.id, { taskManagementEnabled: !map.taskManagementEnabled });
      invalidate();
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change task management setting');
    }
  };

  return (
    <Modal title="Map Settings" onClose={onClose}>
      <div className="property">
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSaveName}
          disabled={!isOwner}
          title={!isOwner ? 'Only the project owner can rename it' : undefined}
        />
      </div>
      <div className="property">
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSaveDescription}
          rows={3}
          disabled={!isOwner}
          title={!isOwner ? 'Only the project owner can change the description' : undefined}
        />
      </div>
      {!isOwner && (
        <p className="hint-text" style={{ marginTop: -8, marginBottom: 16 }}>
          Only the project owner can rename it or change its description.
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={map.restrictedAccessEnabled}
          onChange={handleToggleRestrictedAccess}
          disabled={!isOwner}
        />
        <span>
          <strong>Restrict access</strong>
          <br />
          <span className="hint-text">
            {map.restrictedAccessEnabled
              ? 'Collaborators only see nodes explicitly shared with them (see Share), or granted per-node. Turn off to give everyone full visibility again.'
              : isOwner
                ? 'Off - every collaborator sees the whole map. Turn on to show each person only their own slice, then assign it in Share.'
                : 'Off - only the map owner can change this.'}
          </span>
        </span>
      </label>

      {map.workspaceType === 'GRAPH' ? (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={map.taskManagementEnabled}
            onChange={handleToggleTaskManagement}
            disabled={!isOwner}
          />
          <span>
            <strong>Enable task management</strong>
            <br />
            <span className="hint-text">
              {map.taskManagementEnabled
                ? 'Nodes can be assigned, prioritized, and moved through custom statuses.'
                : isOwner
                  ? 'Off - nodes have no task fields or badges. Turn on to assign/prioritize/status nodes.'
                  : 'Off - only the map owner can turn this on.'}
            </span>
          </span>
        </label>
      ) : (
        <p className="hint-text" style={{ marginBottom: 0 }}>
          This is a Project workspace - task management is always on.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
