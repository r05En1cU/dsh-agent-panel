# dsh-agent-panel · implementation contract

Standalone DSH web plugin. The only data source is the
native Agent Team projection.

## Native inputs

- Projection key: `agentTeam`, stateVersion 4. Wire view:
  `{ members: [{id,name,role,phase,error?}], tasks: [{id,revision,subject,description,status,blockedBy,writeScopes,ownerName?,ready,writeScopeWarnings}], failure? }`
- Goal projection key `goal`; wire value is `{ goal: {id,revision,objective,phase,roundsStarted,maxGoalRounds,blockedReason?} } | null`.
- Team service: `ctx.agentTeams` (native). Mutation routes call native methods with the exact live agent:
  `createTask`, `updateTask`, `spawnTeammate`, `sendMessage`.

## src/model.mjs (agent: graph-model)

```js
export const STAGES = ['blocked', 'ready', 'active', 'done'];

/** @returns {'blocked'|'ready'|'active'|'done'} */
export function deriveStage(task) {}

/**
 * @param {object|null} view native agentTeam wire view
 * @param {{goal?: object|null, sessionId?: string|null}} [options]
 * @returns {{
 *   ok: boolean, failure: string|null, sessionId: string|null, leadId: string|null,
 *   currentMember: object|null, isLead: boolean, canReassign: boolean, canSpawn: boolean,
 *   members: object[], tasks: object[], goal: object|null,
 *   stats: {members:number,tasks:number,ready:number,blocked:number,active:number,done:number,blockedByEdges:number},
 *   edges: object[]
 * }}
 */
export function normalizeTeamView(view, options = {}) {}

/** Normalize `goal` wire value into {id,revision,objective,phase,roundsStarted,maxGoalRounds,blockedReason}. */
export function normalizeGoal(goalValue) {}

/** Build graph nodes/edges for rendering. Node ids are "task:<id>" / "member:<id>". */
export function buildTeamGraph(normalized) {}
```

Rules:
- Task stage: `completed -> done`; `in_progress -> active`; `pending && ready -> ready`; else `blocked`.
- Task fields additionally: `stage`, `target` (ownerName or `unowned`), `goalBound` (team goal exists),
  `canMutate` (current session is lead or owns the task), `canReassign` (lead only).
- `members`: mark `isLead`, `isCurrent`; if no members, `leadId=null`.
- `edges`: `{id:'blockedBy:<task>:<blocker>', type:'blockedBy', taskId, blockerId}`; dedupe, ignore missing blockers.
- Never invent tasks/members/stages; unknown status -> `blocked` and keep original `status` field.
- Pure, deterministic, no DOM/React/IO.

## src/geometry.mjs (agent: graph-model)

```js
/** Layered DAG layout. options: positions {[taskId]:{x,y}}, expanded {[taskId]:true}, widths/heights. */
export function layoutTeamGraph(graph, options = {}) {}
// -> { width, height, boxes: [{id, kind:'task'|'member', x,y,w,h, node}], tasks, members, levels }

/**
 * Route blockedBy edges with coarse-line bundling.
 * options.ports: {[nodeId]: {left:{x,y}, right:{x,y}}} measured DOM anchors.
 * -> { edges, bundles, ports }
 */
export function routeTeamEdges(graph, layout, options = {}) {}
```

Routing contract:
- Visual flow is blocker -> dependent (dependency direction), while data keeps task -> blocker.
- Group edges by blocker when `count >= 2`:
  - hub port = blocker port facing members; junction = point between hub and target ports,
    `distance = clamp(nearest * 0.5, 30, 140)`;
  - **trunk** path hub -> junction, width `min(8, 2.8 + 1.1 * (count - 1))`, no arrow;
  - **branch** paths start at the exact same junction, end at each dependent port, width 1.8, arrow at target;
  - trunk end and every branch start MUST be the exact same point (continuity assertion in tests).
- Single edge: thin path hub port -> target port with arrow.
- No self edges; missing endpoints dropped; deterministic ordering.
- When `options.ports` provided, use those exact anchors; otherwise derive left/right center anchors from boxes.
- Expanded nodes / moved nodes are just different boxes: same routing must apply.

## src/host-routes.mjs (agent: host)

```js
export const AGENT_TEAM_PANEL_ROUTES = {
  createTask: '/api/agent-team-panel.task.create',
  updateTask: '/api/agent-team-panel.task.update',
  spawnTeammate: '/api/agent-team-panel.teammate.spawn',
  sendMessage: '/api/agent-team-panel.message.send',
};
export function createAgentTeamPanelHandlers(deps) {}
export function registerAgentTeamPanelRoutes(scope, deps, options = {}) {}
```

- deps: `{ agentTeams, agents, log? }`.
- Every POST: `content-type: application/json`, header `x-agent-team-panel: 1`, body <= 64 KiB,
  whitelist fields; `sessionId` required; return no-store JSON.
- Resolve the exact live agent with `agents.get(sessionId)`; membership with `agentTeams.membership(agent)`.
  Use the current agent as caller (preserves owner/lead authority); never silently escalate.
- create: `createTask(agent, {subject, description, blockedBy?, writeScopes?})`.
- update: `updateTask(agent, {taskId, expectedRevision, action, subject?, description?, blockedBy?, writeScopes?, owner?})`.
- spawn: `spawnTeammate(agent, {name, description, prompt:[{type:'text',text}], context, provider: context==='fork'?'fork':'spawn', signal})`.
- message: `sendMessage(agent, {target, content:[{type:'text',text}], signal})`.
- Error mapping: NOT_FOUND -> 404, authorization/lead/member -> 403, stale/blocked/transition/has-dependents -> 409,
  invalid input -> 400, unknown -> 500. Never leak paths/stacks.
- Register only when `scope.connection.fetch.register` exists; dispose on scope effect.
- Never store team state; the client reads the native projection.

## src/client-body.js (root)

React panel. Reads native projection from `ctx.sessions` (inject `sessions`) via
`sessions.binding(sessionId).session.getSnapshot()` + `sessions.list.getSnapshot()` / subscribe.
Renders graph, drag/expand, measured ports, bundled edges, live updates, inspector/actions.
Exposes `__test` helpers for the demo harness.
