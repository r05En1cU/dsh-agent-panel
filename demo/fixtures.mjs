/**
 * Fake native projections for the isolated demo harness.
 *
 * Everything here is test data for the browser half of dsh-plugin-agent-team-panel.
 * Nothing reads a real Team service or a persistent store: the harness
 * fabricates the exact wire values the native host would project.
 *
 * Wire shapes (see docs/CONTRACT.md):
 *   agentTeam: { members: [{id,name,role,phase,error?}],
 *                tasks: [{id,revision,subject,description,status,blockedBy,writeScopes,
 *                         ownerName?,ready,writeScopeWarnings}],
 *                failure? }
 *   goal:      { goal: {id,revision,objective,phase,roundsStarted,maxGoalRounds,blockedReason?} } | null
 *
 * The client half reads them through the native sessions service:
 *   sessions.binding(sessionId).session.getSnapshot()   (lead resolution only)
 *   sessions.list.getSnapshot().projectionsBySession[leadId].values.{agentTeam,goal}
 *   sessions.list.subscribe(fn) / binding.session.subscribe(fn)
 * createSessionsService() below implements exactly that surface.
 */

/** One fake session: the panel treats it as the current Team member. */
export const DEMO_SESSION_ID = 'sess-demo-lead';

/** URL states the screenshot script drives (scripts/shoot.mjs); plus two diagnostics. */
export const STATES = Object.freeze([
  'overview',
  'bundled',
  'expanded',
  'new-task',
  'spawn',
  'member',
  'empty',
  'failure',
]);

export const DEFAULT_STATE = 'overview';

const MEMBERS = Object.freeze([
  { id: DEMO_SESSION_ID, name: 'Astra', role: 'lead', phase: 'active' },
  { id: 'sess-demo-borin', name: 'Borin', role: 'teammate', phase: 'active' },
  { id: 'sess-demo-cyd', name: 'Cyd', role: 'teammate', phase: 'active' },
]);

const GOAL = Object.freeze({
  id: 'goal_demo_01',
  revision: 3,
  objective: '交付一个原生 Agent Team 面板：依赖图、实时投影与安全写操作',
  phase: 'active',
  roundsStarted: 2,
  maxGoalRounds: 6,
});

function makeTask(id, revision, subject, description, status, blockedBy, writeScopes, ownerName, ready, warnings) {
  const task = {
    id,
    revision,
    subject,
    description,
    status,
    blockedBy: blockedBy.slice(),
    writeScopes: writeScopes.slice(),
    ready: ready === true,
    writeScopeWarnings: Array.isArray(warnings) ? warnings.slice() : [],
  };
  if (typeof ownerName === 'string' && ownerName.length > 0) task.ownerName = ownerName;
  return task;
}

function baseTasks() {
  return [
    makeTask('task-1', 3, '核对原生 agentTeam 投影字段',
      '确认 stateVersion 4 的 members/tasks 字段与 blockedBy 语义，只读投影，不写 team/* 事件。',
      'completed', [], ['docs/probes/'], 'Astra', false),
    makeTask('task-2', 2, '实现分层布局与 blockedBy 边路由',
      '按 blocker 分层；同一 blocker 的多条依赖合成干线，支线从同一汇合点连续衔接。',
      'in_progress', ['task-1'], ['src/geometry.mjs'], 'Borin', false),
    makeTask('task-3', 1, '接入原生 Team 写操作',
      'createTask / updateTask / spawnTeammate / sendMessage 走 live agent 的原生 TeamService，不落库。',
      'pending', ['task-1'], ['src/host-routes.mjs'], null, true),
    makeTask('task-4', 1, '打包安装器与 composer companion',
      '两个包、两个 node_modules 条目、两条 cordis.patch insert；备份 + 幂等 + 拒绝 live desktop。',
      'pending', ['task-1'], ['install-into-profile.mjs', 'companions/'], null, true),
    makeTask('task-5', 1, 'demo harness 与截图脚本',
      '用真实 client.js + fake sessions 挂载 conversation.view 组件，URL 参数切换截图状态。',
      'pending', ['task-2', 'task-3'], ['demo/'], 'Cyd', false),
  ];
}

/**
 * The native agentTeam wire view for one state.
 * Dependency direction in the data is task -> blocker; the UI draws blocker -> task.
 */
export function createTeamView(state) {
  if (state === 'empty') return null;
  if (state === 'failure') {
    return { members: MEMBERS.slice(), tasks: [], failure: 'NETWORK_ERROR: agentTeam projection unavailable' };
  }
  const tasks = baseTasks();
  if (state === 'bundled') {
    // Three dependents of the same blocker: this is the trunk + branches case.
    tasks[1].blockedBy = ['task-1'];
    tasks[2].blockedBy = ['task-1'];
    tasks[3].blockedBy = ['task-1'];
    tasks[4].blockedBy = ['task-4'];
    tasks[4].ready = false;
  } else {
    // Every other state is a plain single-edge baseline: no blocker owns two
    // dependents, so the overview screenshot shows only thin edges and the
    // bundled state stays the one that exercises trunk + branches.
    tasks[1].blockedBy = [];
    tasks[3].blockedBy = ['task-3'];
    tasks[4].blockedBy = [];
    tasks[4].ready = true;
  }
  return { members: MEMBERS.slice(), tasks };
}

/** The native goal wire value for one state. */
export function createGoal(state) {
  if (state === 'empty' || state === 'failure') return null;
  return { goal: Object.assign({}, GOAL) };
}

/** Everything one URL state needs, including the panel's initialState props. */
export function createFixture(state) {
  const name = STATES.includes(state) ? state : DEFAULT_STATE;
  const fixture = {
    state: name,
    requestedState: state,
    sessionId: DEMO_SESSION_ID,
    leadId: DEMO_SESSION_ID,
    listPhase: name === 'failure' ? 'error' : 'ready',
    view: createTeamView(name),
    goal: createGoal(name),
    initialState: {},
    note: '',
  };
  if (name === 'expanded') {
    fixture.initialState = { expanded: ['task-2'] };
    fixture.note = 'task t-2 expanded in place (no inspector)';
  } else if (name === 'new-task') {
    fixture.initialState = { modal: { kind: 'new-task' } };
    fixture.note = 'native createTask dialog open';
  } else if (name === 'spawn') {
    fixture.initialState = { modal: { kind: 'spawn' } };
    fixture.note = 'native spawnTeammate dialog open';
  } else if (name === 'member') {
    fixture.initialState = { selected: 'member:sess-demo-borin' };
    fixture.note = 'member inspector (Borin)';
  } else if (name === 'overview') {
    fixture.initialState = {};
    fixture.note = 'default collapsed overview';
  } else if (name === 'bundled') {
    fixture.initialState = {};
    fixture.note = 'three dependents of t-1 (trunk + branches)';
  } else if (name === 'empty') {
    fixture.note = 'no agentTeam projection in this session';
  } else if (name === 'failure') {
    fixture.note = 'projection failure banner';
  }
  return fixture;
}

/**
 * A fake of the native sessions service, with the exact surface the client half reads.
 * @param {object} fixture value from createFixture()
 */
export function createSessionsService(fixture) {
  let current = fixture;
  const listeners = new Set();
  const sessionListeners = new Set();

  function notify() {
    for (const listener of Array.from(listeners)) {
      try { listener(); } catch { /* a listener failure must not break the fake */ }
    }
    for (const listener of Array.from(sessionListeners)) {
      try { listener(); } catch { /* same */ }
    }
  }

  function listSnapshot() {
    const projectionsBySession = {};
    if (current.view !== null || current.goal !== null) {
      projectionsBySession[current.sessionId] = { values: { agentTeam: current.view, goal: current.goal } };
    }
    return { phase: current.listPhase, projectionsBySession };
  }

  function sessionSnapshot() {
    return { id: current.sessionId, title: 'demo · ' + current.state, subagent: null };
  }

  function binding(sessionId) {
    if (sessionId !== current.sessionId) return null;
    return {
      id: sessionId,
      session: {
        getSnapshot: sessionSnapshot,
        subscribe(listener) {
          sessionListeners.add(listener);
          return function unsubscribe() { sessionListeners.delete(listener); };
        },
      },
    };
  }

  return {
    binding,
    list: {
      getSnapshot: listSnapshot,
      subscribe(listener) {
        listeners.add(listener);
        return function unsubscribe() { listeners.delete(listener); };
      },
    },
    /** Swap the fixture and notify, like a live projection push. */
    update(next) {
      current = next;
      notify();
    },
    get fixture() { return current; },
    listenerCount() { return listeners.size + sessionListeners.size; },
  };
}

/** Short human summary for the harness status strip and for tests. */
export function describeFixture(fixture) {
  const view = fixture.view;
  const members = view && Array.isArray(view.members) ? view.members.length : 0;
  const tasks = view && Array.isArray(view.tasks) ? view.tasks.length : 0;
  let edges = 0;
  if (view && Array.isArray(view.tasks)) {
    for (const task of view.tasks) {
      if (Array.isArray(task.blockedBy)) edges += task.blockedBy.length;
    }
  }
  const goal = fixture.goal && fixture.goal.goal ? fixture.goal.goal.phase : 'none';
  return { state: fixture.state, members, tasks, edges, goal };
}
