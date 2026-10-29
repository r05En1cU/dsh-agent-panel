/**
 * Built-browser-half smoke test: ModuleLoader id, apply registration, native
 * projection reader, and the pure graph/geometry exports bundled by build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

function loadClient() {
  let captured = null;
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window: null,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    __ModuleLoader__: { load(definition) { captured = definition; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(captured, 'ModuleLoader.load must be called');
  const reactStub = {
    createElement: () => null,
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: (factory) => factory(),
    useRef: (initial) => ({ current: initial }),
    useCallback: (fn) => fn,
    Fragment: Symbol('Fragment'),
  };
  const exports = captured.factory((specifier) => {
    if (specifier === 'react') return reactStub;
    throw new Error('unexpected require ' + specifier);
  });
  return { captured, exports, reactStub };
}

function fakeSessions(view) {
  const state = {
    phase: 'ready',
    projectionsBySession: {
      'session-lead': { values: { agentTeam: view, goal: { goal: { id: 'goal_1', revision: 2, objective: 'Ship the panel', phase: 'active', roundsStarted: 1, maxGoalRounds: 8 } } } },
    },
  };
  return {
    state,
    list: { getSnapshot: () => state, subscribe: () => () => {} },
    binding: (sessionId) => ({
      session: { getSnapshot: () => ({ subagent: sessionId === 'session-child' ? { address: { parentSessionId: 'session-lead' } } : null }) },
    }),
  };
}

const VIEW = {
  members: [
    { id: 'session-lead', name: 'lead', role: 'lead', phase: 'active' },
    { id: 'session-child', name: 'reviewer', role: 'teammate', phase: 'active' },
  ],
  tasks: [
    { id: 'task-1', revision: 1, subject: 'Root', description: 'root task', status: 'pending', blockedBy: [], writeScopes: [], ownerName: 'lead', ready: true, writeScopeWarnings: [] },
    { id: 'task-2', revision: 2, subject: 'Review', description: 'review work', status: 'in_progress', blockedBy: ['task-1'], writeScopes: ['src/**'], ownerName: 'reviewer', ready: false, writeScopeWarnings: [] },
  ],
};

test('[client-build] ModuleLoader id, exports and one conversation.view registration', () => {
  const { captured, exports } = loadClient();
  assert.equal(captured.id, 'dsh-plugin-agent-team-panel');
  assert.equal(typeof exports.apply, 'function');
  assert.equal(Array.from(exports.inject).join(','), 'sessions,slots,uiWorkspace');
  const registrations = [];
  const sessions = fakeSessions(VIEW);
  exports.apply({
    sessions,
    uiWorkspace: { openSession() {} },
    slots: {
      inject(name, callback) { assert.equal(name, 'conversation.view'); return callback(); },
      register(options, component) { registrations.push({ options, component }); return () => {}; },
    },
  });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.id, 'agent-team-panel');
  assert.equal(registrations[0].options.label(), 'Agent Team');
  const injected = registrations[0].options.inject('session-lead');
  assert.equal(injected.sessions, sessions);
  assert.equal(typeof injected.openSession, 'function');
});

test('[client-build] readTeamState resolves lead, agentTeam and goal projections', () => {
  const { exports } = loadClient();
  const sessions = fakeSessions(VIEW);
  const lead = exports.__test.readTeamState(sessions, 'session-child');
  assert.equal(lead.leadId, 'session-lead');
  assert.equal(lead.team.tasks.length, 2);
  assert.equal(lead.goal.goal.id, 'goal_1');
});

test('[client-build] bundled model + geometry preserve bundles and native stages', () => {
  const { exports } = loadClient();
  const normalized = exports.__test.normalizeTeamView(VIEW, { goal: null, sessionId: 'session-lead' });
  assert.equal(normalized.tasks[1].stage, 'active');
  assert.equal(normalized.tasks[0].stage, 'ready');
  const graph = exports.__test.buildTeamGraph(normalized);
  const layout = exports.__test.layoutTeamGraph(graph);
  assert.equal(layout.boxes.length, 4);
  const routed = exports.__test.routeTeamEdges(graph, layout);
  assert.equal(routed.edges.length, 1);
  assert.equal(routed.bundles.length, 0);
  assert.match(routed.edges[0].d, /^M /);
});
