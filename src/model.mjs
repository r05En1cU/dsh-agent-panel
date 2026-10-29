/**
 * Pure model layer for the native DSH Agent Team panel.
 *
 * Input is the native `agentTeam` projection wire view (stateVersion 4):
 *   { members: [{ id, name, role, phase, error? }],
 *     tasks: [{ id, revision, subject, description, status, blockedBy,
 *               writeScopes, ownerName?, ready, writeScopeWarnings }],
 *     failure? }
 * plus the optional native `goal` wire value:
 *   { goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? } } | null
 *
 * Nothing here invents team data: members and tasks are copied from the wire view,
 * unknown task statuses stay unknown and fall back to the `blocked` stage.
 * Pure functions only: no DOM, no React, no IO, no clock, no randomness.
 */

/** Render stages, in visual order. */
export const STAGES = Object.freeze(['blocked', 'ready', 'active', 'done']);

/** Wire edge type for native task dependencies (task -> blocker in the data). */
export const BLOCKED_BY_EDGE = 'blockedBy';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function asIntegerOrNull(value) {
  return Number.isSafeInteger(value) ? value : null;
}

/** Deduplicate a list of non-empty strings, preserving wire order. */
function asStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || item === '' || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function emptyStats() {
  return { members: 0, tasks: 0, ready: 0, blocked: 0, active: 0, done: 0, blockedByEdges: 0 };
}

/**
 * Normalize the native goal wire value.
 *
 * Accepts either the projection value `{ goal: {...} } | null` or a bare goal object.
 * A value without a usable `id` is not a goal: null is returned instead of inventing one.
 *
 * @param {object|null|undefined} goalValue
 * @returns {{id: string, revision: number|null, objective: string, phase: string,
 *   roundsStarted: number|null, maxGoalRounds: number|null,
 *   blockedReason: {code: string|null, message: string|null}|null}|null}
 */
export function normalizeGoal(goalValue) {
  const wrapped = isObject(goalValue) && Object.hasOwn(goalValue, 'goal') ? goalValue.goal : goalValue;
  if (!isObject(wrapped)) return null;
  const id = asString(wrapped.id);
  if (id === '') return null;
  return {
    id,
    revision: asIntegerOrNull(wrapped.revision),
    objective: asString(wrapped.objective),
    phase: asString(wrapped.phase),
    roundsStarted: asIntegerOrNull(wrapped.roundsStarted),
    maxGoalRounds: asIntegerOrNull(wrapped.maxGoalRounds),
    blockedReason: normalizeBlockedReason(wrapped.blockedReason),
  };
}

function normalizeBlockedReason(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return { code: null, message: value };
  if (!isObject(value)) return null;
  return {
    code: typeof value.code === 'string' ? value.code : null,
    message: typeof value.message === 'string' ? value.message : null,
  };
}

/**
 * Derive the render stage of a native task view.
 *
 * completed -> done; in_progress -> active; pending && ready -> ready; everything else
 * (including unknown statuses and deleted tombstones) -> blocked.
 *
 * @param {object|null|undefined} task native task view
 * @returns {'blocked'|'ready'|'active'|'done'}
 */
export function deriveStage(task) {
  if (!isObject(task)) return 'blocked';
  if (task.status === 'completed') return 'done';
  if (task.status === 'in_progress') return 'active';
  if (task.status === 'pending' && task.ready === true) return 'ready';
  return 'blocked';
}

function normalizeMembers(rawMembers, sessionId) {
  const members = [];
  const seen = new Set();
  for (const raw of rawMembers) {
    if (!isObject(raw)) continue;
    const id = asString(raw.id);
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    const member = {
      id,
      name: asString(raw.name),
      role: asString(raw.role),
      phase: asString(raw.phase),
      isLead: false,
      isCurrent: sessionId !== null && id === sessionId,
    };
    if (typeof raw.error === 'string' && raw.error !== '') member.error = raw.error;
    members.push(member);
  }
  return members;
}

function normalizeTasks(rawTasks, options) {
  const { goal, isLead, currentMember } = options;
  const tasks = [];
  const seen = new Set();
  for (const raw of rawTasks) {
    if (!isObject(raw)) continue;
    const id = asString(raw.id);
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    const status = asString(raw.status);
    const ready = raw.ready === true;
    const ownerName = asString(raw.ownerName) === '' ? null : raw.ownerName;
    const ownsTask = currentMember !== null && ownerName !== null && ownerName === currentMember.name;
    const stage = deriveStage({ status, ready });
    tasks.push({
      id,
      revision: asIntegerOrNull(raw.revision),
      subject: asString(raw.subject),
      description: asString(raw.description),
      status,
      blockedBy: asStringList(raw.blockedBy),
      writeScopes: asStringList(raw.writeScopes),
      ownerName,
      ready,
      writeScopeWarnings: asStringList(raw.writeScopeWarnings),
      stage,
      target: ownerName === null ? 'unowned' : ownerName,
      goalBound: goal !== null,
      canMutate: isLead || ownsTask,
      canReassign: isLead,
    });
  }
  return tasks;
}

function buildEdges(tasks) {
  const taskIds = new Set(tasks.map(task => task.id));
  const edges = [];
  const seen = new Set();
  for (const task of tasks) {
    for (const blockerId of task.blockedBy) {
      // A blocker that is not part of the view has no node to draw: drop the edge,
      // never synthesize a ghost task for it.
      if (!taskIds.has(blockerId)) continue;
      const key = task.id + '\u0000' + blockerId;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: BLOCKED_BY_EDGE + ':' + task.id + ':' + blockerId,
        type: BLOCKED_BY_EDGE,
        taskId: task.id,
        blockerId,
      });
    }
  }
  return edges;
}

function summarize(members, tasks, edges) {
  const stats = emptyStats();
  stats.members = members.length;
  stats.tasks = tasks.length;
  for (const task of tasks) {
    if (task.stage === 'ready') stats.ready += 1;
    else if (task.stage === 'blocked') stats.blocked += 1;
    else if (task.stage === 'active') stats.active += 1;
    else if (task.stage === 'done') stats.done += 1;
  }
  stats.blockedByEdges = edges.length;
  return stats;
}

/**
 * Normalize the native agentTeam wire view into the render model.
 *
 * @param {object|null|undefined} view native agentTeam wire view
 * @param {{goal?: object|null, sessionId?: string|null}} [options]
 * @returns {{
 *   ok: boolean, failure: string|null, sessionId: string|null, leadId: string|null,
 *   currentMember: object|null, isLead: boolean, canReassign: boolean, canSpawn: boolean,
 *   members: object[], tasks: object[], goal: object|null,
 *   stats: {members:number,tasks:number,ready:number,blocked:number,active:number,done:number,blockedByEdges:number},
 *   edges: object[]
 * }}
 */
export function normalizeTeamView(view, options = {}) {
  const opts = isObject(options) ? options : {};
  const sessionId = asString(opts.sessionId) === '' ? null : opts.sessionId;
  const goal = normalizeGoal(opts.goal);
  const wire = isObject(view) ? view : null;

  const rawFailure = wire === null ? null : wire.failure;
  const failure = rawFailure === null || rawFailure === undefined || rawFailure === ''
    ? null
    : String(rawFailure);

  const members = normalizeMembers(wire !== null && Array.isArray(wire.members) ? wire.members : [], sessionId);
  const lead = members.find(member => member.role === 'lead') ?? null;
  const leadId = lead === null ? null : lead.id;
  if (lead !== null) lead.isLead = true;

  const currentMember = members.find(member => member.isCurrent) ?? null;
  const isLead = currentMember !== null && currentMember.isLead === true;
  const canReassign = isLead;
  const canSpawn = isLead;

  const tasks = normalizeTasks(
    wire !== null && Array.isArray(wire.tasks) ? wire.tasks : [],
    { goal, isLead, currentMember },
  );
  const edges = buildEdges(tasks);

  return {
    ok: failure === null,
    failure,
    sessionId,
    leadId,
    currentMember,
    isLead,
    canReassign,
    canSpawn,
    members,
    tasks,
    goal,
    stats: summarize(members, tasks, edges),
    edges,
  };
}

/**
 * Build render nodes and edges from the normalized model.
 *
 * Node ids are `task:<id>` / `member:<id>`. Blocked-by edges keep the data direction
 * (`taskId` -> `blockerId`) and expose the visual direction `from` (blocker node) ->
 * `to` (dependent node), because dependency arrows flow blocker -> dependent.
 *
 * @param {object} normalized result of {@link normalizeTeamView} (a raw wire view is accepted too)
 */
export function buildTeamGraph(normalized) {
  const base = isObject(normalized) && typeof normalized.ok === 'boolean'
    ? normalized
    : normalizeTeamView(normalized);

  const taskNodes = (Array.isArray(base.tasks) ? base.tasks : [])
    .filter(task => isObject(task) && typeof task.id === 'string' && task.id !== '')
    .map(task => ({
      id: 'task:' + task.id,
      kind: 'task',
      taskId: task.id,
      label: task.subject === '' ? task.id : task.subject,
      stage: task.stage,
      target: task.target,
      goalBound: task.goalBound === true,
      canMutate: task.canMutate === true,
      canReassign: task.canReassign === true,
      task,
    }));

  const memberNodes = (Array.isArray(base.members) ? base.members : [])
    .filter(member => isObject(member) && typeof member.id === 'string' && member.id !== '')
    .map(member => ({
      id: 'member:' + member.id,
      kind: 'member',
      memberId: member.id,
      label: member.name === '' ? member.id : member.name,
      role: member.role,
      phase: member.phase,
      isLead: member.isLead === true,
      isCurrent: member.isCurrent === true,
      member,
    }));

  const edges = (Array.isArray(base.edges) ? base.edges : [])
    .filter(edge => isObject(edge) && typeof edge.taskId === 'string' && typeof edge.blockerId === 'string')
    .map(edge => ({
      id: edge.id,
      type: BLOCKED_BY_EDGE,
      taskId: edge.taskId,
      blockerId: edge.blockerId,
      from: 'task:' + edge.blockerId,
      to: 'task:' + edge.taskId,
    }));

  return {
    ok: base.ok,
    failure: base.failure,
    sessionId: base.sessionId,
    leadId: base.leadId,
    currentMember: base.currentMember,
    isLead: base.isLead,
    canReassign: base.canReassign,
    canSpawn: base.canSpawn,
    goal: base.goal,
    stats: base.stats,
    nodes: [...taskNodes, ...memberNodes],
    tasks: taskNodes,
    members: memberNodes,
    edges,
  };
}
