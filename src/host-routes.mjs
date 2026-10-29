/**
 * dsh-plugin-agent-team-panel — native Agent Team write routes.
 *
 * Four exact owner POST routes let the panel call the native Team service
 * (`ctx.agentTeams`) with the exact live Agent resolved from the requested
 * session. The routes only validate the HTTP envelope, resolve the caller,
 * and forward native method arguments; they never store Team state and never
 * substitute the Team Lead (or any other agent) for the caller.
 *
 * Security envelope:
 * - POST only; `application/json`; header `x-agent-team-panel: 1`;
 * - 64 KiB body cap, per-route field whitelist and text limits;
 * - caller = `agents.get(sessionId)`; membership is verified through
 *   `agentTeams.membership(agent)`, so stale or foreign agents fail closed;
 * - responses are no-store and errors use stable codes without paths/stacks.
 */

import { Buffer } from 'node:buffer';

export const AGENT_TEAM_PANEL_ROUTES = Object.freeze({
  createTask: '/api/agent-team-panel.task.create',
  updateTask: '/api/agent-team-panel.task.update',
  spawnTeammate: '/api/agent-team-panel.teammate.spawn',
  sendMessage: '/api/agent-team-panel.message.send',
});

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SESSION_ID = 200;
const MAX_TASK_ID = 200;
const MAX_SUBJECT = 200;
const MAX_DESCRIPTION = 16384;
const MAX_MEMBER_NAME = 64;
const MAX_TARGET = 64;
const MAX_OWNER = 64;
const MAX_PROMPT = 64 * 1024;
const MAX_MESSAGE = 64 * 1024;
const MAX_ARRAY_ITEMS = 64;
const MAX_BLOCKER_ID = 200;
const MAX_WRITE_SCOPE = 512;

const TASK_ACTIONS = new Set([
  'claim',
  'release',
  'edit',
  'set_dependencies',
  'complete',
  'reopen',
  'reassign',
  'delete',
]);

const CONTEXTS = new Set(['fresh', 'fork']);

const ROUTE_FIELDS = Object.freeze({
  createTask: new Set(['sessionId', 'subject', 'description', 'blockedBy', 'writeScopes']),
  updateTask: new Set([
    'sessionId',
    'taskId',
    'expectedRevision',
    'action',
    'subject',
    'description',
    'blockedBy',
    'writeScopes',
    'owner',
  ]),
  spawnTeammate: new Set(['sessionId', 'name', 'description', 'prompt', 'context']),
  sendMessage: new Set(['sessionId', 'target', 'message']),
});

/** One stable, safe route failure. */
class PanelRouteError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PanelRouteError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Native TeamError code -> stable panel error code, HTTP status and safe text.
 * Native messages are intentionally not forwarded: they can echo ids/paths and
 * are not part of this HTTP contract.
 */
const NATIVE_ERRORS = Object.freeze({
  TEAM_INVALID_ARGUMENT: ['INVALID_INPUT', 400, 'invalid Agent Team request'],
  TEAM_INVALID_WRITE_SCOPE: ['INVALID_WRITE_SCOPE', 400, 'write scope must be workspace-relative'],
  TEAM_INVALID_MEMBER_NAME: ['INVALID_MEMBER_NAME', 400, 'teammate name must be lower-kebab-case and not lead'],
  TEAM_INVALID_TARGET: ['INVALID_TARGET', 400, 'target member is not addressable'],
  TEAM_SELF_MESSAGE: ['INVALID_TARGET', 400, 'a Team member cannot message itself'],
  TEAM_MESSAGE_TOO_LARGE: ['MESSAGE_TOO_LARGE', 400, 'message exceeds the native size limit'],
  TEAM_TASK_DEPENDENCY_CYCLE: ['DEPENDENCY_CYCLE', 400, 'task dependencies would form a cycle'],
  TEAM_NOT_MEMBER: ['NOT_A_MEMBER', 403, 'caller is not an Agent Team member'],
  TEAM_TASK_UNAUTHORIZED: ['FORBIDDEN', 403, 'caller may not mutate this task'],
  TEAM_LEAD_REQUIRED: ['LEAD_REQUIRED', 403, 'the Team Lead is required for this action'],
  TEAM_TASK_NOT_FOUND: ['TASK_NOT_FOUND', 404, 'task not found'],
  TEAM_MEMBER_NOT_FOUND: ['MEMBER_NOT_FOUND', 404, 'member not found'],
  TEAM_TASK_STALE_REVISION: ['STALE_REVISION', 409, 'task revision is stale; refresh and retry'],
  TEAM_TASK_DELETED: ['TASK_DELETED', 409, 'task is deleted'],
  TEAM_TASK_BLOCKED: ['TASK_BLOCKED', 409, 'task is blocked by incomplete dependencies'],
  TEAM_TASK_INVALID_TRANSITION: ['INVALID_TRANSITION', 409, 'task transition is not allowed in its current state'],
  TEAM_TASK_ALREADY_CLAIMED: ['TASK_ALREADY_CLAIMED', 409, 'task is owned by another member'],
  TEAM_TASK_HAS_DEPENDENTS: ['TASK_HAS_DEPENDENTS', 409, 'task still blocks another task'],
  TEAM_MEMBER_NAME_TAKEN: ['MEMBER_NAME_TAKEN', 409, 'teammate name is already used in this Team'],
  TEAM_MEMBER_LIMIT: ['MEMBER_LIMIT', 409, 'Team member limit reached'],
  TEAM_TASK_LIMIT: ['TASK_LIMIT', 409, 'Team task limit reached'],
  TEAM_PROVISIONING_CONFLICT: ['PROVISIONING_CONFLICT', 409, 'teammate provisioning conflicted with another transition'],
  TEAM_DISPOSED: ['SERVICE_UNAVAILABLE', 500, 'Agent Team service is unavailable'],
  TEAM_DISPOSAL_TIMEOUT: ['SERVICE_UNAVAILABLE', 500, 'Agent Team service is unavailable'],
  TEAM_WAIT_ABORTED: ['INTERNAL_ERROR', 500, 'Agent Team request failed'],
  TEAM_INVALID_TIMEOUT: ['INTERNAL_ERROR', 500, 'Agent Team request failed'],
  TEAM_INVALID_CONFIG: ['INTERNAL_ERROR', 500, 'Agent Team request failed'],
});

function jsonResponse(body, status = 200, extraHeaders) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (value !== undefined) headers[name.toLowerCase()] = String(value);
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeError(error) {
  if (error instanceof PanelRouteError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  const nativeCode = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : '';
  const mapped = Object.prototype.hasOwnProperty.call(NATIVE_ERRORS, nativeCode) ? NATIVE_ERRORS[nativeCode] : null;
  if (mapped) return { code: mapped[0], status: mapped[1], message: mapped[2] };
  if (error && error.name === 'AbortError') {
    return { code: 'REQUEST_ABORTED', status: 400, message: 'request was aborted' };
  }
  return { code: 'INTERNAL_ERROR', status: 500, message: 'Agent Team request failed' };
}

function headerOf(request, name) {
  const headers = request && request.headers;
  if (!headers || typeof headers.get !== 'function') return '';
  const value = headers.get(name);
  return value === null || value === undefined ? '' : String(value);
}

async function readJson(request) {
  const contentType = headerOf(request, 'content-type');
  if (!/^application\/json\s*(?:;|$)/iu.test(contentType)) {
    throw new PanelRouteError('INVALID_CONTENT_TYPE', 400, 'content-type must be application/json');
  }
  if (headerOf(request, 'x-agent-team-panel') !== '1') {
    throw new PanelRouteError('MISSING_PANEL_HEADER', 400, 'x-agent-team-panel: 1 header is required');
  }
  const declaredLength = Number(headerOf(request, 'content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PanelRouteError('BODY_TOO_LARGE', 400, 'request body exceeds 64 KiB');
  }
  let text;
  try {
    text = await request.text();
  } catch {
    throw new PanelRouteError('INVALID_BODY', 400, 'request body is unreadable');
  }
  if (typeof text !== 'string') throw new PanelRouteError('INVALID_BODY', 400, 'request body is unreadable');
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new PanelRouteError('BODY_TOO_LARGE', 400, 'request body exceeds 64 KiB');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PanelRouteError('INVALID_JSON', 400, 'request body is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PanelRouteError('INVALID_JSON', 400, 'request body must be a JSON object');
  }
  return parsed;
}

function assertFields(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new PanelRouteError('UNKNOWN_FIELD', 400, 'unknown request field');
  }
}

function requireSessionId(body) {
  const value = body.sessionId;
  if (typeof value !== 'string') throw new PanelRouteError('INVALID_SESSION', 400, 'sessionId is required');
  const sessionId = value.trim();
  if (sessionId.length === 0 || sessionId.length > MAX_SESSION_ID) {
    throw new PanelRouteError('INVALID_SESSION', 400, 'sessionId is invalid');
  }
  return sessionId;
}

function requireText(value, field, maxLength) {
  if (typeof value !== 'string') throw new PanelRouteError('INVALID_FIELD', 400, field + ' must be a string');
  const text = value.trim();
  if (text.length === 0) throw new PanelRouteError('INVALID_FIELD', 400, field + ' must be non-empty');
  if (text.length > maxLength) throw new PanelRouteError('INVALID_FIELD', 400, field + ' is too long');
  return text;
}

function optionalText(body, field, maxLength, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return undefined;
  const value = body[field];
  if (typeof value !== 'string') throw new PanelRouteError('INVALID_FIELD', 400, field + ' must be a string');
  const text = value.trim();
  if (!options.allowEmpty && text.length === 0) {
    throw new PanelRouteError('INVALID_FIELD', 400, field + ' must be non-empty');
  }
  if (text.length > maxLength) throw new PanelRouteError('INVALID_FIELD', 400, field + ' is too long');
  return text;
}

function optionalStringArray(body, field, maxItems, maxItemLength) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return undefined;
  const value = body[field];
  if (!Array.isArray(value)) throw new PanelRouteError('INVALID_FIELD', 400, field + ' must be an array');
  if (value.length > maxItems) throw new PanelRouteError('INVALID_FIELD', 400, field + ' has too many items');
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new PanelRouteError('INVALID_FIELD', 400, field + ' items must be strings');
    }
    const text = item.trim();
    if (text.length === 0 || text.length > maxItemLength) {
      throw new PanelRouteError('INVALID_FIELD', 400, field + ' contains an invalid item');
    }
    out.push(text);
  }
  return out;
}

function requireRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PanelRouteError('INVALID_FIELD', 400, 'expectedRevision must be a positive integer');
  }
  return value;
}

function requireAction(value) {
  if (typeof value !== 'string' || !TASK_ACTIONS.has(value)) {
    throw new PanelRouteError('INVALID_ACTION', 400, 'action is not a supported task transition');
  }
  return value;
}

function requireContext(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'context')) return 'fresh';
  const value = body.context;
  if (typeof value !== 'string' || !CONTEXTS.has(value)) {
    throw new PanelRouteError('INVALID_FIELD', 400, 'context must be fresh or fork');
  }
  return value;
}

/** Forward the fetch request's AbortSignal when the host provides one. */
function signalOf(request) {
  const signal = request && request.signal;
  if (!signal || typeof signal !== 'object') return undefined;
  if (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function') return undefined;
  return signal;
}

async function resolveCaller(agents, sessionId) {
  if (!agents || typeof agents.get !== 'function') {
    throw new PanelRouteError('SERVICE_UNAVAILABLE', 500, 'Agent service is unavailable');
  }
  const agent = await agents.get(sessionId);
  if (agent === null || agent === undefined) {
    throw new PanelRouteError('AGENT_NOT_LOADED', 404, 'no live agent for this session');
  }
  if (typeof agent !== 'object' || typeof agent.id !== 'string' || agent.id !== sessionId) {
    throw new PanelRouteError('CALLER_MISMATCH', 403, 'session agent identity does not match');
  }
  return agent;
}

/**
 * Build the four POST handlers.
 * @param {{agentTeams?: object, agents?: object, log?: Function}} [deps]
 */
export function createAgentTeamPanelHandlers(deps = {}) {
  const source = deps && typeof deps === 'object' ? deps : {};
  const log = typeof source.log === 'function' ? source.log : null;

  const handle = (routeName, run) => async (request) => {
    if (!request || request.method !== 'POST') {
      return jsonResponse(
        { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'only POST is supported' } },
        405,
        { allow: 'POST' },
      );
    }
    try {
      const body = await readJson(request);
      assertFields(body, ROUTE_FIELDS[routeName]);
      const sessionId = requireSessionId(body);
      const agentTeams = source.agentTeams;
      if (!agentTeams || typeof agentTeams.membership !== 'function') {
        throw new PanelRouteError('SERVICE_UNAVAILABLE', 500, 'Agent Team service is unavailable');
      }
      const agent = await resolveCaller(source.agents, sessionId);
      const membership = agentTeams.membership(agent);
      if (!membership || typeof membership !== 'object') {
        throw new PanelRouteError('NOT_A_MEMBER', 403, 'caller is not an Agent Team member');
      }
      const value = await run({ body, agent, agentTeams, signal: signalOf(request) });
      return jsonResponse(value);
    } catch (error) {
      const normalized = normalizeError(error);
      try {
        if (log) log('warn', 'agent-team-panel route ' + routeName + ' failed: ' + normalized.code);
      } catch {
        /* logging must not change the response */
      }
      return jsonResponse(
        { ok: false, error: { code: normalized.code, message: normalized.message } },
        normalized.status,
      );
    }
  };

  return {
    createTask: handle('createTask', async ({ body, agent, agentTeams }) => {
      const request = {
        subject: requireText(body.subject, 'subject', MAX_SUBJECT),
        description: requireText(body.description, 'description', MAX_DESCRIPTION),
      };
      const blockedBy = optionalStringArray(body, 'blockedBy', MAX_ARRAY_ITEMS, MAX_BLOCKER_ID);
      if (blockedBy !== undefined) request.blockedBy = blockedBy;
      const writeScopes = optionalStringArray(body, 'writeScopes', MAX_ARRAY_ITEMS, MAX_WRITE_SCOPE);
      if (writeScopes !== undefined) request.writeScopes = writeScopes;
      const task = await agentTeams.createTask(agent, request);
      return { ok: true, task };
    }),

    updateTask: handle('updateTask', async ({ body, agent, agentTeams }) => {
      const request = {
        taskId: requireText(body.taskId, 'taskId', MAX_TASK_ID),
        expectedRevision: requireRevision(body.expectedRevision),
        action: requireAction(body.action),
      };
      const subject = optionalText(body, 'subject', MAX_SUBJECT);
      if (subject !== undefined) request.subject = subject;
      const description = optionalText(body, 'description', MAX_DESCRIPTION);
      if (description !== undefined) request.description = description;
      const blockedBy = optionalStringArray(body, 'blockedBy', MAX_ARRAY_ITEMS, MAX_BLOCKER_ID);
      if (blockedBy !== undefined) request.blockedBy = blockedBy;
      const writeScopes = optionalStringArray(body, 'writeScopes', MAX_ARRAY_ITEMS, MAX_WRITE_SCOPE);
      if (writeScopes !== undefined) request.writeScopes = writeScopes;
      const owner = optionalText(body, 'owner', MAX_OWNER, { allowEmpty: true });
      if (owner !== undefined) request.owner = owner;
      const task = await agentTeams.updateTask(agent, request);
      return { ok: true, task };
    }),

    spawnTeammate: handle('spawnTeammate', async ({ body, agent, agentTeams, signal }) => {
      const context = requireContext(body);
      const request = {
        name: requireText(body.name, 'name', MAX_MEMBER_NAME),
        description: requireText(body.description, 'description', MAX_SUBJECT),
        prompt: [{ type: 'text', text: requireText(body.prompt, 'prompt', MAX_PROMPT) }],
        context,
        provider: context === 'fork' ? 'fork' : 'spawn',
        signal,
      };
      const result = await agentTeams.spawnTeammate(agent, request);
      const member = result && typeof result === 'object' && result.member ? result.member : result;
      return { ok: true, member };
    }),

    sendMessage: handle('sendMessage', async ({ body, agent, agentTeams, signal }) => {
      const request = {
        target: requireText(body.target, 'target', MAX_TARGET),
        content: [{ type: 'text', text: requireText(body.message, 'message', MAX_MESSAGE) }],
        signal,
      };
      const result = await agentTeams.sendMessage(agent, request);
      const messageId = result && typeof result.messageId === 'string' ? result.messageId : null;
      return { ok: true, messageId };
    }),
  };
}

/**
 * Register the four exact POST routes when DSH Connection fetch is available.
 * Routes are bound to the injected scope lifetime via `scope.effect`.
 *
 * @param {object} scope injected Cordis scope (or ctx) carrying connection/effect
 * @param {{agentTeams?: object, agents?: object, log?: Function}} deps
 * @param {{log?: Function}} [options]
 * @returns {{registered:boolean, paths:string[], reason?:string}}
 */
export function registerAgentTeamPanelRoutes(scope, deps, options = {}) {
  const connection = scope && (scope.connection || (typeof scope.get === 'function' ? scope.get('connection') : undefined));
  if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') {
    return { registered: false, paths: [], reason: 'connection-unavailable' };
  }
  const base = deps && typeof deps === 'object' ? deps : {};
  const log = typeof options.log === 'function' ? options.log : (typeof base.log === 'function' ? base.log : null);
  const handlers = createAgentTeamPanelHandlers({ ...base, log });
  const entries = [
    [AGENT_TEAM_PANEL_ROUTES.createTask, handlers.createTask],
    [AGENT_TEAM_PANEL_ROUTES.updateTask, handlers.updateTask],
    [AGENT_TEAM_PANEL_ROUTES.spawnTeammate, handlers.spawnTeammate],
    [AGENT_TEAM_PANEL_ROUTES.sendMessage, handlers.sendMessage],
  ];
  const paths = [];
  const disposers = [];
  try {
    for (const [routePath, handler] of entries) {
      const dispose = connection.fetch.register({
        path: routePath,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handler(request),
      });
      if (typeof dispose === 'function') disposers.push(dispose);
      paths.push(routePath);
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) {
      try { dispose(); } catch { /* registration rollback is best effort */ }
    }
    throw error;
  }
  if (typeof scope.effect === 'function') {
    scope.effect(() => () => {
      for (const dispose of disposers.splice(0)) {
        try { dispose(); } catch { /* route cleanup is best effort */ }
      }
    }, 'agent-team-panel-routes');
  }
  return { registered: true, paths };
}
