import { useState } from 'react';
import Modal from '../common/Modal';
import { authApi, type AppMode } from '../../api/auth.api';
import { ApiError } from '../../api/client';
import { useAuthStore } from '../../state/authStore';

interface Props {
  onClose: () => void;
}

const APP_MODE_OPTIONS: { value: AppMode; label: string; description: string }[] = [
  {
    value: 'BOTH',
    label: 'Both',
    description: "Today's default - each map can show its canvas or its task list, toggled per map."
  },
  {
    value: 'TASK_MANAGER',
    label: 'Task Manager',
    description: 'No maps or canvas anywhere - just one combined task list across every project.'
  },
  {
    value: 'MINDFLOW',
    label: 'Mindflow',
    description: 'No task UI anywhere - pure mind-mapping, even on maps with task management on.'
  }
];

export default function AccountSettingsModal({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [appModeError, setAppModeError] = useState<string | null>(null);
  const [savingAppMode, setSavingAppMode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAppModeChange = async (appMode: AppMode) => {
    if (!user || appMode === user.appMode) return;
    setSavingAppMode(true);
    setAppModeError(null);
    try {
      const updated = await authApi.updateAppMode(appMode);
      updateUser(updated);
    } catch (err) {
      setAppModeError(err instanceof ApiError ? err.message : 'Failed to update app view');
    } finally {
      setSavingAppMode(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Account Settings" onClose={onClose}>
      <div className="property">
        <label>App View</label>
        <p className="hint-text">Which surfaces of the app you see, across every map.</p>
        <div className="tag-chip-list">
          {APP_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tag-chip${user?.appMode === opt.value ? ' tag-chip-active' : ''}`}
              disabled={savingAppMode}
              onClick={() => handleAppModeChange(opt.value)}
              title={opt.description}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="hint-text" style={{ marginTop: 4 }}>
          {APP_MODE_OPTIONS.find((opt) => opt.value === user?.appMode)?.description}
        </p>
        {appModeError && <p className="error-text">{appModeError}</p>}
      </div>

      <p className="hint-text">Change your password below.</p>

      <div className="property">
        <label>Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className="property">
        <label>New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="property">
        <label>Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">Password changed successfully.</p>}

      <div className="actions">
        <button
          className="action-btn primary"
          onClick={handleSubmit}
          disabled={submitting || !currentPassword || !newPassword}
        >
          {submitting ? 'Saving…' : 'Change Password'}
        </button>
      </div>
    </Modal>
  );
}
