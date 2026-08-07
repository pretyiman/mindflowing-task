# Mindflow

A domain-agnostic node/wire diagramming webapp: users build a graph of nodes connected by typed,
labeled edges. Not a mind-mapping tool in the strict tree sense (unlike WiseMapping/MindMup) - the
core model is a **property graph**, so a node can have multiple parents, non-hierarchy connections
(e.g. "married to"), and cycles. A family tree, a software architecture diagram, a trading-bot
execution flow, or a comparison of this app against its competitors are all the same underlying
model, just different categories/relation types/data.

This file is the map for an AI agent picking up this project cold. Read it before making changes.
**Keep it updated** whenever you change the schema, the API surface, or any non-obvious behavior
described below - that's the whole point of this file existing.

## Core data model (`server/prisma/schema.prisma`)

Treat this as frozen in shape unless the user explicitly asks for a schema change - it's been
deliberately settled after earlier churn (see git log for the "accounts + sharing" and "grouping"
milestones). Additive migrations are fine; don't restructure existing tables casually.

- **Map** - top-level container. `ownerId` nullable (`SetNull` on user delete).
- **User** - email/passwordHash (Node's `crypto.scrypt`, no native deps)/name.
- **MapCollaborator** - `(mapId, userId)` unique, `role: EDITOR | VIEWER`. Ownership itself is
  `Map.ownerId`, never a collaborator row - one source of truth for "who owns this."
- **MapInvite** - shareable single-use token (`acceptedAt` set on redemption, can't be reused).
  Requires the recipient to log in and explicitly accept; the token alone grants nothing.
- **NodeCategory** - visual identity (icon + color) for a node, unique per map by name.
- **RelationType** - visual/semantic identity for an edge: directional?, color, line style,
  `isHierarchy` flag, optional `maxOutgoingPerSource`/`maxIncomingPerTarget` caps.
- **Node** - belongs to a map, optionally a category, optionally a `NodeGroup`. `posX`/`posY` are
  **absolute canvas coordinates when ungrouped, but relative to the parent group's own posX/posY
  when `groupId` is set** - this matches React Flow's own parent/child coordinate convention
  exactly, so `graphAdapter.ts` never has to convert anything at render time. Conversion only
  happens when a node joins/leaves a group (`groups.service.ts`).
- **NodeGroup** - a purely visual/organizational box wrapping 2+ nodes (e.g. a married couple).
  Owns no edges. Members keep independent identity/edges/notes/properties. See "Node Groups" below
  for the sizing rules - this took many iterations to get right, don't casually change the margin
  math without re-reading that section.
- **Tag** / **NodeTag** - freeform many-to-many labels for filtering/analysis, deliberately no
  icon/visual role (that's what NodeCategory is for). A node can carry any number of tags.
- **Edge** - `sourceNodeId`/`targetNodeId`/`relationTypeId`, unique on that triple (no duplicate
  identical edges). `sourceHandle`/`targetHandle` record which of the 4 connection points
  (top/left = always target, bottom/right = always source - see CustomNode.tsx) was actually used,
  so reloading never collapses an edge onto the wrong side. Nullable, with a left/right fallback in
  `graphAdapter.ts` for edges created before per-handle support existed.
- Both `Node` and `Edge` have per-instance `iconOverride`/`colorOverride`/`labelOverride`/etc. so two
  nodes of the same category (or edges of the same relation type) can still look distinct.

**Why a property graph, not a tree**: a node can have two "parent of" incoming edges (two parents),
plus a non-hierarchy edge like "married to" between two otherwise-unrelated nodes. This is the
concrete differentiator from WiseMapping/MindMup, both of which assume a strict single-parent tree.
See the "Mindflow Explained" map (built in-app, in the user's own account) for a worked example.

## Auth & sharing model (implemented, not aspirational)

- JWT in the response body (`Authorization: Bearer <token>`), stored client-side - not an httpOnly
  cookie. Deliberate tradeoff: this whole project is verified via curl/headless-Chrome scripts, and
  bearer tokens keep that trivial. Revisit before a real production deploy.
- Access control: `plugins/auth.ts` + `plugins/authorization.ts`. Sharing is managed via
  `MapCollaborator` rows (ShareModal.tsx + `/api/maps/:mapId/collaborators`) or invite links
  (`/api/invites`) - read those files directly for the exact role-check mechanics.
- Client-side, `myRole` on each map (`MapRole = 'OWNER' | 'EDITOR' | 'VIEWER'`) gates edit
  affordances (Add Node, quick-add, Save/Delete in modals) - display-only; the real enforcement is
  server-side.
- **Collaborator role vs. visibility scope - two separate axes, easy to conflate (a real support
  question this session).** `MapCollaborator.role` (EDITOR/VIEWER) is *permission level* - can they
  edit vs. only view. It has nothing to do with *what they can see*. That's `restrictedAccessEnabled`
  + `NodeAccessGrant`/`CollaboratorTagScope` (see `visibility.ts`'s `getVisibleNodeIdFilter`,
  Scoped Access in the data model above) - off by default, meaning every collaborator sees the
  whole map. To give someone access to work on **one specific task without seeing anything else in
  the project** (e.g. an outside contractor who shouldn't see business-sensitive nodes): (1) turn on
  Restricted Access in Map Settings - this alone makes every non-owner collaborator see *nothing* by
  default; (2) grant that person a `NodeAccessGrant` on just the task(s) they need, from that task's
  own Access section in `TaskEditPanel`/`NodeDetailPanel`. This is enforced server-side in
  `getGraph` itself (a restricted node never even appears in the API response, not just hidden by
  the UI) and on every per-node endpoint (`requireNodeVisible()`). They still need to *accept* a
  real invite first (unavoidable - some access record has to exist before scoping means anything),
  but accepting doesn't imply seeing everything; that's this separate, additional step.

## Account-level App Mode (`User.appMode`)

Independent of any single map's own `workspaceType`/`taskManagementEnabled`, an account has one of
three modes (`AppMode` enum: `TASK_MANAGER | MINDFLOW | BOTH`, default `BOTH`), set via Account
Settings (`PATCH /auth/app-mode`) and applied everywhere, across every map the user opens:

- **`BOTH`** (default) - today's per-map hybrid: a task-enabled `GRAPH` map can show canvas or task
  list, manually toggled (`viewOverride` in `graphStore.ts`), defaulting to canvas for the owner and
  the task list for everyone else. Every existing account stays on this until it opts into one of
  the others, so this mode must never change behavior.
- **`MINDFLOW`** - task UI is fully suppressed everywhere, even on a map whose owner has task
  management on. Implemented as a single derived value in `App.tsx`
  (`effectiveTaskManagementEnabled`, forced `false` in this mode) threaded to every place that used
  to read `currentMap.taskManagementEnabled` directly (`Toolbar`, `GraphCanvas`, `NodeDetailPanel`)
  - those components already gated their task-only buttons/fields behind that one boolean, so no
  changes were needed inside them. `MapsListPage` also hides `TASKS`-workspace maps entirely (a map
  with zero canvas has nothing to show in this mode) and drops the Mind-Map/Task-Board type picker
  from "+ New Map" (always creates `GRAPH`).
- **`TASK_MANAGER`** - the mirror image: task list is forced everywhere (`effectiveView` always
  `'tasks'`, no per-map toggle button), and the landing screen after login is
  `TaskManagerHome.tsx` instead of `MapsListPage` - a cross-map "My Work" aggregate that fetches
  every task-enabled map's graph/members in parallel (reusing `useGraphData`'s own query key so
  opening a map from here doesn't refetch) and groups tasks by map. It's a **navigation surface,
  not an editor** - clicking a task calls `setCurrentMapId` + `selectNode`, which
  `TaskListView.tsx`'s `initialTaskId`/`onInitialTaskConsumed` props pick up to auto-open that exact
  task's `TaskEditPanel` on arrival, reusing the single-map task-editing UI rather than
  reimplementing it. Its own "+ New Project" always creates a `TASKS`-workspace map (no picker).

A `GRAPH` map with task management **off**, opened by a `TASK_MANAGER`-mode user (e.g. via an invite
link), is a known, accepted gap: it still forces the task list, showing an empty state rather than
that map's real canvas content. Not solved - rare and non-destructive.

## Feature implementation status

All of the following are implemented and working, not planned:

- Accounts (register/login/JWT), per-map ownership, role-based sharing (EDITOR/VIEWER via
  collaborator rows or shareable invite links), account settings (change password, app mode).
- Task management: `Node.isTask` (explicit opt-in - see its own schema.prisma comment; NOT implied
  by having a category/tags/properties, and not even implied by taskManagementEnabled alone) marks
  a node as a task; only then do status/assignee/priority/due date (+ auto-tracked start/complete
  timestamps) apply and the node shows up in any task view (`TaskListView`, `TaskManagerHome`,
  `ProgressPanel` - all three must agree on this one definition, don't let them drift apart again).
  Per-map customizable `TaskStatus` list, a `TASKS`-only map `workspaceType` for a zero-canvas task
  board (every node there is `isTask: true` by construction - there's no canvas to have made a plain
  content node from) - called a **"Project" in the UI** (the picker, creation flows, settings copy),
  though the underlying enum value stays `workspaceType: 'TASKS'`; per-task threaded discussion
  (comments + activity merged in one timeline, anyone who can see the task can comment); and the
  account-level App Mode described above for a
  fully separate Task-Manager-only or Mindflow-only experience. `NodeDetailPanel.tsx`'s "Track as a
  task" checkbox promotes/demotes an ordinary canvas node; unchecking never clears the underlying
  task fields, so re-checking it restores exactly what was there.
- **Plane-style task manager feature set** (all implemented on top of the above): **sub-tasks**
  reuse Edge/RelationType rather than a parent/child column - a built-in "Sub-task of"
  `RelationType` (`isHierarchy: true`) is lazily get-or-created per map on first use
  (`nodes.service.ts`'s `createSubtask`/`getOrCreateSubtaskRelationType`), so this works on maps
  created before sub-tasks existed too, no backfill needed; `TaskEditPanel.tsx` shows a flat
  "Sub-tasks" list with a done/total count and a "Sub-task of X" breadcrumb, `TaskListView` itself
  stays flat (sub-tasks also appear as ordinary top-level rows - intentional, not a bug).
  **Kanban board**: `TaskBoardLayout.tsx`, a frontend-only List/Board toggle in `TaskListView.tsx`
  reusing the exact same grouped-by-status data the list view already computes; native HTML5
  drag-and-drop, no new dependency, no intra-column reordering.
  **In-app notifications**: `Notification` model, polled (not pushed - no websocket/SSE infra
  exists) via `server/src/lib/notifications.ts`'s fire-and-forget `notify()`, fired on task
  assignment (alongside the existing email) and on commenting on someone else's assigned task
  (never self-notifies); bell icon + unread badge in `AccountBadge.tsx`, React Query
  `refetchInterval` polling every 45s, clicking a notification marks it read and navigates straight
  to that map/task via the same `setCurrentMapId`+`selectNode` pair `TaskManagerHome` uses.
  **Attachments**: v1 is pasted links only (name + URL), NOT real file upload - that needs a
  storage-provider decision not yet made. EDITOR-gated (unlike comments, which are VIEWER-level) -
  adding/removing a link modifies the task's own content, not a lightweight discussion reply.
- **Projects, Teams, multi-assignee, owner dashboard**: a `TASKS`-workspace map is called a
  **"Project"** everywhere in the UI (picker, creation flows, settings copy) - purely a display
  label, `workspaceType: 'TASKS'` is unchanged underneath. **Teams** (`Team`/`TeamMember`, stored by
  email like `MapInvite`) are a personal, reusable roster - `ManageTeamsModal.tsx` (via
  `AccountBadge.tsx`'s account menu) to create/edit one, `ShareModal.tsx`'s "Apply a team" section
  to invite every member to a project in one action by looping the existing per-email
  `collaboratorsApi.invite` call; a `Team` never grants access on its own and is always optional -
  project creation itself never requires one. **Task assignment is multi-person**
  (`NodeAssignee` join table, replacing what used to be a single `Node.assigneeId` FK - no
  primary/secondary distinction, just a set of equally-accountable people). `nodes.service.ts`'s
  `updateNode` takes `assigneeIds` with full-replace-the-set semantics (a PATCH sets the complete
  list; there's no add/remove-one endpoint) and diffs old-vs-new to notify/email only the
  newly-added assignees, never someone already on the task. Every assignee-display surface
  (`TaskEditPanel`/`NodeDetailPanel`'s assignee picker - a `tag-chip-list` toggle, same pattern as
  Tags/Access, not a `<select>`; `TaskListView`/`TaskManagerHome`/`TaskBoardLayout` row/card text;
  `CustomNode.tsx`'s canvas badge, which shows the first assignee's initial plus a `+N` suffix; and
  `ProgressPanel.tsx`'s "By Assignee" stat, where a multi-assignee task now correctly counts once
  under each assignee) was updated together - keep them agreeing if this changes again. The
  **Projects Dashboard** (`ProjectsDashboard.tsx`) renders **inline, always visible** at the top of
  `TaskManagerHome.tsx` - deliberately NOT behind a button/modal (an earlier version was, and got
  flagged as a real usability miss: the "how are my projects doing" answer should be on the page,
  not an extra click away). Scoped to projects the current user **owns** (mirrors the map-wide
  `ActivityLog`'s owner-only visibility) - a frontend-only per-project stat snapshot (reusing
  `ProgressPanel`'s exact formulas) plus a tasks-completed-per-day sparkline built from
  `Node.completedAt`, with no new backend endpoint and no historical-snapshot infrastructure (that
  would be needed for a real burndown chart, which this deliberately isn't).
  `TaskManagerHome.tsx`'s scope toggle defaults to **"All Tasks", not "My Tasks"** - defaulting to
  assigned-to-me made an owner's own freshly-created, not-yet-assigned work invisible on their very
  first visit into a brand-new project, which is exactly the kind of empty-looking-but-not-actually-
  empty state to avoid. Sharing/team-assignment entry points exist in three places, since a first
  real run showed they weren't obvious enough from just the account menu: `AccountBadge.tsx`'s
  account menu ("👥 Manage Teams"), `TaskManagerHome.tsx`'s own header (same action, one click
  closer), and `Toolbar.tsx`'s owner-only "👥" icon next to Map Settings (opens `ShareModal` from
  *inside* an open project - there used to be no way to reach Share without first going back to the
  maps list). `TaskEditPanel`/`NodeDetailPanel`'s Assignees section also shows a "You're the only
  one on this project" hint whenever `members.length <= 1`, pointing at Share directly.
- Full graph CRUD: nodes, edges (with 4-handle connection points and per-edge label/color/style
  overrides), categories, relation types (with directional/hierarchy flags and per-relation-type
  in/out degree caps), tags (many-to-many, filterable).
- **Node Groups**: create from 2+ selected nodes, auto-fit box (see rules below), drag/rename any
  member and the box resizes to follow, ungroup restores absolute positions.
- Filtering: a single search box (name/tags/properties) plus an "advanced" popover (tags, group,
  "connected to node X"), with dimmed-not-hidden non-matches so context isn't lost.
- Quick-add: click a node's "+" to create a new connected node in one step, without leaving the
  canvas. Toolbar's own "Add Node" (🔷) for an unconnected node.
- Light/dark theme toggle (defaults to light), applied at `<html data-theme>` so it covers the
  logged-out auth page too.
- Maps list page (create/rename/delete/share entry point).

## Node Groups - sizing rules (read this before touching `groups.service.ts`)

This went through many iterations before landing on the current rule, driven directly by user
feedback. The rule, verbatim intent: **width follows whichever member's name is widest; every
member is always left-aligned at a fixed margin; vertical spacing between members is whatever the
user leaves it as - grouping must never force members closer together, and dragging a member
further apart must grow the box to follow, not block the drag.**

- `GROUP_MARGIN = 12` (px, in `groups.service.ts`) - the gap between a member's edge and the group
  border, on all 4 sides. Was 2px, then 8px, now 12px, each bump made because the user couldn't
  clearly see the margin at the smaller values. If asked to change it again, it's this one constant.
- `resizeGroupToFitMembers(groupId)` is the **single source of truth** for box dimensions - both
  `createGroup` (on creation) and `nodes.service.ts`'s `updateNode` (on every drag or rename of a
  grouped node) call it, so creation and later drag/rename-driven resizing can never disagree. Width
  comes from `estimateNodeWidth` (a character-count approximation, since the server has no real font
  metrics - see its own comment for the exact formula/tradeoff); height from the members' actual
  vertical spread, not a fixed gap. Every member's `posX` is force-reset to `GROUP_MARGIN` on every
  resize (horizontal position is never a persisted layout choice).
- Client-side (`graphAdapter.ts`), grouped nodes deliberately do **not** get React Flow's
  `extent: 'parent'` - see that file's comment for why (short version: it would block a drag from
  ever growing the box, since the server-side resize never gets the chance to run).

## Dev workflow / environment quirks (Windows)

- `npm run dev` at the repo root runs both server (:4000) and client (:5173) concurrently.
- Before any server code change requiring a restart: stop whatever's bound to port 4000 first
  (`Get-NetTCPConnection -LocalPort 4000 -State Listen | Stop-Process`), Windows file-locks the
  running process otherwise. Restart via `nohup npx tsx src/index.ts > /tmp/server.log 2>&1 &`
  from `server/`. The first health-check immediately after restart often needs a ~2s retry.
- `node -e` / any Node script invoked from Git Bash needs **Windows-style forward-slash paths**
  (`C:/Users/...`), not bash-style `/c/Users/...` - the latter gets misread as relative to the
  current drive and throws `ENOENT`.
- Client API base URL defaults to a relative `/api` (see `client/src/api/client.ts`), proxied to
  `localhost:4000` by Vite's dev server (`client/vite.config.ts`) - this is what makes the app work
  when accessed from a different device (phone, another machine) without hardcoding an absolute
  URL that would only resolve on the host machine.
- ngrok tunneling: `vite.config.ts` has `allowedHosts: ['.ngrok-free.app']`. ngrok's free tier
  serves a one-time browser interstitial page before the real app loads - expect that in any
  automated test hitting a fresh ngrok URL.
- `.env` at the repo root is shared by both workspaces (`server/src/env.ts` reads
  `../.env` relative to its own cwd, then also allows a `server/.env` override).

## Verification discipline

No change is "done" until: typecheck both packages (`npx tsc -b --noEmit` client /
`npx tsc --noEmit` server) → build clean (`npm run build`) → restart affected dev server(s) →
live-verify (curl for API-level checks, puppeteer-core + a real Chrome install for anything
UI-visible - there's no browser-automation MCP/extension wired up in this environment) → clean up
any scratch data created purely for testing. Report back before committing; commit only on
explicit go-ahead.
