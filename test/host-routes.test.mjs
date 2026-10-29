/**
 * Host route tests — native Agent Team write routes.
 *
 * These tests use fakes only: no DSH process, no native service, no network.
 * They assert the exact native TeamService argument shape, exact live-agent
 * caller resolution, stable HTTP error mapping, the request envelope limits,
 * and route registration/cleanup.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_TEAM_PANEL_ROUTES,
  createAgentTeamPanelHandlers,
  registerAgentTeamPanelRoutes,
} from '../src/host-routes.mjs';

const SESSION = 'session-1';

function makeAgent(sessionId = SESSION) {
  return { id: sessionId, status: 'idle', session: { header: {} }, options: {} };
}

function panelRequest(body, options = {}) {
  const text = options.raw !== undefined ? options.raw : JSON.stringify(body);
  const headers = {
    'content-type': 'application/json',
    'x-agent-team-panel': '1',
    ...(options.headers || {}),
  };
  for (const key of Object.keys(headers)) {
    if (headers[key] === null) delete headers[key];
  }
  return {
    method: options.method || 'POST',
    url: 'http://127.0.0.1:1/api/agent-team-panel.test',
    signal: options.signal,
    headers: {
      get(name) {
        const wanted = String(name).toLowerCase();
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === wanted) return value;
        }
        return null;
      },
    },
    text: async () => text,
  };
}

function teamService(overrides = {}) {
  const calls = {
    membership: [],
    createTask: [],
    updateTask: [],
    spawnTeammate: [],
    sendMessage: [],
  };
  return {
    calls,
    membership(agent) {
      calls.membership.push(agent);
      if (overrides.membership) return overrides.membership(agent);
      return { root: { id: agent.id }, id: agent.id, name: 'lead', role: 'lead' };
    },
    async createTask(agent, request) {
      calls.createTask.push({ agent, request });
      if (overrides.createTask) return overrides.createTask(agent, request);
      return { id: 'task-1', revision: 1, ...request };
    },
    async updateTask(agent, request) {
      calls.updateTask.push({ agent, request });
      if (overrides.updateTask) return overrides.updateTask(agent, request);
      return { id: request.taskId, revision: request.expectedRevision + 1, ...request };
    },
    async spawnTeammate(agent, request) {
      calls.spawnTeammate.push({ agent, request });
      if (overrides.spawnTeammate) return overrides.spawnTeammate(agent, request);
      return { member: { id: 'child-1', name: request.name, role: 'teammate', context: request.context } };
    },
    async sendMessage(agent, request) {
      calls.sendMessage.push({ agent, request });
      if (overrides.sendMessage) return overrides.sendMessage(agent, request);
      return { messageId: 'msg-1' };
    },
  };
}

function setup(overrides = {}) {
  const agent = Object.prototype.hasOwnProperty.call(overrides, 'agent') ? overrides.agent : makeAgent();
  const agents = {
    calls: [],
    get(sessionId) {
      this.calls.push(sessionId);
      if (overrides.getAgent) return overrides.getAgent(sessionId);
      return agent;
    },
  };
  const team = overrides.team || teamService(overrides.teamOverrides);
  const handlers = createAgentTeamPanelHandlers({
    agentTeams: team,
    agents,
    log: overrides.log || (() => {}),
  });
  return { agent, agents, team, handlers };
}

async function invoke(handler, request) {
  const response = await handler(request);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body, text };
}

function assertError(result, status, code) {
  assert.equal(result.response.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, 'string');
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
}

function nativeError(code, message = 'native failure') {
  return Object.assign(new Error(message), { name: 'TeamError', code });
}

test('route constants are the exact four owner routes', () => {
  assert.deepEqual(AGENT_TEAM_PANEL_ROUTES, {
    createTask: '/api/agent-team-panel.task.create',
    updateTask: '/api/agent-team-panel.task.update',
    spawnTeammate: '/api/agent-team-panel.teammate.spawn',
    sendMessage: '/api/agent-team-panel.message.send',
  });
  assert.ok(Object.isFrozen(AGENT_TEAM_PANEL_ROUTES));
});

test('task.create resolves the exact live agent and calls createTask once', async () => {
  const { handlers, agent, agents, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: '  Build the graph  ',
    description: '  Render nodes and edges  ',
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    task: { id: 'task-1', revision: 1, subject: 'Build the graph', description: 'Render nodes and edges' },
  });
  assert.deepEqual(agents.calls, [SESSION]);
  assert.equal(team.calls.membership.length, 1);
  assert.equal(team.calls.membership[0], agent);
  assert.deepEqual(team.calls.createTask, [{
    agent,
    request: { subject: 'Build the graph', description: 'Render nodes and edges' },
  }]);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.match(result.response.headers.get('content-type'), /application\/json/);
});

test('task.create forwards blockedBy and writeScopes when present', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
    blockedBy: ['task-1', 'task-2'],
    writeScopes: ['src/**', 'docs/**'],
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.createTask[0].request, {
    subject: 'Task',
    description: 'Details',
    blockedBy: ['task-1', 'task-2'],
    writeScopes: ['src/**', 'docs/**'],
  });
});

test('task.create forwards empty dependency/scope arrays exactly as the panel sends them', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
    blockedBy: [],
    writeScopes: [],
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.createTask[0].request, {
    subject: 'Task',
    description: 'Details',
    blockedBy: [],
    writeScopes: [],
  });
});

test('task.update forwards the complete native updateTask request', async () => {
  const { handlers, agent, team } = setup();
  const result = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 3,
    action: 'edit',
    subject: 'New subject',
    description: 'New details',
    blockedBy: ['task-1'],
    writeScopes: ['src/panel.js'],
    owner: 'reviewer',
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.updateTask, [{
    agent,
    request: {
      taskId: 'task-7',
      expectedRevision: 3,
      action: 'edit',
      subject: 'New subject',
      description: 'New details',
      blockedBy: ['task-1'],
      writeScopes: ['src/panel.js'],
      owner: 'reviewer',
    },
  }]);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.task.id, 'task-7');
});

test('task.update claim sends only the required native fields', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 2,
    action: 'claim',
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.updateTask[0].request, {
    taskId: 'task-7',
    expectedRevision: 2,
    action: 'claim',
  });
});

test('teammate.spawn defaults context to fresh, wraps prompt and derives provider', async () => {
  const { handlers, agent, team } = setup();
  const result = await invoke(handlers.spawnTeammate, panelRequest({
    sessionId: SESSION,
    name: 'reviewer',
    description: '  Review changes  ',
    prompt: '  Read the diff and report.  ',
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.spawnTeammate, [{
    agent,
    request: {
      name: 'reviewer',
      description: 'Review changes',
      prompt: [{ type: 'text', text: 'Read the diff and report.' }],
      context: 'fresh',
      provider: 'spawn',
      signal: undefined,
    },
  }]);
  assert.deepEqual(result.body, {
    ok: true,
    member: { id: 'child-1', name: 'reviewer', role: 'teammate', context: 'fresh' },
  });
});

test('teammate.spawn fork uses the fork provider exactly', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.spawnTeammate, panelRequest({
    sessionId: SESSION,
    name: 'reviewer',
    description: 'Review',
    prompt: 'Prompt',
    context: 'fork',
  }));

  assert.equal(result.response.status, 200);
  assert.equal(team.calls.spawnTeammate[0].request.context, 'fork');
  assert.equal(team.calls.spawnTeammate[0].request.provider, 'fork');
  assert.deepEqual(team.calls.spawnTeammate[0].request.prompt, [{ type: 'text', text: 'Prompt' }]);
});

test('message.send wraps the message and forwards the native sendMessage shape', async () => {
  const { handlers, agent, team } = setup();
  const result = await invoke(handlers.sendMessage, panelRequest({
    sessionId: SESSION,
    target: 'lead',
    message: '  hello team  ',
  }));

  assert.equal(result.response.status, 200);
  assert.deepEqual(team.calls.sendMessage, [{
    agent,
    request: {
      target: 'lead',
      content: [{ type: 'text', text: 'hello team' }],
      signal: undefined,
    },
  }]);
  assert.deepEqual(result.body, { ok: true, messageId: 'msg-1' });
});

test('spawn/send forward the fetch AbortSignal when available', async () => {
  const { handlers, team } = setup();
  const controller = new AbortController();
  const spawnResult = await invoke(handlers.spawnTeammate, panelRequest({
    sessionId: SESSION,
    name: 'reviewer',
    description: 'Review',
    prompt: 'Prompt',
  }, { signal: controller.signal }));
  const sendResult = await invoke(handlers.sendMessage, panelRequest({
    sessionId: SESSION,
    target: 'reviewer',
    message: 'Hello',
  }, { signal: controller.signal }));

  assert.equal(spawnResult.response.status, 200);
  assert.equal(sendResult.response.status, 200);
  assert.equal(team.calls.spawnTeammate[0].request.signal, controller.signal);
  assert.equal(team.calls.sendMessage[0].request.signal, controller.signal);
});

test('missing sessionId is rejected before membership or native calls', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    subject: 'Task',
    description: 'Details',
  }));

  assertError(result, 400, 'INVALID_SESSION');
  assert.equal(team.calls.membership.length, 0);
  assert.equal(team.calls.createTask.length, 0);
});

test('an over-long sessionId is rejected', async () => {
  const { handlers } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: 's'.repeat(201),
    subject: 'Task',
    description: 'Details',
  }));
  assertError(result, 400, 'INVALID_SESSION');
});

test('a session without a live agent is a 404 and never checks membership', async () => {
  const { handlers, team, agents } = setup({ agent: null });
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }));

  assertError(result, 404, 'AGENT_NOT_LOADED');
  assert.deepEqual(agents.calls, [SESSION]);
  assert.equal(team.calls.membership.length, 0);
  assert.equal(team.calls.createTask.length, 0);
});

test('an agent bound to another session is rejected instead of being upgraded', async () => {
  const { handlers, team } = setup({ agent: makeAgent('session-other') });
  const result = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 1,
    action: 'claim',
  }));

  assertError(result, 403, 'CALLER_MISMATCH');
  assert.equal(team.calls.membership.length, 0);
  assert.equal(team.calls.updateTask.length, 0);
});

test('a non-member agent is a 403 and no native mutation runs', async () => {
  const team = teamService({
    membership() {
      throw nativeError('TEAM_NOT_MEMBER', 'agent is not a member');
    },
  });
  const { handlers } = setup({ team });
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }));

  assertError(result, 403, 'NOT_A_MEMBER');
  assert.equal(team.calls.createTask.length, 0);
});

test('an invalid task action is a 400 before updateTask runs', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 1,
    action: 'dance',
  }));

  assertError(result, 400, 'INVALID_ACTION');
  assert.equal(team.calls.updateTask.length, 0);
});

test('invalid expectedRevision and empty native fields are 400s', async () => {
  const { handlers, team } = setup();
  const revisionResult = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 0,
    action: 'claim',
  }));
  assertError(revisionResult, 400, 'INVALID_FIELD');

  const messageResult = await invoke(handlers.sendMessage, panelRequest({
    sessionId: SESSION,
    target: 'lead',
    message: '   ',
  }));
  assertError(messageResult, 400, 'INVALID_FIELD');

  const contextResult = await invoke(handlers.spawnTeammate, panelRequest({
    sessionId: SESSION,
    name: 'reviewer',
    description: 'Review',
    prompt: 'Prompt',
    context: 'inherit',
  }));
  assertError(contextResult, 400, 'INVALID_FIELD');

  assert.equal(team.calls.updateTask.length, 0);
  assert.equal(team.calls.sendMessage.length, 0);
  assert.equal(team.calls.spawnTeammate.length, 0);
});

test('over-long task fields are rejected with 400', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'x'.repeat(201),
    description: 'Details',
  }));

  assertError(result, 400, 'INVALID_FIELD');
  assert.equal(team.calls.createTask.length, 0);
});

test('a non-array blockedBy is rejected with 400', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
    blockedBy: 'task-1',
  }));

  assertError(result, 400, 'INVALID_FIELD');
  assert.equal(team.calls.createTask.length, 0);
});

test('stale revision maps to 409 STALE_REVISION', async () => {
  const team = teamService({
    updateTask() {
      throw nativeError('TEAM_TASK_STALE_REVISION', 'stale task revision');
    },
  });
  const { handlers } = setup({ team });
  const result = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-7',
    expectedRevision: 1,
    action: 'claim',
  }));

  assertError(result, 409, 'STALE_REVISION');
});

test('blocked, transition and dependent conflicts map to 409', async () => {
  const cases = [
    ['TEAM_TASK_BLOCKED', 'TASK_BLOCKED'],
    ['TEAM_TASK_INVALID_TRANSITION', 'INVALID_TRANSITION'],
    ['TEAM_TASK_HAS_DEPENDENTS', 'TASK_HAS_DEPENDENTS'],
    ['TEAM_TASK_ALREADY_CLAIMED', 'TASK_ALREADY_CLAIMED'],
  ];
  for (const [nativeCode, code] of cases) {
    const team = teamService({
      updateTask() {
        throw nativeError(nativeCode);
      },
    });
    const { handlers } = setup({ team });
    const result = await invoke(handlers.updateTask, panelRequest({
      sessionId: SESSION,
      taskId: 'task-7',
      expectedRevision: 1,
      action: 'claim',
    }));
    assertError(result, 409, code);
  }
});

test('permission and authorization errors map to 403', async () => {
  const cases = [
    ['TEAM_LEAD_REQUIRED', 'LEAD_REQUIRED'],
    ['TEAM_TASK_UNAUTHORIZED', 'FORBIDDEN'],
  ];
  for (const [nativeCode, code] of cases) {
    const team = teamService({
      updateTask() {
        throw nativeError(nativeCode);
      },
    });
    const { handlers } = setup({ team });
    const result = await invoke(handlers.updateTask, panelRequest({
      sessionId: SESSION,
      taskId: 'task-7',
      expectedRevision: 1,
      action: 'claim',
    }));
    assertError(result, 403, code);
  }
});

test('task/member not found maps to 404', async () => {
  const team = teamService({
    updateTask() {
      throw nativeError('TEAM_TASK_NOT_FOUND');
    },
    sendMessage() {
      throw nativeError('TEAM_MEMBER_NOT_FOUND');
    },
  });
  const { handlers } = setup({ team });
  const taskResult = await invoke(handlers.updateTask, panelRequest({
    sessionId: SESSION,
    taskId: 'task-404',
    expectedRevision: 1,
    action: 'claim',
  }));
  const memberResult = await invoke(handlers.sendMessage, panelRequest({
    sessionId: SESSION,
    target: 'ghost',
    message: 'Hello',
  }));

  assertError(taskResult, 404, 'TASK_NOT_FOUND');
  assertError(memberResult, 404, 'MEMBER_NOT_FOUND');
});

test('messaging self maps to 400 INVALID_TARGET', async () => {
  const team = teamService({
    sendMessage() {
      throw nativeError('TEAM_SELF_MESSAGE');
    },
  });
  const { handlers } = setup({ team });
  const result = await invoke(handlers.sendMessage, panelRequest({
    sessionId: SESSION,
    target: 'lead',
    message: 'Hello',
  }));
  assertError(result, 400, 'INVALID_TARGET');
});

test('unexpected failures are a safe 500 without native messages, paths or stacks', async () => {
  const secret = new Error('boom at C:\\secret\\team.js:42');
  secret.stack = 'Error: boom\n    at C:\\secret\\team.js:42:1';
  const team = teamService({
    createTask() {
      throw secret;
    },
  });
  const { handlers } = setup({ team });
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }));

  assertError(result, 500, 'INTERNAL_ERROR');
  assert.equal(result.body.error.message, 'Agent Team request failed');
  assert.ok(!result.text.includes('secret'));
  assert.ok(!result.text.includes('stack'));
  assert.ok(!result.text.includes('boom at'));
});

test('a missing Agent Team service fails closed with a safe 500', async () => {
  const agent = makeAgent();
  const handlers = createAgentTeamPanelHandlers({ agents: { get: () => agent } });
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }));
  assertError(result, 500, 'SERVICE_UNAVAILABLE');
});

test('only POST is accepted; other methods are 405 with Allow', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest(null, { method: 'GET' }));

  assert.equal(result.response.status, 405);
  assert.equal(result.body.error.code, 'METHOD_NOT_ALLOWED');
  assert.equal(result.response.headers.get('allow'), 'POST');
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(team.calls.membership.length, 0);
});

test('content-type must be application/json', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }, { headers: { 'content-type': 'text/plain' } }));

  assertError(result, 400, 'INVALID_CONTENT_TYPE');
  assert.equal(team.calls.createTask.length, 0);
});

test('the x-agent-team-panel: 1 header is required', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }, { headers: { 'x-agent-team-panel': null } }));

  assertError(result, 400, 'MISSING_PANEL_HEADER');
  assert.equal(team.calls.createTask.length, 0);
});

test('request bodies larger than 64 KiB are rejected', async () => {
  const { handlers, team } = setup();
  const body = {
    sessionId: SESSION,
    subject: 'Task',
    description: 'x'.repeat(65536),
  };
  const result = await invoke(handlers.createTask, panelRequest(body));

  assertError(result, 400, 'BODY_TOO_LARGE');
  assert.equal(team.calls.createTask.length, 0);
});

test('a declared content-length over the cap is rejected before reading', async () => {
  const { handlers } = setup();
  let read = false;
  const request = panelRequest({ sessionId: SESSION }, {
    headers: { 'content-length': '70000' },
  });
  request.text = async () => {
    read = true;
    return '{}';
  };
  const result = await invoke(handlers.createTask, request);

  assertError(result, 400, 'BODY_TOO_LARGE');
  assert.equal(read, false);
});

test('unknown request fields are rejected by the whitelist', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
    path: '/etc/passwd',
  }));

  assertError(result, 400, 'UNKNOWN_FIELD');
  assert.equal(team.calls.createTask.length, 0);
});

test('invalid JSON is rejected with 400', async () => {
  const { handlers, team } = setup();
  const result = await invoke(handlers.createTask, panelRequest(undefined, { raw: '{' }));

  assertError(result, 400, 'INVALID_JSON');
  assert.equal(team.calls.createTask.length, 0);
});

function fakeScope(options = {}) {
  const registrations = [];
  const disposals = [];
  let effectCallback = null;
  let effectLabel = null;
  let effectCalls = 0;
  const connection = {
    fetch: {
      register(entry) {
        if (options.throwOn && options.throwOn === registrations.length + 1) {
          throw new Error('route conflict');
        }
        registrations.push(entry);
        return () => disposals.push(entry.path);
      },
    },
  };
  const scope = {
    connection: options.connection === false ? undefined : connection,
    effect(fn, label) {
      effectCalls += 1;
      effectCallback = fn;
      effectLabel = label;
    },
  };
  return {
    scope,
    registrations,
    disposals,
    get effectCallback() { return effectCallback; },
    get effectLabel() { return effectLabel; },
    get effectCalls() { return effectCalls; },
  };
}

test('registration mounts four exact POST routes and scope.effect removes them', async () => {
  const team = teamService();
  const agent = makeAgent();
  const fake = fakeScope();
  const result = registerAgentTeamPanelRoutes(fake.scope, {
    agentTeams: team,
    agents: { get: () => agent },
  });

  assert.deepEqual(result, {
    registered: true,
    paths: Object.values(AGENT_TEAM_PANEL_ROUTES),
  });
  assert.equal(fake.registrations.length, 4);
  assert.equal(fake.effectCalls, 1);
  assert.equal(fake.effectLabel, 'agent-team-panel-routes');
  for (const entry of fake.registrations) {
    assert.deepEqual(entry.methods, ['POST']);
    assert.equal(entry.requestBody, 'buffered');
    assert.equal(typeof entry.fetch, 'function');
  }

  const response = await fake.registrations[0].fetch(panelRequest({
    sessionId: SESSION,
    subject: 'Task',
    description: 'Details',
  }));
  assert.equal(response.status, 200);

  const cleanup = fake.effectCallback();
  assert.deepEqual(fake.disposals, []);
  cleanup();
  assert.deepEqual(fake.disposals, Object.values(AGENT_TEAM_PANEL_ROUTES));
});

test('registration resolves connection through scope.get as well', () => {
  const fake = fakeScope({ connection: false });
  fake.scope.get = (name) => (name === 'connection' ? {
    fetch: {
      register(entry) {
        fake.registrations.push(entry);
        return () => fake.disposals.push(entry.path);
      },
    },
  } : undefined);
  const result = registerAgentTeamPanelRoutes(fake.scope, {
    agentTeams: teamService(),
    agents: { get: () => makeAgent() },
  });
  assert.equal(result.registered, true);
  assert.equal(fake.registrations.length, 4);
});

test('registration without a connection fetch skips safely', () => {
  let effectCalls = 0;
  const scope = {
    effect() { effectCalls += 1; },
  };
  const result = registerAgentTeamPanelRoutes(scope, {
    agentTeams: teamService(),
    agents: { get: () => makeAgent() },
  });

  assert.deepEqual(result, {
    registered: false,
    paths: [],
    reason: 'connection-unavailable',
  });
  assert.equal(effectCalls, 0);
});

test('a partial registration failure rolls back the routes already mounted', () => {
  const fake = fakeScope({ throwOn: 2 });
  let error = null;
  try {
    registerAgentTeamPanelRoutes(fake.scope, {
      agentTeams: teamService(),
      agents: { get: () => makeAgent() },
    });
  } catch (caught) {
    error = caught;
  }

  assert.ok(error);
  assert.match(error.message, /route conflict/);
  assert.deepEqual(fake.disposals, [AGENT_TEAM_PANEL_ROUTES.createTask]);
  assert.equal(fake.effectCalls, 0);
});
