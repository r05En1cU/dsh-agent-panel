# Graph model and geometry

Pure, DOM-free implementation of the native DSH Agent Team projection. Both modules are
deterministic and side-effect free: they read only their arguments and never touch the
network, the filesystem, or React.

- src/model.mjs: normalize the native wire view and shape render nodes/edges.
- src/geometry.mjs: layered DAG layout plus coarse-line bundled edge routing.

## Native inputs

The only data sources are the native projections:

- `agentTeam` wire view (stateVersion 4):

  ```text
  { members: [{ id, name, role, phase, error? }],
    tasks: [{ id, revision, subject, description, status, blockedBy,
              writeScopes, ownerName?, ready, writeScopeWarnings }],
    failure? }
  ```

  The member list starts with the synthetic lead row `{ id, name: 'lead', role: 'lead',
  phase: 'active' }`; teammates carry `role: 'teammate'` and `phase` in
  `provisioning | active | failed`. Deleted task tombstones are already filtered out by the
  projection, and `ownerName` is a derived display name (the wire view has no `ownerId`).

- `goal` wire value: `{ goal: { id, revision, objective, phase, roundsStarted,
  maxGoalRounds, blockedReason? } } | null`.

- `sessionId`: the session that renders the panel, used only for `isCurrent` /
  capability flags.

## src/model.mjs

### Stages

```js
STAGES = ['blocked', 'ready', 'active', 'done']
```

`deriveStage(task)`:

| native status | ready | stage |
| --- | --- | --- |
| `completed` | any | `done` |
| `in_progress` | any | `active` |
| `pending` | `true` | `ready` |
| anything else (pending without ready, deleted, unknown) | any | `blocked` |

Unknown statuses are never rewritten: the task keeps its original `status` string and only
the derived `stage` falls back to `blocked`.

### normalizeGoal(goalValue)

Accepts the projection value `{ goal: ... }` or a bare goal object. Returns
`{ id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason }` with
nullable numbers and `blockedReason: { code, message } | null`. A value without a usable
string `id` is not a goal and normalizes to `null` (nothing is invented).

### normalizeTeamView(view, { goal, sessionId })

Returns:

```js
{
  ok, failure, sessionId, leadId, currentMember, isLead, canReassign, canSpawn,
  members, tasks, goal,
  stats: { members, tasks, ready, blocked, active, done, blockedByEdges },
  edges
}
```

- `ok` is `failure === null`. A session without a team (`view == null`, or empty arrays)
  is a valid empty team: `ok: true`, empty lists, zero stats. A wire `failure` string is
  surfaced as-is and any data that is still present is normalized.
- Members are copied in wire order. `isLead` is set on the member whose `role` is
  `'lead'`; `leadId` is that member id, otherwise `null`. `currentMember` is the member
  whose id equals `sessionId`, otherwise `null`. `isLead` / `canReassign` / `canSpawn`
  are true only when the current member is the lead. Duplicate or id-less rows are skipped.
- Tasks are copied in wire order with `revision, subject, description, status, blockedBy,
  writeScopes, ownerName, ready, writeScopeWarnings`, plus:
  - `stage` from `deriveStage`;
  - `target`: `ownerName`, or the literal `'unowned'`;
  - `goalBound`: a normalized team goal exists;
  - `canMutate`: the current session is the lead, or the current member's name equals the
    task `ownerName` (the wire view has no `ownerId`, so the name is the only native
    ownership signal);
  - `canReassign`: lead only.
- Edges: `{ id: 'blockedBy:<task>:<blocker>', type: 'blockedBy', taskId, blockerId }` in
  task/blockedBy wire order. Duplicates are removed; blockers that are not part of the view
  are dropped rather than synthesized. A self reference, if it ever reaches this layer, is
  kept faithfully as data and suppressed later by the router.
- `stats` counts members, tasks, tasks per stage, and the emitted (deduplicated) edges.

### buildTeamGraph(normalized)

Accepts `normalizeTeamView(...)` output (or a raw wire view). Node ids are `task:<id>`
and `member:<id>`:

```js
{ id: 'task:task-2', kind: 'task', taskId, label, stage, target, goalBound,
  canMutate, canReassign, task }
{ id: 'member:sess-ada', kind: 'member', memberId, label, role, phase,
  isLead, isCurrent, member }

edges: [{ id, type: 'blockedBy', taskId, blockerId,
          from: 'task:<blocker>', to: 'task:<task>' }]
```

Node order is all task nodes (wire order) followed by all member nodes (wire order).
Blocked-by edges keep the data direction (`taskId` depends on `blockerId`) and expose the
visual direction `from` (blocker) -> `to` (dependent). The graph also re-exports the
normalized `ok, failure, sessionId, leadId, currentMember, isLead, canReassign, canSpawn,
goal, stats`.

## src/geometry.mjs

### layoutTeamGraph(graph, options)

Layered DAG layout; blockers sit on lower levels, dependents to the right, and the native
member roster gets its own column on the right.

```js
options = {
  positions: { [taskId | nodeId]: { x, y } },   // drag / pin
  expanded:  { [taskId | nodeId]: true },       // taller box, same routing
  widths:  number | { [id]: number } | { task, member, expanded, taskExpanded, memberExpanded },
  heights: number | { [id]: number } | { ... same keys ... },
}
```

Algorithm:

1. Collect `task:` / `member:` nodes and dependency edges (unknown endpoints and self
   loops ignored).
2. `level(task) = 1 + max(level(blocker))`, no blockers -> 0. A defensive `visiting`
   set breaks cycles deterministically instead of trusting the wire view (the native
   projection already rejects cycles).
3. One column per level, left to right, x = previous column right + `COLUMN_GAP`; boxes in
   a level stack in wire order with `ROW_GAP` and are vertically centered against the
   tallest column.
4. The member column starts at the last task column right + `MEMBER_COLUMN_GAP` and is
   centered against the task content.
5. `positions` overrides the computed origin afterwards; `expanded` only changes height
   (`TASK_EXPANDED_HEIGHT` / `MEMBER_EXPANDED_HEIGHT`).
6. `width` / `height` are the furthest box edges plus `PADDING` (and are `0` for an empty
   graph).

Returns `{ width, height, boxes, tasks, members, levels }` where each box is
`{ id, kind, x, y, w, h, node }`. `box.node` is the graph node the box represents; the
normalized task/member row is available at `box.node.task` / `box.node.member`. `levels`
is `[{ level, taskIds, x, width }]` in ascending order.

### routeTeamEdges(graph, layout, options)

Ports are the box left/right centers: `left = { x, y: y + h/2 }`,
`right = { x: x + w, y: y + h/2 }`. `options.ports` (measured DOM anchors,
`{ [nodeId]: { left: {x, y}, right: {x, y} } }`) replaces them exactly. Ports made from a
box and ports measured from the DOM go through the same routing function, so dragging or
expanding a box only changes its ports.

Routing, per blocker:

- Edges are grouped by their blocker node. A group of one stays a single thin edge
  (`width: 1.8`, arrow at the dependent).
- A group of two or more becomes a coarse bundle:
  - `hub` = the blocker's right port (the side facing the dependent/member column);
  - `junction` = hub moved toward the centroid of the dependent left ports by
    `clamp(nearest * 0.5, 30, 140)`, where `nearest` is the Euclidean distance from the
    hub to the closest dependent port (coordinates rounded to 1/1000 px);
  - `trunk` = `hub -> junction`, width `min(8, 2.8 + 1.1 * (count - 1))`, no arrow;
  - each `branch` starts at the exact junction and ends at the dependent's left port,
    width `1.8`, arrow at the dependent.

The junction is computed once per bundle, and the trunk end plus every branch start copy
those exact numbers, so continuity is a value-level guarantee (asserted in the tests).
Self loops and edges whose endpoints do not exist in the layout are dropped.

Returns:

```js
{
  edges: [{ id, type: 'blockedBy', from, to, taskId, blockerId,
            points: [{x, y}, ...], d, width, arrow, bundleId }],
  bundles: [{ id, type: 'blockedBy', from, blockerId, count, width, hub, junction,
              trunk: { id, points, d, width, arrow: false },
              branches: [{ edgeId, to, taskId, points, d, width: 1.8, arrow: true }],
              edgeIds }],
  ports: { [nodeId]: { left: {x, y}, right: {x, y} } }
}
```

Bundled edges appear once in `edges` with their branch path and `bundleId`; the trunk is
only in the bundle. Ordering follows the graph edges (wire order), so repeated runs produce
byte-identical output.

## Guarantees and limits

- No DOM, React, timers, randomness, or IO in either module; the only inputs are the
  arguments, and inputs are never mutated.
- No tasks, members, stages, or goal values are invented. Missing ids are skipped, unknown
  statuses fall back to `blocked` while keeping the original `status`.
- `canMutate` ownership is name-based because the native wire view exposes only
  `ownerName`; two members with the same name cannot be distinguished.
- Lead authority comes only from `role === 'lead'`; a wire view without that row has no
  lead.
- Layout does not pixel-measure text; it uses the documented box sizes (overridable) and
  the optional measured ports. Real DOM measurement is the caller's job.
- Self references stay in the model data (faithful to the wire) and are suppressed by the
  router.
