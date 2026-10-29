import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGES,
  deriveStage,
  normalizeGoal,
  normalizeTeamView,
  buildTeamGraph,
} from '../src/model.mjs';

const GOAL = {
  goal: {
    id: 'goal-1',
    revision: 3,
    objective: 'Ship the native Agent Team panel',
    phase: 'active',
    roundsStarted: 2,
    maxGoalRounds: 8,
  },
};

// One realistic native agentTeam wire view: synthetic lead member, two teammates, and
// four task views. task-3 repeats a blocker and names a blocker that is not in the view;
// task-4 names a missing blocker too.
const WIRE = {
  members: [
    { id: 'sess-lead', name: 'lead', role: 'lead', phase: 'active' },
    { id: 'sess-ada', name: 'ada', role: 'teammate', phase: 'active' },
    { id: 'sess-grace', name: 'grace', role: 'teammate', phase: 'failed', error: 'graph crashed' },
  ],
  tasks: [
    {
      id: 'task-1',
      revision: 1,
      subject: 'Survey native team',
      description: 'Read the projection wire view.',
      status: 'completed',
      blockedBy: [],
      writeScopes: [],
      ownerName: 'lead',
      ready: false,
      writeScopeWarnings: [],
    },
    {
      id: 'task-2',
      revision: 2,
      subject: 'Build graph model',
      description: 'Normalize and shape.',
      status: 'in_progress',
      blockedBy: ['task-1'],
      writeScopes: ['src/model.mjs'],
      ownerName: 'ada',
      ready: false,
      writeScopeWarnings: [],
    },
    {
      id: 'task-3',
      revision: 1,
      subject: 'Route bundled edges',
      description: '',
      status: 'pending',
      blockedBy: ['task-1', 'task-1', 'task-404'],
      writeScopes: [],
      ready: true,
      writeScopeWarnings: ['write scopes overlap with task-2'],
    },
    {
      id: 'task-4',
      revision: 1,
      subject: 'Write the docs',
      description: '',
      status: 'pending',
      blockedBy: ['task-2', 'task-9'],
      writeScopes: [],
      ready: false,
      writeScopeWarnings: [],
    },
  ],
};

const EMPTY_STATS = {
  members: 0,
  tasks: 0,
  ready: 0,
  blocked: 0,
  active: 0,
  done: 0,
  blockedByEdges: 0,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function taskById(normalized, id) {
  return normalized.tasks.find((task) => task.id === id);
}

function nodeById(graph, id) {
  return graph.nodes.find((node) => node.id === id);
}

test('STAGES exposes the four render stages in order', () => {
  assert.deepEqual([...STAGES], ['blocked', 'ready', 'active', 'done']);
});

test('deriveStage maps native status/ready to the four stages', () => {
  assert.equal(deriveStage({ status: 'completed' }), 'done');
  assert.equal(deriveStage({ status: 'in_progress' }), 'active');
  assert.equal(deriveStage({ status: 'pending', ready: true }), 'ready');
  assert.equal(deriveStage({ status: 'pending', ready: false }), 'blocked');
  assert.equal(deriveStage({ status: 'pending' }), 'blocked');
  assert.equal(deriveStage({ status: 'deleted' }), 'blocked');
  assert.equal(deriveStage({ status: 'scheduled', ready: true }), 'blocked');
  assert.equal(deriveStage(null), 'blocked');
});

test('empty views normalize to an empty team without inventing data', () => {
  for (const view of [null, undefined, { members: [], tasks: [] }, 'not-a-view']) {
    const normalized = normalizeTeamView(view);
    assert.equal(normalized.ok, true);
    assert.equal(normalized.failure, null);
    assert.equal(normalized.sessionId, null);
    assert.equal(normalized.leadId, null);
    assert.equal(normalized.currentMember, null);
    assert.equal(normalized.isLead, false);
    assert.equal(normalized.canReassign, false);
    assert.equal(normalized.canSpawn, false);
    assert.deepEqual(normalized.members, []);
    assert.deepEqual(normalized.tasks, []);
    assert.deepEqual(normalized.edges, []);
    assert.equal(normalized.goal, null);
    assert.deepEqual(normalized.stats, EMPTY_STATS);
  }
});

test('a projection failure is surfaced and keeps whatever wire data exists', () => {
  const normalized = normalizeTeamView({
    members: [{ id: 'sess-1', name: 'lead', role: 'lead', phase: 'active' }],
    tasks: [],
    failure: 'team event rejected',
  });
  assert.equal(normalized.ok, false);
  assert.equal(normalized.failure, 'team event rejected');
  assert.equal(normalized.leadId, 'sess-1');
  assert.equal(normalized.members[0].isLead, true);
});

test('a native wire view normalizes members, tasks, stages, stats, and edges', () => {
  const normalized = normalizeTeamView(WIRE);

  assert.equal(normalized.ok, true);
  assert.equal(normalized.leadId, 'sess-lead');
  assert.equal(normalized.isLead, false);
  assert.equal(normalized.currentMember, null);
  assert.equal(normalized.canReassign, false);
  assert.equal(normalized.canSpawn, false);

  assert.deepEqual(
    normalized.members.map((member) => [member.id, member.name, member.role, member.phase, member.isLead, member.isCurrent]),
    [
      ['sess-lead', 'lead', 'lead', 'active', true, false],
      ['sess-ada', 'ada', 'teammate', 'active', false, false],
      ['sess-grace', 'grace', 'teammate', 'failed', false, false],
    ],
  );
  assert.equal(normalized.members[2].error, 'graph crashed');
  assert.equal(normalized.members[0].error, undefined);

  const task1 = taskById(normalized, 'task-1');
  assert.equal(task1.stage, 'done');
  assert.equal(task1.target, 'lead');
  assert.equal(task1.revision, 1);
  assert.equal(task1.ownerName, 'lead');
  assert.deepEqual(task1.blockedBy, []);
  assert.equal(task1.goalBound, false);

  const task2 = taskById(normalized, 'task-2');
  assert.equal(task2.stage, 'active');
  assert.equal(task2.target, 'ada');
  assert.deepEqual(task2.blockedBy, ['task-1']);
  assert.deepEqual(task2.writeScopes, ['src/model.mjs']);

  const task3 = taskById(normalized, 'task-3');
  assert.equal(task3.stage, 'ready');
  assert.equal(task3.target, 'unowned');
  assert.equal(task3.ownerName, null);
  assert.deepEqual(task3.blockedBy, ['task-1', 'task-404']);
  assert.deepEqual(task3.writeScopeWarnings, ['write scopes overlap with task-2']);

  const task4 = taskById(normalized, 'task-4');
  assert.equal(task4.stage, 'blocked');
  assert.deepEqual(task4.blockedBy, ['task-2', 'task-9']);

  assert.deepEqual(normalized.stats, {
    members: 3,
    tasks: 4,
    ready: 1,
    blocked: 1,
    active: 1,
    done: 1,
    blockedByEdges: 3,
  });

  assert.deepEqual(normalized.edges, [
    { id: 'blockedBy:task-2:task-1', type: 'blockedBy', taskId: 'task-2', blockerId: 'task-1' },
    { id: 'blockedBy:task-3:task-1', type: 'blockedBy', taskId: 'task-3', blockerId: 'task-1' },
    { id: 'blockedBy:task-4:task-2', type: 'blockedBy', taskId: 'task-4', blockerId: 'task-2' },
  ]);
});

test('unknown statuses stay unknown and fall back to blocked', () => {
  const normalized = normalizeTeamView({
    members: [],
    tasks: [
      { id: 'task-7', status: 'scheduled', ready: true, blockedBy: [], writeScopes: [], writeScopeWarnings: [] },
      { id: 'task-8', status: 'deleted' },
    ],
  });
  const task7 = taskById(normalized, 'task-7');
  assert.equal(task7.status, 'scheduled');
  assert.equal(task7.stage, 'blocked');
  const task8 = taskById(normalized, 'task-8');
  assert.equal(task8.status, 'deleted');
  assert.equal(task8.stage, 'blocked');
  assert.deepEqual(task8.blockedBy, []);
  assert.deepEqual(task8.writeScopes, []);
  assert.equal(task8.ready, false);
  assert.deepEqual(normalized.stats, {
    members: 0,
    tasks: 2,
    ready: 0,
    blocked: 2,
    active: 0,
    done: 0,
    blockedByEdges: 0,
  });
});

test('the goal wire value binds to the team and to every task', () => {
  assert.deepEqual(normalizeGoal(GOAL), {
    id: 'goal-1',
    revision: 3,
    objective: 'Ship the native Agent Team panel',
    phase: 'active',
    roundsStarted: 2,
    maxGoalRounds: 8,
    blockedReason: null,
  });

  // The bare goal object is accepted too.
  assert.deepEqual(normalizeGoal({ id: 'goal-2', revision: 1 }), {
    id: 'goal-2',
    revision: 1,
    objective: '',
    phase: '',
    roundsStarted: null,
    maxGoalRounds: null,
    blockedReason: null,
  });

  assert.deepEqual(
    normalizeGoal({ goal: { id: 'goal-3', blockedReason: { code: 'held-target', message: 'held' } } }).blockedReason,
    { code: 'held-target', message: 'held' },
  );

  for (const empty of [null, undefined, { goal: null }, { id: '', revision: 1 }, { id: 42 }, 'goal']) {
    assert.equal(normalizeGoal(empty), null);
  }

  const normalized = normalizeTeamView(WIRE, { goal: GOAL });
  assert.deepEqual(normalized.goal, normalizeGoal(GOAL));
  assert.ok(normalized.tasks.every((task) => task.goalBound === true));
  assert.equal(normalizeTeamView(WIRE).tasks.every((task) => task.goalBound === false), true);
});

test('lead and owner capabilities follow the native roster', () => {
  const asLead = normalizeTeamView(WIRE, { sessionId: 'sess-lead' });
  assert.equal(asLead.isLead, true);
  assert.equal(asLead.leadId, 'sess-lead');
  assert.equal(asLead.canSpawn, true);
  assert.equal(asLead.canReassign, true);
  assert.equal(asLead.currentMember.id, 'sess-lead');
  assert.equal(asLead.currentMember.isCurrent, true);
  assert.ok(asLead.tasks.every((task) => task.canMutate === true));
  assert.ok(asLead.tasks.every((task) => task.canReassign === true));
  assert.equal(asLead.members[0].isCurrent, true);
  assert.equal(asLead.members[1].isCurrent, false);

  const asTeammate = normalizeTeamView(WIRE, { sessionId: 'sess-ada' });
  assert.equal(asTeammate.isLead, false);
  assert.equal(asTeammate.canSpawn, false);
  assert.equal(asTeammate.canReassign, false);
  assert.equal(asTeammate.currentMember.id, 'sess-ada');
  assert.equal(taskById(asTeammate, 'task-2').canMutate, true);
  assert.equal(taskById(asTeammate, 'task-1').canMutate, false);
  assert.equal(taskById(asTeammate, 'task-3').canMutate, false);
  assert.ok(asTeammate.tasks.every((task) => task.canReassign === false));

  const asStranger = normalizeTeamView(WIRE, { sessionId: 'sess-zed' });
  assert.equal(asStranger.isLead, false);
  assert.equal(asStranger.currentMember, null);
  assert.equal(asStranger.canSpawn, false);
  assert.ok(asStranger.tasks.every((task) => task.canMutate === false));
});

test('a lead role is the only source of lead authority', () => {
  const noLead = normalizeTeamView({
    members: [
      { id: 'sess-a', name: 'a', role: 'teammate', phase: 'active' },
      { id: 'sess-b', name: 'b', role: 'teammate', phase: 'active' },
    ],
    tasks: [{ id: 'task-1', status: 'pending', ready: true }],
  }, { sessionId: 'sess-a' });
  assert.equal(noLead.leadId, null);
  assert.equal(noLead.isLead, false);
  assert.equal(noLead.canSpawn, false);
  assert.equal(noLead.tasks[0].canMutate, false);
});

test('blockedBy edges dedupe within a task and drop blockers outside the view', () => {
  const normalized = normalizeTeamView(WIRE);
  const task3Edges = normalized.edges.filter((edge) => edge.taskId === 'task-3');
  assert.deepEqual(task3Edges, [
    { id: 'blockedBy:task-3:task-1', type: 'blockedBy', taskId: 'task-3', blockerId: 'task-1' },
  ]);
  const task4Edges = normalized.edges.filter((edge) => edge.taskId === 'task-4');
  assert.deepEqual(task4Edges, [
    { id: 'blockedBy:task-4:task-2', type: 'blockedBy', taskId: 'task-4', blockerId: 'task-2' },
  ]);
  assert.equal(normalized.stats.blockedByEdges, normalized.edges.length);
});

test('buildTeamGraph creates stable task:/member: node ids and blocker-to-dependent edges', () => {
  const graph = buildTeamGraph(normalizeTeamView(WIRE, { goal: GOAL, sessionId: 'sess-ada' }));

  assert.equal(graph.nodes.length, 7);
  assert.deepEqual(graph.nodes.map((node) => node.id), [
    'task:task-1',
    'task:task-2',
    'task:task-3',
    'task:task-4',
    'member:sess-lead',
    'member:sess-ada',
    'member:sess-grace',
  ]);
  assert.ok(graph.tasks.every((node) => node.id.startsWith('task:')));
  assert.ok(graph.members.every((node) => node.id.startsWith('member:')));

  const task2 = nodeById(graph, 'task:task-2');
  assert.equal(task2.kind, 'task');
  assert.equal(task2.taskId, 'task-2');
  assert.equal(task2.label, 'Build graph model');
  assert.equal(task2.stage, 'active');
  assert.equal(task2.target, 'ada');
  assert.equal(task2.goalBound, true);
  assert.equal(task2.canMutate, true);
  assert.equal(task2.canReassign, false);
  assert.equal(task2.task.id, 'task-2');

  const lead = nodeById(graph, 'member:sess-lead');
  assert.equal(lead.kind, 'member');
  assert.equal(lead.label, 'lead');
  assert.equal(lead.role, 'lead');
  assert.equal(lead.isLead, true);
  assert.equal(lead.isCurrent, false);
  const current = nodeById(graph, 'member:sess-ada');
  assert.equal(current.isCurrent, true);
  assert.equal(current.isLead, false);

  assert.deepEqual(graph.edges[0], {
    id: 'blockedBy:task-2:task-1',
    type: 'blockedBy',
    taskId: 'task-2',
    blockerId: 'task-1',
    from: 'task:task-1',
    to: 'task:task-2',
  });
  assert.equal(graph.stats.blockedByEdges, 3);
  assert.equal(graph.goal.id, 'goal-1');
  assert.equal(graph.isLead, false);
});

test('buildTeamGraph also accepts a raw wire view', () => {
  assert.deepEqual(buildTeamGraph(WIRE), buildTeamGraph(normalizeTeamView(WIRE)));
});

test('normalization is deterministic and never mutates the wire view', () => {
  const before = clone(WIRE);
  const options = { goal: GOAL, sessionId: 'sess-ada' };
  const first = normalizeTeamView(WIRE, options);
  const second = normalizeTeamView(WIRE, options);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(WIRE, before);

  const graphFirst = buildTeamGraph(first);
  const graphSecond = buildTeamGraph(second);
  assert.deepEqual(graphFirst, graphSecond);
  assert.equal(JSON.stringify(graphFirst), JSON.stringify(graphSecond));
});

test('malformed or duplicate wire rows are skipped instead of invented', () => {
  const normalized = normalizeTeamView({
    members: [
      null,
      'sess-x',
      { name: 'no-id' },
      { id: 'sess-1', name: 'lead', role: 'lead', phase: 'active' },
      { id: 'sess-1', name: 'duplicate', role: 'teammate', phase: 'active' },
    ],
    tasks: [
      null,
      { subject: 'no id' },
      { id: 'task-1', status: 'pending', ready: true },
      { id: 'task-1', status: 'completed' },
    ],
  });
  assert.equal(normalized.members.length, 1);
  assert.equal(normalized.members[0].name, 'lead');
  assert.equal(normalized.leadId, 'sess-1');
  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].id, 'task-1');
  assert.equal(normalized.tasks[0].stage, 'ready');
  assert.deepEqual(normalized.edges, []);
});
test('lead is identified by role, not by roster position', () => {
  const normalized = normalizeTeamView({
    members: [
      { id: 'sess-ada', name: 'ada', role: 'teammate', phase: 'active' },
      { id: 'sess-boss', name: 'boss', role: 'lead', phase: 'active' },
    ],
    tasks: [{ id: 'task-1', status: 'pending', ready: true }],
  }, { sessionId: 'sess-boss' });
  assert.equal(normalized.leadId, 'sess-boss');
  assert.equal(normalized.isLead, true);
  assert.equal(normalized.currentMember.id, 'sess-boss');
  assert.equal(normalized.members[0].isLead, false);
  assert.equal(normalized.members[1].isLead, true);
  assert.equal(normalized.tasks[0].canMutate, true);
});
