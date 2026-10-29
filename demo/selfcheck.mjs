#!/usr/bin/env node
/**
 * Reproducible self-check for the demo harness wiring (no browser, no deps).
 *
 * Verifies, with Node's standard library only:
 *   - the fixture wire views match the native agentTeam/goal shapes the client
 *     half reads (independent of the panel's own normalizer);
 *   - the fake sessions service answers exactly the reads readTeamState performs;
 *   - loader capture -> materialize -> apply -> conversation.view registration ->
 *     mount passes the descriptor-injected props plus initialState;
 *   - the URL state matrix used by scripts/shoot.mjs is complete and valid.
 *
 * Run: node demo/selfcheck.mjs
 */
import {
  DEFAULT_STATE,
  STATES,
  createFixture,
  createSessionsService,
  describeFixture,
  DEMO_SESSION_ID,
} from './fixtures.mjs';
import {
  EXPECTED_MODULE_ID,
  createHarnessContext,
  createLoaderCapture,
  findViewRegistration,
  materialize,
  mountRegisteredView,
  parseDemoQuery,
  pickRegistration,
} from './demo.js';

const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail === undefined ? null : detail });
  } catch (error) {
    checks.push({ name, ok: false, error: String((error && error.message) || error) });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SHOOT_STATES = ['overview', 'bundled', 'expanded', 'new-task', 'spawn', 'member'];

check('state matrix covers the screenshot states', () => {
  const missing = SHOOT_STATES.filter((name) => STATES.indexOf(name) === -1);
  assert(missing.length === 0, 'missing states: ' + missing.join(', '));
  assert(STATES.indexOf(DEFAULT_STATE) !== -1, 'default state not in STATES');
  return { states: STATES.length, shootStates: SHOOT_STATES.length };
});

check('fixture wire views match the native agentTeam shape', () => {
  const problems = [];
  for (const state of STATES) {
    const fixture = createFixture(state);
    const view = fixture.view;
    if (view === null) continue;
    if (!Array.isArray(view.members)) { problems.push(state + ': members is not an array'); continue; }
    if (!Array.isArray(view.tasks)) { problems.push(state + ': tasks is not an array'); continue; }
    const memberIds = new Set();
    for (const member of view.members) {
      if (typeof member.id !== 'string' || member.id.length === 0) problems.push(state + ': member without id');
      if (!['lead', 'member', 'teammate'].includes(member.role)) problems.push(state + ': bad member role ' + String(member.role));
      if (typeof member.phase !== 'string') problems.push(state + ': bad member phase');
      memberIds.add(member.id);
    }
    if (!memberIds.has(fixture.sessionId)) problems.push(state + ': current session is not a member');
    const leads = view.members.filter((member) => member.role === 'lead');
    if (leads.length !== 1) problems.push(state + ': expected exactly one lead member, found ' + leads.length);
    if (!leads.some((member) => member.id === fixture.sessionId)) problems.push(state + ': current session is not the lead');
    const taskIds = new Set();
    for (const task of view.tasks) {
      if (typeof task.id !== 'string') problems.push(state + ': task without id');
      taskIds.add(task.id);
      if (!Number.isFinite(task.revision)) problems.push(state + ': task ' + task.id + ' revision is not finite');
      if (typeof task.subject !== 'string' || typeof task.description !== 'string') problems.push(state + ': task ' + task.id + ' text fields');
      if (['pending', 'in_progress', 'completed'].indexOf(task.status) === -1) problems.push(state + ': task ' + task.id + ' status ' + String(task.status));
      if (typeof task.ready !== 'boolean') problems.push(state + ': task ' + task.id + ' ready is not boolean');
      if (!Array.isArray(task.blockedBy) || !Array.isArray(task.writeScopes) || !Array.isArray(task.writeScopeWarnings)) problems.push(state + ': task ' + task.id + ' arrays');
    }
    for (const task of view.tasks) {
      for (const blocker of task.blockedBy) {
        if (!taskIds.has(blocker)) problems.push(state + ': task ' + task.id + ' blockedBy missing blocker ' + blocker);
        if (blocker === task.id) problems.push(state + ': task ' + task.id + ' depends on itself');
      }
      if (task.ownerName !== undefined && !memberIds.has(task.ownerName) && task.ownerName !== undefined) {
        // ownerName is a display name, not a session id; only require it to be a string
        if (typeof task.ownerName !== 'string') problems.push(state + ': task ' + task.id + ' ownerName not a string');
      }
    }
  }
  assert(problems.length === 0, problems.join('; '));
  return { checkedStates: STATES.length };
});

check('fixture goal values match the native goal wire shape', () => {
  const problems = [];
  for (const state of STATES) {
    const fixture = createFixture(state);
    const goal = fixture.goal;
    if (goal === null) continue;
    if (!isObject(goal) || !isObject(goal.goal)) { problems.push(state + ': goal is not { goal: {...} }'); continue; }
    const inner = goal.goal;
    if (typeof inner.id !== 'string') problems.push(state + ': goal.id');
    if (!Number.isFinite(inner.revision)) problems.push(state + ': goal.revision');
    if (typeof inner.objective !== 'string') problems.push(state + ': goal.objective');
    if (typeof inner.phase !== 'string') problems.push(state + ': goal.phase');
    if (!Number.isFinite(inner.roundsStarted) || !Number.isFinite(inner.maxGoalRounds)) problems.push(state + ': goal rounds');
  }
  assert(problems.length === 0, problems.join('; '));
  return { goalStates: STATES.filter((name) => createFixture(name).goal !== null).length };
});

check('bundled state has three dependents of one blocker', () => {
  const view = createFixture('bundled').view;
  const counts = new Map();
  for (const task of view.tasks) {
    for (const blocker of task.blockedBy) counts.set(blocker, (counts.get(blocker) || 0) + 1);
  }
  const best = Math.max.apply(null, Array.from(counts.values()));
  assert(best >= 3, 'no blocker with 3+ dependents (max ' + best + ')');
  return { maxDependents: best, edges: describeFixture(createFixture('bundled')).edges };
});

check('fake sessions service answers the reads readTeamState performs', () => {
  const fixture = createFixture('bundled');
  const sessions = createSessionsService(fixture);
  const snapshot = sessions.binding(fixture.sessionId).session.getSnapshot();
  assert(isObject(snapshot), 'session snapshot missing');
  const leadId = snapshot.subagent && snapshot.subagent.address && snapshot.subagent.address.parentSessionId
    ? snapshot.subagent.address.parentSessionId
    : fixture.sessionId;
  const list = sessions.list.getSnapshot();
  const projection = list.projectionsBySession ? list.projectionsBySession[leadId] : null;
  assert(projection !== null && projection !== undefined, 'no projection for lead ' + leadId);
  assert(projection.values.agentTeam === fixture.view, 'agentTeam projection is not the fixture view');
  assert(projection.values.goal === fixture.goal, 'goal projection is not the fixture goal');
  assert(sessions.binding('someone-else') === null, 'unknown session should not resolve');
  let fired = 0;
  const off = sessions.list.subscribe(() => { fired += 1; });
  sessions.update(createFixture('overview'));
  off();
  assert(fired === 1, 'list subscribe did not fire exactly once (fired ' + fired + ')');
  assert(sessions.list.getSnapshot().projectionsBySession[leadId].values.agentTeam.tasks.length === 5, 'updated projection not visible');
  return { leadId, listeners: sessions.listenerCount() };
});

check('empty and failure states project no team where declared', () => {
  const empty = createFixture('empty');
  assert(empty.view === null && empty.goal === null, 'empty state should project nothing');
  const sessions = createSessionsService(empty);
  const list = sessions.list.getSnapshot();
  assert(Object.keys(list.projectionsBySession).length === 0, 'empty state still has a projection entry');
  const failure = createFixture('failure');
  assert(typeof failure.view.failure === 'string', 'failure state has no failure string');
  return { emptyProjections: 0, failure: failure.view.failure };
});

check('loader capture records the registration instead of instantiating it', () => {
  const target = {};
  const capture = createLoaderCapture(target);
  const factory = () => ({ marker: true });
  target.__ModuleLoader__.load({ id: EXPECTED_MODULE_ID, factory });
  assert(capture.registrations.length === 1, 'registration not captured');
  assert(capture.registrations[0].id === EXPECTED_MODULE_ID, 'registration id changed');
  assert(capture.registrations[0].factory === factory, 'factory reference lost');
  assert(pickRegistration(capture.registrations, EXPECTED_MODULE_ID) !== null, 'expected id not picked');
  const other = createLoaderCapture({});
  other.loader.define({ id: 'something-else', factory });
  other.loader.load({ id: 'third', factory });
  assert(pickRegistration(other.registrations, EXPECTED_MODULE_ID) === null, 'multiple foreign ids should not pick');
  return { captured: capture.registrations.length };
});

check('materialize + apply + conversation.view + mount wiring', () => {
  const React = { createElement(type, props) { return { type, props }; } };
  const ReactDOM = { createRoot(container) { return { render(element) { container.__element = element; } }; } };
  const factory = (require) => {
    const ReactRef = require('react');
    return {
      apply(ctx) {
        ReactRef; // the built client half requires react at apply time
        const sessions = ctx.sessions;
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'agent-team-panel',
          order: 30,
          label: () => 'Agent Team',
          inject: (sessionId) => ({ sessionId, sessions, openSession: ctx.uiWorkspace.openSession }),
        }, function PanelView(props) { return ReactRef.createElement('section', { 'data-props': Object.keys(props).join(',') }); }));
      },
    };
  };
  const registration = { id: EXPECTED_MODULE_ID, factory };
  const materialized = materialize(registration, { React, ReactDOM });
  assert(materialized.ok, 'materialize failed: ' + String(materialized.error));
  const fixture = createFixture('expanded');
  const sessions = createSessionsService(fixture);
  const records = [];
  const context = createHarnessContext({ sessions, records });
  materialized.exports.apply(context.ctx);
  const viewRecord = findViewRegistration(records);
  assert(viewRecord !== null, 'no conversation.view registration recorded');
  assert(viewRecord.descriptor.inject !== undefined, 'descriptor inject missing');
  const container = {};
  const mounted = mountRegisteredView({
    React, ReactDOM, container, record: viewRecord, sessions,
    sessionId: fixture.sessionId, initialState: fixture.initialState,
  });
  assert(mounted.ok, 'mount failed');
  assert(container.__element && typeof container.__element.type === 'function', 'react element not rendered');
  const props = container.__element.props;
  assert(props.sessionId === fixture.sessionId, 'sessionId not injected');
  assert(props.sessions === sessions, 'sessions not injected');
  assert(props.initialState === fixture.initialState, 'initialState not passed');
  assert(Array.isArray(props.initialState.expanded) && typeof props.initialState.expanded[0] === 'string', 'expanded state lost');
  assert(props.initialState.expanded[0] === fixture.initialState.expanded[0], 'expanded id does not match the fixture');
  return { slots: records.map((item) => item.kind), props: Object.keys(props) };
});

check('materialize rejects unknown requires instead of returning undefined', () => {
  const result = materialize({ id: 'x', factory: (require) => { require('lodash'); } }, { React: {}, ReactDOM: {} });
  assert(result.ok === false, 'unknown require should fail');
  assert(/unsupported module/u.test(result.error), 'error does not name the unsupported module: ' + String(result.error));
  return { error: result.error };
});

check('URL state parsing is strict and falls back', () => {
  assert(parseDemoQuery('').state === DEFAULT_STATE, 'empty query should use the default');
  assert(parseDemoQuery('?state=bundled').state === 'bundled', 'bundled not parsed');
  const unknown = parseDemoQuery('?state=nope');
  assert(unknown.state === DEFAULT_STATE && unknown.unknownState === true, 'unknown state should be flagged and fall back');
  assert(parseDemoQuery('?state=spawn&client=./x.js').clientUrl === './x.js', 'client override lost');
  assert(parseDemoQuery('?state=spawn&badge=0').badge === false, 'badge=0 not parsed');
  return { default: DEFAULT_STATE };
});

check('every state fixture has a mountable initialState', () => {
  const problems = [];
  for (const state of STATES) {
    const fixture = createFixture(state);
    const initial = fixture.initialState;
    if (!isObject(initial)) { problems.push(state + ': initialState not an object'); continue; }
    if (initial.modal !== undefined) {
      const kind = initial.modal && initial.modal.kind;
      if (['new-task', 'spawn', 'message', 'edit'].indexOf(kind) === -1) problems.push(state + ': bad modal kind ' + String(kind));
    }
    if (initial.expanded !== undefined && !Array.isArray(initial.expanded)) problems.push(state + ': expanded not an array');
    if (initial.selected !== undefined && typeof initial.selected !== 'string') problems.push(state + ': selected not a string');
  }
  assert(problems.length === 0, problems.join('; '));
  return { states: STATES.length };
});

check('shoot-visible states carry a summary', () => {
  const rows = SHOOT_STATES.map((state) => describeFixture(createFixture(state)));
  for (const row of rows) {
    assert(row.tasks > 0, row.state + ': screenshot state has no tasks');
    assert(row.members > 0, row.state + ': screenshot state has no members');
  }
  return { rows: rows.map((row) => row.state + ':' + row.tasks + 't/' + row.edges + 'e') };
});

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  script: 'demo/selfcheck.mjs',
  checked: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  sessionId: DEMO_SESSION_ID,
  checks,
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
