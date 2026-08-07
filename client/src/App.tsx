import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mapsApi } from './api/maps.api';
import type { WorkspaceType } from './types/graph';
import { useGraphData } from './hooks/useGraphData';
import { useGraphStore } from './state/graphStore';
import { useAuthStore } from './state/authStore';
import { useThemeStore } from './state/themeStore';
import AuthPage from './components/auth/AuthPage';
import AccountBadge from './components/auth/AccountBadge';
import VerifyEmailGate from './components/auth/VerifyEmailGate';
import VerifyEmailPage from './components/auth/VerifyEmailPage';
import GraphCanvas from './components/graph/GraphCanvas';
import InviteAcceptPage from './components/invite/InviteAcceptPage';
import NodeDetailPanel from './components/panels/NodeDetailPanel';
import Toolbar from './components/panels/Toolbar';
import MapsListPage from './components/maps/MapsListPage';
import TaskManagerHome from './components/tasks/TaskManagerHome';
import ManageCategoriesModal from './components/settings/ManageCategoriesModal';
import ManageRelationTypesModal from './components/settings/ManageRelationTypesModal';
import ManageTagsModal from './components/settings/ManageTagsModal';
import ManageTaskStatusesModal from './components/settings/ManageTaskStatusesModal';
import ActivityPanel from './components/panels/ActivityPanel';
import ProgressPanel from './components/panels/ProgressPanel';
import ShareModal from './components/settings/ShareModal';
import MapSettingsModal from './components/settings/MapSettingsModal';
import AccountSettingsModal from './components/settings/AccountSettingsModal';
import ManageTeamsModal from './components/settings/ManageTeamsModal';
import TaskListView from './components/tasks/TaskListView';

function matchInviteToken(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  return match ? match[1] : null;
}

function matchVerifyEmailToken(): string | null {
  const match = window.location.pathname.match(/^\/verify-email\/([^/]+)$/);
  return match ? match[1] : null;
}

export default function App() {
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();
  // No router in this app (single view, switched by state) - shared links
  // (an invite, a verification email) are the only URLs that need to survive
  // a cold load, so their tokens are read once here rather than pulling in a
  // routing library for two routes.
  const [inviteToken, setInviteToken] = useState(matchInviteToken);
  const [verifyEmailToken, setVerifyEmailToken] = useState(matchVerifyEmailToken);
  const theme = useThemeStore((s) => s.theme);
  // Applied to <html> so every screen (including the logged-out auth page)
  // respects it, not just the parts of the tree AccountBadge sits above.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const {
    currentMapId,
    setCurrentMapId,
    selectedNodeId,
    selectNode,
    clearSelection,
    isManageCategoriesOpen,
    setManageCategoriesOpen,
    isManageRelationTypesOpen,
    setManageRelationTypesOpen,
    isManageTagsOpen,
    setManageTagsOpen,
    isManageTaskStatusesOpen,
    setManageTaskStatusesOpen,
    isActivityOpen,
    setActivityOpen,
    isProgressOpen,
    setProgressOpen,
    isMapSettingsOpen,
    setMapSettingsOpen,
    isAccountSettingsOpen,
    setAccountSettingsOpen,
    isManageTeamsOpen,
    setManageTeamsOpen,
    shareModalMapId,
    setShareModalMapId,
    viewOverride,
    setViewOverride
  } = useGraphStore();

  const mapsQuery = useQuery({ queryKey: ['maps'], queryFn: mapsApi.list, enabled: !!token });
  const graphQuery = useGraphData(token ? currentMapId : null);
  const currentMap = mapsQuery.data?.find((m) => m.id === currentMapId);
  // Defaults to the most restrictive role while the map list is still loading,
  // so edit affordances never flash on before the real role is known.
  const myRole = currentMap?.myRole ?? 'VIEWER';
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR';
  const isOwner = myRole === 'OWNER';
  const isTasksWorkspace = currentMap?.workspaceType === 'TASKS';
  // Account-level view, spanning every map - see AppMode's own schema comment.
  // MINDFLOW suppresses task UI everywhere, even on a map whose owner has task
  // management on; TASK_MANAGER forces the task list everywhere, with no
  // canvas escape hatch. BOTH (the default) is today's unchanged per-map
  // hybrid toggle.
  const appMode = user?.appMode ?? 'BOTH';
  const effectiveTaskManagementEnabled =
    appMode === 'MINDFLOW' ? false : (currentMap?.taskManagementEnabled ?? false);
  // A GRAPH map with task management on can show either the canvas or the
  // task list, for anyone - owner defaults to canvas, everyone else defaults
  // to "My Tasks", but either can flip via the toggle (viewOverride) for the
  // rest of this visit. A TASKS workspace has no canvas at all, so it's
  // unaffected by any of this.
  const taskManagementOnGraphMap = !isTasksWorkspace && effectiveTaskManagementEnabled;
  const defaultView = isOwner ? 'canvas' : 'tasks';
  const effectiveView =
    appMode === 'MINDFLOW'
      ? 'canvas'
      : appMode === 'TASK_MANAGER'
        ? 'tasks'
        : taskManagementOnGraphMap
          ? (viewOverride ?? defaultView)
          : 'canvas';
  const showTaskListView = isTasksWorkspace || effectiveView === 'tasks';
  // The manual per-map toggle button only makes sense under BOTH - under the
  // other two modes the view is forced with no escape hatch.
  const canToggleView = appMode === 'BOTH' && taskManagementOnGraphMap;

  // Handled before the logged-in check: someone can open a verification link
  // in a browser where they aren't (or no longer are) logged in, and the
  // verify-email call itself doesn't require auth.
  if (verifyEmailToken) {
    return (
      <VerifyEmailPage
        token={verifyEmailToken}
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setVerifyEmailToken(null);
        }}
      />
    );
  }

  if (!token) return <AuthPage />;

  if (user && !user.emailVerified) return <VerifyEmailGate />;

  const dismissInvite = () => {
    window.history.replaceState(null, '', '/');
    setInviteToken(null);
  };

  if (inviteToken) {
    return (
      <InviteAcceptPage
        token={inviteToken}
        onAccepted={(mapId) => {
          window.history.replaceState(null, '', '/');
          setInviteToken(null);
          queryClient.invalidateQueries({ queryKey: ['maps'] });
          setCurrentMapId(mapId);
        }}
        onDismiss={dismissInvite}
      />
    );
  }

  const handleCreateMap = async (name: string, workspaceType: WorkspaceType) => {
    const map = await mapsApi.create({ name, workspaceType });
    await queryClient.invalidateQueries({ queryKey: ['maps'] });
    setCurrentMapId(map.id);
  };

  const handleDeleteMap = async (mapId: string) => {
    await mapsApi.remove(mapId);
    if (currentMapId === mapId) setCurrentMapId(null);
    await queryClient.invalidateQueries({ queryKey: ['maps'] });
  };

  const handleGraphChanged = () => graphQuery.refetch();

  return (
    <div className="app-container">
      <AccountBadge
        onOpenSettings={() => setAccountSettingsOpen(true)}
        onOpenTeams={() => setManageTeamsOpen(true)}
        onOpenNotification={(mapId, nodeId) => {
          setCurrentMapId(mapId);
          if (nodeId) selectNode(nodeId);
        }}
      />

      {!currentMapId ? (
        appMode === 'TASK_MANAGER' ? (
          <TaskManagerHome
            maps={mapsQuery.data ?? []}
            onOpenMap={setCurrentMapId}
            onOpenTask={(mapId, nodeId) => {
              setCurrentMapId(mapId);
              selectNode(nodeId);
            }}
            onCreateMap={handleCreateMap}
            onOpenTeams={() => setManageTeamsOpen(true)}
          />
        ) : (
          <MapsListPage
            maps={
              appMode === 'MINDFLOW'
                ? (mapsQuery.data ?? []).filter((m) => m.workspaceType !== 'TASKS')
                : (mapsQuery.data ?? [])
            }
            onOpenMap={setCurrentMapId}
            onCreateMap={handleCreateMap}
            onDeleteMap={handleDeleteMap}
            onShareMap={setShareModalMapId}
            allowTaskBoards={appMode !== 'MINDFLOW'}
          />
        )
      ) : (
        <>
          <div className="main-column">
            <Toolbar
              mapId={currentMapId}
              mapName={currentMap?.name ?? ''}
              onBack={() => setCurrentMapId(null)}
              graph={graphQuery.data ?? null}
              taskManagementEnabled={effectiveTaskManagementEnabled}
              onOpenMapSettings={() => setMapSettingsOpen(true)}
              isOwner={isOwner}
              onOpenShare={() => setShareModalMapId(currentMapId)}
              showGraphFilters={!showTaskListView}
            />
            {!graphQuery.data ? (
              <div className="empty-state">Loading graph...</div>
            ) : showTaskListView ? (
              <TaskListView
                mapId={currentMapId}
                graph={graphQuery.data}
                scope={isTasksWorkspace || isOwner ? 'all' : 'mine'}
                canEdit={canEdit}
                isOwner={isOwner}
                restrictedAccessEnabled={currentMap?.restrictedAccessEnabled ?? false}
                onOpenTaskStatuses={() => setManageTaskStatusesOpen(true)}
                onOpenTags={isTasksWorkspace ? () => setManageTagsOpen(true) : undefined}
                onViewFullMap={canToggleView ? () => setViewOverride('canvas') : undefined}
                onChanged={handleGraphChanged}
                initialTaskId={selectedNodeId}
                onInitialTaskConsumed={clearSelection}
              />
            ) : (
              <GraphCanvas
                mapId={currentMapId}
                data={graphQuery.data}
                selectedNodeId={selectedNodeId}
                onNodeClick={selectNode}
                onBackgroundClick={clearSelection}
                onChanged={handleGraphChanged}
                canEdit={canEdit}
                isOwner={isOwner}
                taskManagementEnabled={effectiveTaskManagementEnabled}
                onOpenCategories={() => setManageCategoriesOpen(true)}
                onOpenRelationTypes={() => setManageRelationTypesOpen(true)}
                onOpenTags={() => setManageTagsOpen(true)}
                onOpenActivity={() => setActivityOpen(true)}
                onOpenTaskStatuses={() => setManageTaskStatusesOpen(true)}
                onOpenProgress={() => setProgressOpen(true)}
                onViewTaskList={canToggleView ? () => setViewOverride('tasks') : undefined}
              />
            )}
          </div>

          {graphQuery.data && selectedNodeId && !showTaskListView && (
            <NodeDetailPanel
              graph={graphQuery.data}
              selectedNodeId={selectedNodeId}
              onClose={clearSelection}
              onChanged={handleGraphChanged}
              canEdit={canEdit}
              isOwner={isOwner}
              restrictedAccessEnabled={currentMap?.restrictedAccessEnabled ?? false}
              taskManagementEnabled={effectiveTaskManagementEnabled}
            />
          )}

          {isManageCategoriesOpen && graphQuery.data && (
            <ManageCategoriesModal
              mapId={currentMapId}
              graph={graphQuery.data}
              onClose={() => setManageCategoriesOpen(false)}
              onChanged={handleGraphChanged}
            />
          )}
          {isManageRelationTypesOpen && graphQuery.data && (
            <ManageRelationTypesModal
              mapId={currentMapId}
              graph={graphQuery.data}
              onClose={() => setManageRelationTypesOpen(false)}
              onChanged={handleGraphChanged}
            />
          )}
          {isManageTagsOpen && graphQuery.data && (
            <ManageTagsModal
              mapId={currentMapId}
              graph={graphQuery.data}
              onClose={() => setManageTagsOpen(false)}
              onChanged={handleGraphChanged}
            />
          )}
          {isActivityOpen && (
            <ActivityPanel mapId={currentMapId} onClose={() => setActivityOpen(false)} />
          )}
          {isManageTaskStatusesOpen && graphQuery.data && (
            <ManageTaskStatusesModal
              mapId={currentMapId}
              graph={graphQuery.data}
              onClose={() => setManageTaskStatusesOpen(false)}
              onChanged={handleGraphChanged}
            />
          )}
          {isProgressOpen && graphQuery.data && (
            <ProgressPanel mapId={currentMapId} graph={graphQuery.data} onClose={() => setProgressOpen(false)} />
          )}
          {isMapSettingsOpen && currentMap && (
            <MapSettingsModal map={currentMap} isOwner={isOwner} onClose={() => setMapSettingsOpen(false)} />
          )}
        </>
      )}

      {shareModalMapId && (
        <ShareModal mapId={shareModalMapId} onClose={() => setShareModalMapId(null)} />
      )}
      {isAccountSettingsOpen && (
        <AccountSettingsModal onClose={() => setAccountSettingsOpen(false)} />
      )}
      {isManageTeamsOpen && <ManageTeamsModal onClose={() => setManageTeamsOpen(false)} />}
    </div>
  );
}
