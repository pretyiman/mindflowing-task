import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { teamsApi, type Team } from '../../api/teams.api';
import { ApiError } from '../../api/client';

interface Props {
  onClose: () => void;
}

export default function ManageTeamsModal({ onClose }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [memberEmailByTeam, setMemberEmailByTeam] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = () => teamsApi.list().then(setTeams);
  useEffect(() => {
    refresh();
  }, []);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      await teamsApi.create(newTeamName.trim());
      setNewTeamName('');
      setError(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create team');
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!window.confirm('Delete this team? Members already invited to projects keep their access.')) return;
    try {
      await teamsApi.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete team');
    }
  };

  const handleAddMember = async (teamId: string) => {
    const email = (memberEmailByTeam[teamId] ?? '').trim();
    if (!email) return;
    try {
      await teamsApi.addMember(teamId, email);
      setMemberEmailByTeam((prev) => ({ ...prev, [teamId]: '' }));
      setError(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await teamsApi.removeMember(memberId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove member');
    }
  };

  return (
    <Modal title="Manage Teams" onClose={onClose}>
      <p className="hint-text">
        A team is a saved, reusable list of people you invite together - optional, never required
        to create a project. Apply one to any project from its Share panel.
      </p>

      {teams.length === 0 ? (
        <p className="hint-text">No teams yet - create your first one below.</p>
      ) : (
        teams.map((team) => (
          <div key={team.id} className="task-group">
            <h3 className="task-group-title">
              {team.name} ({team.members.length})
              <button
                className="icon-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => handleDeleteTeam(team.id)}
                title="Delete team"
              >
                🗑
              </button>
            </h3>
            {team.members.length > 0 && (
              <table className="manage-table">
                <tbody>
                  {team.members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.email}</td>
                      <td>
                        <button className="icon-btn" onClick={() => handleRemoveMember(m.id)} title="Remove member">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="add-form">
              <input
                placeholder="Member email"
                value={memberEmailByTeam[team.id] ?? ''}
                onChange={(e) => setMemberEmailByTeam((prev) => ({ ...prev, [team.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember(team.id)}
              />
              <button className="action-btn" onClick={() => handleAddMember(team.id)}>
                + Add
              </button>
            </div>
          </div>
        ))
      )}

      <div className="add-form" style={{ marginTop: 16 }}>
        <input
          placeholder="New team name"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
        />
        <button className="action-btn primary" onClick={handleCreateTeam}>
          + Create Team
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
