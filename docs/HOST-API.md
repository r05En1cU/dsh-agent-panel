# Host API — native Agent Team write routes

`src/host-routes.mjs` exposes four exact owner POST routes for the panel. Each route
validates the HTTP envelope, resolves the requested session's **exact live Agent**
(`agents.get(sessionId)`), verifies Team membership, and forwards native
`ctx.agentTeams` arguments. The routes never substitute the Team Lead for the caller,
never store Team state, and expose no read projection — the browser reads the native
`agentTeam` projection directly.

## Registration

```js
registerAgentTeamPanelRoutes(scope, { agentTeams, agents, log }, { log })
// -> { registered: true, paths: [four paths] }
// -> { registered: false, paths: [], reason: 'connection-unavailable' }
```

- Mounted only when `scope.connection.fetch.register` exists (or `scope.get('connection')`
  provides it). Missing Connection is a safe skip, not an error.
- Each route is registered with `methods: ['POST']` and `requestBody: 'buffered'`.
- `scope.effect` removes every mounted route on Host unload/HMR.
- Registration is all-or-nothing: if a later mount throws, earlier mounts are disposed
  and the error is rethrown.

## Common request envelope

All four routes:

- method strictly `POST` (anything else → `405` with `Allow: POST`);
- `content-type: application/json` (charset allowed);
- header `x-agent-team-panel: 1`;
- JSON object body at most **65536 bytes** (declared `content-length` over the cap is
  rejected before reading);
- field whitelist per route — unknown fields → `400 UNKNOWN_FIELD`;
- `sessionId` required, trimmed, 1–200 characters;
- string fields are trimmed and must be non-empty unless noted.

Common success shape: `{ "ok": true, ... }`.
Common failure shape: `{ "ok": false, "error": { "code": string, "message": string } }`.
Every response is `cache-control: no-store` and `x-content-type-options: nosniff`.
Errors never include native messages, filesystem paths or stacks.

Caller resolution:

1. `agents.get(sessionId)` must return a live Agent whose `id === sessionId`
   (missing → `404 AGENT_NOT_LOADED`; identity mismatch → `403 CALLER_MISMATCH`);
2. `agentTeams.membership(agent)` must succeed (non-member → `403 NOT_A_MEMBER`);
3. the same exact Agent object is passed to the native Team method; lead/owner
   authorization is left to the native service.

## Routes

### `POST /api/agent-team-panel.task.create`

| field | type | required | limit |
| --- | --- | --- | --- |
| `sessionId` | string | yes | 200 chars |
| `subject` | string | yes | 200 chars |
| `description` | string | yes | 16384 chars |
| `blockedBy` | string[] | no | 64 items × 200 chars |
| `writeScopes` | string[] | no | 64 items × 512 chars |

Native call: `createTask(agent, { subject, description, blockedBy?, writeScopes? })`.
Optional arrays are forwarded when present, including empty arrays.
Response: `{ ok: true, task: TeamTaskView }`.

### `POST /api/agent-team-panel.task.update`

| field | type | required | limit |
| --- | --- | --- | --- |
| `sessionId` | string | yes | 200 chars |
| `taskId` | string | yes | 200 chars |
| `expectedRevision` | integer | yes | positive safe integer |
| `action` | string | yes | `claim`, `release`, `edit`, `set_dependencies`, `complete`, `reopen`, `reassign`, `delete` |
| `subject` | string | no | 200 chars |
| `description` | string | no | 16384 chars |
| `blockedBy` | string[] | no | 64 items × 200 chars |
| `writeScopes` | string[] | no | 64 items × 512 chars |
| `owner` | string | no | 64 chars; empty string unassigns on `reassign` |

Optional fields are forwarded only when present.
Native call: `updateTask(agent, { taskId, expectedRevision, action, subject?, description?, blockedBy?, writeScopes?, owner? })`.
Response: `{ ok: true, task: TeamTaskView }`.

### `POST /api/agent-team-panel.teammate.spawn`

| field | type | required | limit |
| --- | --- | --- | --- |
| `sessionId` | string | yes | 200 chars |
| `name` | string | yes | 64 chars |
| `description` | string | yes | 200 chars |
| `prompt` | string | yes | non-empty (body cap applies) |
| `context` | string | no | `fresh` (default) or `fork` |

Native call:
`spawnTeammate(agent, { name, description, prompt: [{ type: 'text', text }], context, provider: context === 'fork' ? 'fork' : 'spawn', signal })`.
`signal` is the fetch request's `AbortSignal` when available, otherwise `undefined`.
Response: `{ ok: true, member: MemberView }`.

### `POST /api/agent-team-panel.message.send`

| field | type | required | limit |
| --- | --- | --- | --- |
| `sessionId` | string | yes | 200 chars |
| `target` | string | yes | 64 chars |
| `message` | string | yes | non-empty (body cap applies) |

Native call: `sendMessage(agent, { target, content: [{ type: 'text', text }], signal })`.
Response: `{ ok: true, messageId: string | null }`.

## Error codes

| HTTP | code | meaning |
| --- | --- | --- |
| 400 | `INVALID_CONTENT_TYPE` | not `application/json` |
| 400 | `MISSING_PANEL_HEADER` | missing `x-agent-team-panel: 1` |
| 400 | `BODY_TOO_LARGE` | body over 64 KiB |
| 400 | `INVALID_BODY` | unreadable body |
| 400 | `INVALID_JSON` | parse error / non-object JSON |
| 400 | `UNKNOWN_FIELD` | field outside the route whitelist |
| 400 | `INVALID_SESSION` | missing/invalid `sessionId` |
| 400 | `INVALID_FIELD` | wrong type, empty or over-limit field |
| 400 | `INVALID_ACTION` | unsupported task action |
| 400 | `INVALID_INPUT` / `INVALID_MEMBER_NAME` / `INVALID_WRITE_SCOPE` / `INVALID_TARGET` / `MESSAGE_TOO_LARGE` / `DEPENDENCY_CYCLE` | native validation failure |
| 400 | `REQUEST_ABORTED` | request signal aborted the native call |
| 403 | `NOT_A_MEMBER` | caller is not a Team member |
| 403 | `CALLER_MISMATCH` | `agents.get(sessionId).id !== sessionId` |
| 403 | `FORBIDDEN` / `LEAD_REQUIRED` | native owner/lead authorization failure |
| 404 | `AGENT_NOT_LOADED` | no live agent for the session |
| 404 | `TASK_NOT_FOUND` / `MEMBER_NOT_FOUND` | native lookup failure |
| 405 | `METHOD_NOT_ALLOWED` | non-POST request |
| 409 | `STALE_REVISION` | `expectedRevision` no longer current |
| 409 | `TASK_DELETED` / `TASK_BLOCKED` / `INVALID_TRANSITION` / `TASK_ALREADY_CLAIMED` / `TASK_HAS_DEPENDENTS` | native task-state conflict |
| 409 | `MEMBER_NAME_TAKEN` / `MEMBER_LIMIT` / `TASK_LIMIT` / `PROVISIONING_CONFLICT` | native capacity/provisioning conflict |
| 500 | `SERVICE_UNAVAILABLE` | `agents`/`agentTeams` service missing or disposed |
| 500 | `INTERNAL_ERROR` | unexpected failure (details are not exposed) |

## Limits summary

- request body: 65536 bytes;
- `sessionId` 200 / `taskId` 200 / `subject` 200 / `description` 16384;
- `name` 64 / `target` 64 / `owner` 64;
- arrays: 64 items; blocker id 200; write scope 512.

Read paths are out of scope: the panel client uses the native `agentTeam` projection.
