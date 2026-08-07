import { Fragment, useEffect, useState } from 'react';
import Modal from '../common/Modal';
import {
  collaboratorsApi,
  type Collaborator,
  type CollaboratorRole,
  type PendingInvite
} from '../../api/collaborators.api';
import { invitesApi } from '../../api/invites.api';
import { mapsApi } from '../../api/maps.api';
import { tagsApi } from '../../api/tags.api';
import { teamsApi, type Team } from '../../api/teams.api';
import { ApiError } from '../../api/client';
import type { Tag } from '../../types/graph';

interface Props {
  mapId: string;
  onClose: () => void;
}

function inviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

export default function ShareModal({ mapId, onClose }: Props) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [restrictedAccessEnabled, setRestrictedAccessEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [applyingTeam, setApplyingTeam] = useState(false);

  const refresh = () => {
    Promise.all([collaboratorsApi.list(mapId), mapsApi.get(mapId), tagsApi.list(mapId)])
      .then(([data, map, tagList]) => {
        setCollaborators(data.collaborators);
        setPendingInvites(data.pendingInvites);
        setRestrictedAccessEnabled(map.restrictedAccessEnabled);
        setTags(tagList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load collaborators'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [mapId]);
  useEffect(() => {
    teamsApi.list().then((list) => {
      setTeams(list);
      if (list.length > 0) setSelectedTeamId(list[0].id);
    });
  }, []);

  const handleToggleScopeTag = async (collaborator: Collaborator, tagId: string) => {
    const nextTagIds = collaborator.scopeTagIds.includes(tagId)
      ? collaborator.scopeTagIds.filter((id) => id !== tagId)
      : [...collaborator.scopeTagIds, tagId];
    try {
      await collaboratorsApi.updateScope(collaborator.id, nextTagIds);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change visibility');
    }
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    try {
      await collaboratorsApi.invite(mapId, { email: email.trim(), role });
      setEmail('');
      setError(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite collaborator');
    }
  };

  const handleRoleChange = async (id: string, nextRole: CollaboratorRole) => {
    try {
      await collaboratorsApi.updateRole(id, nextRole);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change role');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await collaboratorsApi.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove collaborator');
    }
  };

  const handleCopyLink = async (invite: PendingInvite) => {
    try {
      await navigator.clipboard.writeText(inviteLink(invite.token));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((id) => (id === invite.id ? null : id)), 2000);
    } catch {
      setError('Could not copy the link - your browser may be blocking clipboard access.');
    }
  };

  const handleApplyTeam = async () => {
    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team || team.members.length === 0) return;
    setApplyingTeam(true);
    setError(null);
    try {
      for (const member of team.members) {
        try {
          await collaboratorsApi.invite(mapId, { email: member.email, role: 'EDITOR' });
        } catch (err) {
          // Applying the same team twice (or a team with someone already on
          // this project) is harmless - skip that one member, keep going.
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
      }
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply team');
    } finally {
      setApplyingTeam(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await invitesApi.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke invite');
    }
  };

  return (
    <Modal title="Share Map" onClose={onClose}>
      {!loading && !restrictedAccessEnabled && (
        <p className="hint-text">
          Every collaborator currently sees the whole map. Turn on Restrict Access in Map Settings
          to scope who sees what by tag, then come back here to assign it per person.
        </p>
      )}

      {!loading && collaborators.length === 0 && pendingInvites.length === 0 && (
        <p className="hint-text">
          Not shared with anyone yet. Invite by email below - they'll need to log in to accept,
          either from the email address or the link you can copy and send them directly.
        </p>
      )}

      {collaborators.length > 0 && (
        <table className="manage-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {collaborators.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.user.name ?? c.user.email}</td>
                  <td>
                    <select value={c.role} onChange={(e) => handleRoleChange(c.id, e.target.value as CollaboratorRole)}>
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  </td>
                  <td>
                    <button className="icon-btn" onClick={() => handleRemove(c.id)} title="Remove access">
                      🗑
                    </button>
                  </td>
                </tr>
                {restrictedAccessEnabled && (
                  <tr>
                    <td colSpan={3} style={{ paddingTop: 0 }}>
                      {tags.length === 0 ? (
                        <p className="hint-text">No tags yet - create some in the Tags settings to scope visibility.</p>
                      ) : (
                        <div className="tag-chip-list">
                          <span className="hint-text" style={{ marginRight: 4 }}>Visible to:</span>
                          {tags.map((t) => {
                            const active = c.scopeTagIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                className={`tag-chip${active ? ' tag-chip-active' : ''}`}
                                style={active ? { background: t.color, borderColor: t.color } : { borderColor: t.color }}
                                onClick={() => handleToggleScopeTag(c, t.id)}
                              >
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {pendingInvites.length > 0 && (
        <>
          <p className="hint-text" style={{ marginBottom: 8 }}>
            Pending - not yet accepted:
          </p>
          <table className="manage-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{inv.role === 'EDITOR' ? 'Editor' : 'Viewer'}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="icon-btn" onClick={() => handleCopyLink(inv)} title="Copy invite link">
                      {copiedId === inv.id ? '✓' : '🔗'}
                    </button>
                    <button className="icon-btn" onClick={() => handleRevokeInvite(inv.id)} title="Revoke invite">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {teams.length > 0 && (
        <div className="add-form">
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.members.length})
              </option>
            ))}
          </select>
          <button className="action-btn" onClick={handleApplyTeam} disabled={applyingTeam}>
            {applyingTeam ? 'Applying...' : '👥 Apply team'}
          </button>
        </div>
      )}

      <div className="add-form">
        <input
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as CollaboratorRole)}>
          <option value="VIEWER">Viewer</option>
          <option value="EDITOR">Editor</option>
        </select>
        <button className="action-btn" onClick={handleInvite}>
          + Invite
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
