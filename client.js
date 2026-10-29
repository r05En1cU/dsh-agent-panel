/* Built by scripts/build-client.mjs — do not edit by hand. */
window.__ModuleLoader__.load({
  id: "dsh-plugin-agent-team-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const el = React.createElement;
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
const STAGES = Object.freeze(['blocked', 'ready', 'active', 'done']);

/** Wire edge type for native task dependencies (task -> blocker in the data). */
const BLOCKED_BY_EDGE = 'blockedBy';

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
function normalizeGoal(goalValue) {
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
function deriveStage(task) {
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
function normalizeTeamView(view, options = {}) {
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
function buildTeamGraph(normalized) {
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

/**
 * Pure geometry layer for the native Agent Team graph.
 *
 * layoutTeamGraph turns the graph from src/model.mjs into boxes: a layered DAG with
 * blockers on the left (lower level = fewer blocking dependencies) and the native member
 * roster in a column on the right.
 *
 * routeTeamEdges turns blockedBy edges into polyline ports and coarse-line bundles.
 * Expanded, dragged, and freshly measured nodes are just different boxes: the same
 * routing function applies to all of them.
 *
 * Pure functions only: no DOM, no measurement, no IO, no clock, no randomness.
 */

const TASK_WIDTH = 232;
const TASK_HEIGHT = 92;
const TASK_EXPANDED_HEIGHT = 192;
const MEMBER_WIDTH = 168;
const MEMBER_HEIGHT = 64;
const MEMBER_EXPANDED_HEIGHT = 120;
const PADDING = 32;
const COLUMN_GAP = 112;
const ROW_GAP = 28;
const MEMBER_GAP = 12;
const MEMBER_COLUMN_GAP = 72;
const SINGLE_EDGE_WIDTH = 1.8;
const BRANCH_EDGE_WIDTH = 1.8;
const TRUNK_BASE_WIDTH = 2.8;
const TRUNK_STEP_WIDTH = 1.1;
const TRUNK_MAX_WIDTH = 8;
const BUNDLE_MIN_LENGTH = 30;
const BUNDLE_MAX_LENGTH = 140;
const BUNDLE_LENGTH_RATIO = 0.5;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function clampBetween(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function copyPoint(point) {
  return { x: point.x, y: point.y };
}

function pointOrNull(value) {
  if (!isPlainObject(value)) return null;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null;
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function withoutTaskPrefix(id) {
  return typeof id === 'string' && id.startsWith('task:') ? id.slice('task:'.length) : id;
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function pathData(points) {
  return points
    .map((point, index) => (index === 0 ? 'M' : 'L') + ' ' + formatNumber(point.x) + ' ' + formatNumber(point.y))
    .join(' ');
}

/** Accept a graph from buildTeamGraph (nodes[]) or a bare normalized model (tasks/members). */
function collectNodes(graph) {
  if (!isPlainObject(graph)) return [];
  const candidates = [];
  if (Array.isArray(graph.nodes)) {
    candidates.push(...graph.nodes);
  } else {
    for (const row of Array.isArray(graph.tasks) ? graph.tasks : []) {
      if (!isPlainObject(row) || typeof row.id !== 'string' || row.id === '') continue;
      candidates.push(row.kind === 'task' ? row : {
        id: 'task:' + row.id,
        kind: 'task',
        taskId: row.id,
        label: typeof row.subject === 'string' ? row.subject : row.id,
        stage: row.stage,
        task: row,
      });
    }
    for (const row of Array.isArray(graph.members) ? graph.members : []) {
      if (!isPlainObject(row) || typeof row.id !== 'string' || row.id === '') continue;
      candidates.push(row.kind === 'member' ? row : {
        id: 'member:' + row.id,
        kind: 'member',
        memberId: row.id,
        label: typeof row.name === 'string' ? row.name : row.id,
        member: row,
      });
    }
  }
  const nodes = [];
  const seen = new Set();
  for (const node of candidates) {
    if (!isPlainObject(node)) continue;
    if (typeof node.id !== 'string' || node.id === '') continue;
    if (node.kind !== 'task' && node.kind !== 'member') continue;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    nodes.push(node);
  }
  return nodes;
}

/** Resolve the visual endpoints of every dependency edge; unknown endpoints are dropped. */
function collectEdges(graph, nodeIds) {
  if (!isPlainObject(graph) || !Array.isArray(graph.edges)) return [];
  const edges = [];
  for (const edge of graph.edges) {
    if (!isPlainObject(edge)) continue;
    if (edge.type !== undefined && edge.type !== 'blockedBy') continue;
    const from = typeof edge.from === 'string'
      ? edge.from
      : (typeof edge.blockerId === 'string' ? 'task:' + edge.blockerId : null);
    const to = typeof edge.to === 'string'
      ? edge.to
      : (typeof edge.taskId === 'string' ? 'task:' + edge.taskId : null);
    if (from === null || to === null || from === '' || to === '') continue;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push({ ...edge, from, to });
  }
  return edges;
}

function isFlagged(map, node) {
  if (!isPlainObject(map)) return false;
  if (map[node.id] === true) return true;
  if (typeof node.taskId === 'string' && map[node.taskId] === true) return true;
  if (typeof node.memberId === 'string' && map[node.memberId] === true) return true;
  return false;
}

function positionOf(positions, node) {
  if (!isPlainObject(positions)) return null;
  for (const key of [node.id, node.taskId, node.memberId]) {
    if (typeof key !== 'string') continue;
    const point = pointOrNull(positions[key]);
    if (point !== null) return point;
  }
  return null;
}

function pickSize(spec, node, kind, expanded, fallback) {
  if (isPositiveNumber(spec)) return spec;
  if (!isPlainObject(spec)) return fallback;
  for (const key of [node.id, node.taskId, node.memberId]) {
    if (typeof key !== 'string') continue;
    if (isPositiveNumber(spec[key])) return spec[key];
  }
  const keys = expanded ? [kind + 'Expanded', 'expanded', kind] : [kind];
  for (const key of keys) {
    if (isPositiveNumber(spec[key])) return spec[key];
  }
  return fallback;
}

function sizeOfNode(node, opts) {
  const member = node.kind === 'member';
  const expanded = isFlagged(opts.expanded, node);
  const fallbackHeight = member
    ? (expanded ? MEMBER_EXPANDED_HEIGHT : MEMBER_HEIGHT)
    : (expanded ? TASK_EXPANDED_HEIGHT : TASK_HEIGHT);
  const fallbackWidth = member ? MEMBER_WIDTH : TASK_WIDTH;
  return {
    w: pickSize(opts.widths, node, member ? 'member' : 'task', expanded, fallbackWidth),
    h: pickSize(opts.heights, node, member ? 'member' : 'task', expanded, fallbackHeight),
  };
}

function stackHeight(nodes, sizes, gap) {
  let total = 0;
  nodes.forEach((node, index) => {
    total += sizes.get(node.id).h;
    if (index > 0) total += gap;
  });
  return total;
}

/**
 * Layered DAG layout.
 *
 * options:
 *   positions {[taskId|nodeId]: {x, y}}  explicit box origins (drag / pin)
 *   expanded  {[taskId|nodeId]: true}    taller boxes, same routing
 *   widths / heights  number | {[id]: number} | {task, member, expanded, taskExpanded, memberExpanded}
 *
 * @param {object} graph result of buildTeamGraph
 * @param {object} [options]
 * @returns {{width:number,height:number,boxes:object[],tasks:object[],members:object[],levels:object[]}}
 */
function layoutTeamGraph(graph, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const nodes = collectNodes(graph);
  const taskNodes = nodes.filter(node => node.kind === 'task');
  const memberNodes = nodes.filter(node => node.kind === 'member');
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = collectEdges(graph, nodeIds);

  const taskIds = new Set(taskNodes.map(node => node.id));
  const blockersOf = new Map();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    if (!taskIds.has(edge.from) || !taskIds.has(edge.to)) continue;
    const list = blockersOf.get(edge.to);
    if (list === undefined) blockersOf.set(edge.to, [edge.from]);
    else if (!list.includes(edge.from)) list.push(edge.from);
  }

  // level(task) = 1 + max(level(blocker)); no blockers -> 0.
  const levelCache = new Map();
  const visiting = new Set();
  const levelOf = (id) => {
    const cached = levelCache.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return -1; // defensive: a cycle contributes no level
    visiting.add(id);
    let best = -1;
    for (const blockerId of blockersOf.get(id) ?? []) {
      const blockerLevel = levelOf(blockerId);
      if (blockerLevel > best) best = blockerLevel;
    }
    visiting.delete(id);
    const level = best + 1;
    levelCache.set(id, level);
    return level;
  };
  for (const node of taskNodes) levelOf(node.id);

  const byLevel = [];
  for (const node of taskNodes) {
    const level = levelCache.get(node.id) ?? 0;
    while (byLevel.length <= level) byLevel.push([]);
    byLevel[level].push(node);
  }

  const sizes = new Map();
  for (const node of nodes) sizes.set(node.id, sizeOfNode(node, opts));

  const levelInfo = [];
  let cursor = PADDING;
  for (let index = 0; index < byLevel.length; index += 1) {
    const nodesAtLevel = byLevel[index];
    let width = 0;
    for (const node of nodesAtLevel) width = Math.max(width, sizes.get(node.id).w);
    levelInfo.push({ level: index, nodes: nodesAtLevel, x: cursor, width });
    cursor += width + COLUMN_GAP;
  }

  const heights = levelInfo.map(info => stackHeight(info.nodes, sizes, ROW_GAP));
  const tallest = heights.reduce((max, value) => Math.max(max, value), 0);

  const positions = new Map();
  levelInfo.forEach((info, index) => {
    let y = PADDING + (tallest - heights[index]) / 2;
    for (const node of info.nodes) {
      positions.set(node.id, { x: info.x, y });
      y += sizes.get(node.id).h + ROW_GAP;
    }
  });

  if (memberNodes.length > 0) {
    const last = levelInfo.length === 0 ? null : levelInfo[levelInfo.length - 1];
    const memberX = last === null ? PADDING : last.x + last.width + MEMBER_COLUMN_GAP;
    const memberHeight = stackHeight(memberNodes, sizes, MEMBER_GAP);
    let contentBottom = PADDING;
    for (const info of levelInfo) {
      for (const node of info.nodes) {
        const point = positions.get(node.id);
        contentBottom = Math.max(contentBottom, point.y + sizes.get(node.id).h);
      }
    }
    const contentHeight = Math.max(0, contentBottom - PADDING);
    let y = PADDING + Math.max(0, (contentHeight - memberHeight) / 2);
    for (const node of memberNodes) {
      positions.set(node.id, { x: memberX, y });
      y += sizes.get(node.id).h + MEMBER_GAP;
    }
  }

  for (const node of nodes) {
    const override = positionOf(opts.positions, node);
    if (override !== null) positions.set(node.id, override);
  }

  const boxes = nodes.map(node => {
    const point = positions.get(node.id);
    const size = sizes.get(node.id);
    return { id: node.id, kind: node.kind, x: point.x, y: point.y, w: size.w, h: size.h, node };
  });

  let width = 0;
  let height = 0;
  for (const box of boxes) {
    width = Math.max(width, box.x + box.w);
    height = Math.max(height, box.y + box.h);
  }
  if (boxes.length > 0) {
    width += PADDING;
    height += PADDING;
  }

  return {
    width,
    height,
    boxes,
    tasks: boxes.filter(box => box.kind === 'task'),
    members: boxes.filter(box => box.kind === 'member'),
    levels: levelInfo.map(info => ({
      level: info.level,
      taskIds: info.nodes.map(node => (typeof node.taskId === 'string' ? node.taskId : node.id)),
      x: info.x,
      width: info.width,
    })),
  };
}

/** Left/right center anchors, or the measured DOM anchors when provided. */
function resolvePorts(box, spec) {
  const centerY = box.y + box.h / 2;
  const measured = isPlainObject(spec) ? spec : null;
  const left = (measured === null ? null : pointOrNull(measured.left)) ?? { x: box.x, y: centerY };
  const right = (measured === null ? null : pointOrNull(measured.right)) ?? { x: box.x + box.w, y: centerY };
  return { left, right };
}

function trunkWidthFor(count) {
  return round2(Math.min(TRUNK_MAX_WIDTH, TRUNK_BASE_WIDTH + TRUNK_STEP_WIDTH * (count - 1)));
}

function centroid(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Junction = hub moved BUNDLE_LENGTH_RATIO of the nearest target distance toward the targets. */
function bundleJunction(hub, targetPorts) {
  const center = centroid(targetPorts);
  let dx = center.x - hub.x;
  let dy = center.y - hub.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) {
    dx = 1;
    dy = 0;
  } else {
    dx /= length;
    dy /= length;
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (const point of targetPorts) {
    nearest = Math.min(nearest, Math.hypot(point.x - hub.x, point.y - hub.y));
  }
  const distance = clampBetween(nearest * BUNDLE_LENGTH_RATIO, BUNDLE_MIN_LENGTH, BUNDLE_MAX_LENGTH);
  return { x: round3(hub.x + dx * distance), y: round3(hub.y + dy * distance) };
}

function edgeIdentifier(edge, item) {
  if (typeof edge.id === 'string' && edge.id !== '') return edge.id;
  const taskId = typeof edge.taskId === 'string' ? edge.taskId : withoutTaskPrefix(item.to);
  const blockerId = typeof edge.blockerId === 'string' ? edge.blockerId : withoutTaskPrefix(item.from);
  return 'blockedBy:' + taskId + ':' + blockerId;
}

/**
 * Route blockedBy edges blocker -> dependent with coarse-line bundling.
 *
 * options.ports: {[nodeId]: {left: {x, y}, right: {x, y}}} measured DOM anchors.
 *
 * @param {object} graph result of buildTeamGraph
 * @param {object} layout result of layoutTeamGraph
 * @param {object} [options]
 * @returns {{edges:object[],bundles:object[],ports:object}}
 */
function routeTeamEdges(graph, layout, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const measured = isPlainObject(opts.ports) ? opts.ports : {};
  const boxes = isPlainObject(layout) && Array.isArray(layout.boxes) ? layout.boxes : [];

  const ports = {};
  const nodeIds = new Set();
  for (const box of boxes) {
    if (!isPlainObject(box) || typeof box.id !== 'string' || box.id === '') continue;
    if (typeof box.x !== 'number' || typeof box.y !== 'number' || typeof box.w !== 'number' || typeof box.h !== 'number') continue;
    ports[box.id] = resolvePorts(box, measured[box.id]);
    nodeIds.add(box.id);
  }

  const items = [];
  const groups = new Map();
  for (const edge of collectEdges(graph, nodeIds)) {
    if (edge.from === edge.to) continue; // no self loops
    const item = { edge, from: edge.from, to: edge.to };
    items.push(item);
    const group = groups.get(edge.from);
    if (group === undefined) groups.set(edge.from, [item]);
    else group.push(item);
  }

  const routes = new Map();
  const bundles = [];
  for (const [blockerNodeId, group] of groups) {
    if (group.length < 2) continue;
    const hub = copyPoint(ports[blockerNodeId].right);
    const targetPorts = group.map(item => ports[item.to].left);
    const junction = bundleJunction(hub, targetPorts);
    const bundleId = 'blockedBy:' + withoutTaskPrefix(blockerNodeId);
    const width = trunkWidthFor(group.length);
    const trunkPoints = [hub, junction];
    const branches = [];
    for (let index = 0; index < group.length; index += 1) {
      const item = group[index];
      const target = copyPoint(targetPorts[index]);
      const points = [copyPoint(junction), target];
      const branch = {
        edgeId: edgeIdentifier(item.edge, item),
        to: item.to,
        taskId: typeof item.edge.taskId === 'string' ? item.edge.taskId : withoutTaskPrefix(item.to),
        points,
        d: pathData(points),
        width: BRANCH_EDGE_WIDTH,
        arrow: true,
      };
      branches.push(branch);
      routes.set(item, { points, width: BRANCH_EDGE_WIDTH, arrow: true, bundleId });
    }
    bundles.push({
      id: bundleId,
      type: 'blockedBy',
      from: blockerNodeId,
      blockerId: withoutTaskPrefix(blockerNodeId),
      count: group.length,
      width,
      hub: copyPoint(hub),
      junction: copyPoint(junction),
      trunk: {
        id: bundleId + ':trunk',
        points: trunkPoints,
        d: pathData(trunkPoints),
        width,
        arrow: false,
      },
      branches,
      edgeIds: branches.map(branch => branch.edgeId),
    });
  }

  for (const item of items) {
    if (routes.has(item)) continue;
    const points = [copyPoint(ports[item.from].right), copyPoint(ports[item.to].left)];
    routes.set(item, { points, width: SINGLE_EDGE_WIDTH, arrow: true, bundleId: null });
  }

  const edges = items.map(item => {
    const route = routes.get(item);
    return {
      id: edgeIdentifier(item.edge, item),
      type: 'blockedBy',
      from: item.from,
      to: item.to,
      taskId: typeof item.edge.taskId === 'string' ? item.edge.taskId : withoutTaskPrefix(item.to),
      blockerId: typeof item.edge.blockerId === 'string' ? item.edge.blockerId : withoutTaskPrefix(item.from),
      points: route.points,
      d: pathData(route.points),
      width: route.width,
      arrow: route.arrow,
      bundleId: route.bundleId,
    };
  });

  return { edges, bundles, ports };
}


// ── Agent Team Panel · browser half ─────────────────────────────────────────
const VIEW_ID = 'agent-team-panel';
const ROUTES = Object.freeze({
  createTask: '/api/agent-team-panel.task.create',
  updateTask: '/api/agent-team-panel.task.update',
  spawnTeammate: '/api/agent-team-panel.teammate.spawn',
  sendMessage: '/api/agent-team-panel.message.send',
});
const LAYOUT_PREFIX = 'dsh.agentTeamPanel.layout.v1:';
const VIEW_PREFIX = 'dsh.agentTeamPanel.view.v1:';
const STAGE_LABEL = Object.freeze({ blocked: '被阻塞', ready: '可认领', active: '进行中', done: '已完成' });
const STAGE_TONE = Object.freeze({ blocked: 'danger', ready: 'warning', active: 'info', done: 'success' });
const EDGE_COLOR = '#c47a12';
const CSS = `
.atp-root{--atp-bg:var(--dsw-alias-bg-layer-1,#fff);--atp-panel:var(--dsw-alias-bg-layer-2,#f7f8fa);--atp-line:var(--dsw-alias-border-l1,rgba(127,127,127,.2));--atp-line-strong:var(--dsw-alias-border-l2,rgba(127,127,127,.34));--atp-text:var(--dsw-alias-label-primary,#1f2328);--atp-muted:var(--dsw-alias-label-secondary,#5b6573);--atp-accent:#2f6fed;--atp-danger:#c04444;--atp-success:#2e8b57;--atp-warning:#b7791f;box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;color:var(--atp-text);font-family:var(--dsw-font-family,inherit);background:var(--atp-bg);overflow:hidden}
.atp-root *{box-sizing:border-box}
.atp-header{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-start;justify-content:space-between;padding:14px 18px 10px;border-bottom:1px solid var(--atp-line);background:linear-gradient(180deg,var(--atp-panel),transparent)}
.atp-heading{min-width:0;display:flex;flex-direction:column;gap:3px}
.atp-kicker{font-size:10px;letter-spacing:.16em;font-weight:800;color:var(--atp-muted)}
.atp-title{display:flex;align-items:center;gap:9px;font-size:19px;font-weight:700;line-height:1.25}
.atp-live{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:.04em;padding:3px 7px;border-radius:999px;color:var(--atp-success);background:rgba(46,139,87,.1);border:1px solid rgba(46,139,87,.25)}
.atp-live i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:atp-pulse 1.8s infinite}
.atp-goal{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:11px;color:var(--atp-muted);max-width:820px}
.atp-goal b{color:var(--atp-text);font-weight:600}
.atp-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;border:1px solid var(--atp-line);background:var(--atp-panel);font-size:10px;line-height:1.5;color:var(--atp-muted);white-space:nowrap}
.atp-chip-info{color:#1d5fc4;border-color:rgba(47,111,237,.25);background:rgba(47,111,237,.07)}
.atp-chip-warning{color:#8a5b0b;border-color:rgba(183,121,31,.3);background:rgba(183,121,31,.08)}
.atp-chip-success{color:#206b43;border-color:rgba(46,139,87,.3);background:rgba(46,139,87,.08)}
.atp-chip-danger{color:#9b3030;border-color:rgba(192,68,68,.3);background:rgba(192,68,68,.08)}
.atp-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.atp-btn{font:inherit;font-size:11px;line-height:1;padding:7px 10px;border-radius:8px;border:1px solid var(--atp-line-strong);background:var(--atp-panel);color:var(--atp-text);cursor:pointer;white-space:nowrap}
.atp-btn:hover{border-color:var(--atp-accent);color:var(--atp-accent)}
.atp-btn:disabled{opacity:.45;cursor:not-allowed}
.atp-btn-primary{background:var(--atp-accent);border-color:var(--atp-accent);color:#fff}
.atp-btn-primary:hover{color:#fff;filter:brightness(1.06)}
.atp-btn-danger{color:var(--atp-danger);border-color:rgba(192,68,68,.35)}
.atp-btn-ghost{border-color:transparent;background:transparent;color:var(--atp-muted)}
.atp-btn-icon{width:28px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:14px}
.atp-stats{display:flex;flex-wrap:wrap;gap:7px 14px;align-items:center;padding:8px 18px;border-bottom:1px solid var(--atp-line);background:var(--atp-panel);font-size:11px;color:var(--atp-muted)}
.atp-stats b{color:var(--atp-text);font-variant-numeric:tabular-nums}
.atp-filters{display:flex;flex-wrap:wrap;gap:5px;margin-left:auto}
.atp-filter{font:inherit;font-size:10px;padding:4px 8px;border-radius:999px;border:1px solid var(--atp-line);background:var(--atp-bg);color:var(--atp-muted);cursor:pointer}
.atp-filter.is-active{background:var(--atp-text);color:var(--atp-bg);border-color:var(--atp-text)}
.atp-roster{display:flex;gap:6px;align-items:center;padding:7px 18px;border-bottom:1px solid var(--atp-line);overflow-x:auto;background:var(--atp-bg)}
.atp-roster-label{font-size:10px;letter-spacing:.08em;font-weight:700;color:var(--atp-muted);margin-right:2px;white-space:nowrap}
.atp-member{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid var(--atp-line);background:var(--atp-panel);font-size:11px;color:var(--atp-text);cursor:pointer;white-space:nowrap}
.atp-member:hover{border-color:var(--atp-accent)}
.atp-member.is-current{box-shadow:inset 0 0 0 1px var(--atp-accent)}
.atp-member-dot{width:7px;height:7px;border-radius:50%;background:#9aa4b2}
.atp-member-dot.is-running{background:#2e8b57;box-shadow:0 0 0 3px rgba(46,139,87,.15)}
.atp-member-dot.is-failed{background:#c04444}
.atp-member small{color:var(--atp-muted);font-size:10px}
.atp-body{flex:1;min-height:0;display:flex;position:relative;background:radial-gradient(circle at 1px 1px,rgba(127,127,127,.13) 1px,transparent 0) 0 0/22px 22px}
.atp-stage{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden;cursor:grab;touch-action:none}
.atp-stage.is-panning{cursor:grabbing}
.atp-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.atp-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.atp-edge{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.atp-edge-trunk{opacity:.82}
.atp-edge-branch{opacity:.95}
.atp-edge-label{font-size:10px;font-weight:700;fill:#8a5b0b;paint-order:stroke;stroke:var(--atp-bg);stroke-width:4px;stroke-linejoin:round;pointer-events:none}
.atp-junction{fill:#c47a12;stroke:var(--atp-bg);stroke-width:2px}
.atp-node{position:absolute;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--atp-line-strong);background:var(--atp-bg);box-shadow:0 1px 2px rgba(20,30,50,.05),0 7px 20px rgba(20,30,50,.05);overflow:hidden;transition:box-shadow .15s ease,border-color .15s ease,height .18s ease,left .18s ease,top .18s ease;outline:none}
.atp-node.is-dragging{transition:none;box-shadow:0 12px 30px rgba(20,30,50,.18);cursor:grabbing}
.atp-node.is-selected{border-color:var(--atp-accent);box-shadow:0 0 0 2px rgba(47,111,237,.16),0 12px 30px rgba(20,30,50,.1)}
.atp-node.is-expanded{box-shadow:0 0 0 1px var(--atp-accent),0 18px 40px rgba(20,30,50,.14)}
.atp-node.is-blocked{border-top:3px solid #c04444}
.atp-node.is-ready{border-top:3px solid #b7791f}
.atp-node.is-active{border-top:3px solid #2f6fed}
.atp-node.is-done{border-top:3px solid #2e8b57}
.atp-node-head{padding:10px 11px 8px;display:flex;flex-direction:column;gap:3px;cursor:grab;user-select:none;background:linear-gradient(180deg,rgba(127,127,127,.045),transparent)}
.atp-node.is-dragging .atp-node-head{cursor:grabbing}
.atp-node-top{display:flex;align-items:center;gap:6px;min-width:0}
.atp-stage-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#9aa4b2}
.atp-stage-dot.is-blocked{background:#c04444}
.atp-stage-dot.is-ready{background:#b7791f}
.atp-stage-dot.is-active{background:#2f6fed}
.atp-stage-dot.is-done{background:#2e8b57}
.atp-node-id{font-size:9px;letter-spacing:.06em;font-weight:700;color:var(--atp-muted);white-space:nowrap}
.atp-node-stage{margin-left:auto;font-size:9px;font-weight:700;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.08);color:var(--atp-muted);white-space:nowrap}
.atp-node-title{font-size:12px;font-weight:650;line-height:1.35;color:var(--atp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.atp-node-meta{display:flex;gap:7px;align-items:center;font-size:10px;color:var(--atp-muted);min-width:0;overflow:hidden;white-space:nowrap}
.atp-node-meta b{color:var(--atp-text);font-weight:600}
.atp-node-expand{position:absolute;right:7px;top:7px;width:20px;height:20px;border:1px solid var(--atp-line);border-radius:6px;background:var(--atp-panel);color:var(--atp-muted);font-size:11px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center}
.atp-node:hover .atp-node-expand,.atp-node.is-expanded .atp-node-expand{display:inline-flex}
.atp-node-expand:hover{color:var(--atp-accent);border-color:var(--atp-accent)}
.atp-node-port{position:absolute;top:26px;width:9px;height:9px;border-radius:50%;background:var(--atp-bg);border:2px solid #c47a12;transform:translateY(-50%);pointer-events:none;z-index:2}
.atp-node-port-left{left:-5px}
.atp-node-port-right{right:-5px}
.atp-node-body{padding:0 11px 10px;display:flex;flex:1;flex-direction:column;gap:6px;overflow:auto;min-height:0}
.atp-node-desc{font-size:10px;line-height:1.5;color:var(--atp-muted);white-space:pre-wrap;overflow-wrap:anywhere}
.atp-node-chips{display:flex;flex-wrap:wrap;gap:4px}
.atp-node-actions{display:flex;flex-wrap:wrap;gap:4px;padding-top:2px}
.atp-node-actions .atp-btn{font-size:10px;padding:4px 7px}
.atp-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px}
.atp-empty-card{max-width:520px;text-align:center;border:1px solid var(--atp-line);border-radius:14px;padding:22px;background:var(--atp-bg);box-shadow:0 12px 40px rgba(20,30,50,.08)}
.atp-empty-card h3{margin:0 0 8px;font-size:15px}
.atp-empty-card p{margin:0 0 6px;font-size:12px;line-height:1.6;color:var(--atp-muted)}
.atp-empty-card code{font-size:11px;background:var(--atp-panel);padding:1px 4px;border-radius:4px}
.atp-inspector{width:330px;flex:none;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--atp-line);background:var(--atp-panel);overflow:auto}
.atp-inspector-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--atp-line)}
.atp-inspector-head strong{font-size:12px}
.atp-inspector-title{font-size:14px;font-weight:700;line-height:1.35;padding:10px 12px 0;overflow-wrap:anywhere}
.atp-inspector-section{padding:9px 12px;border-bottom:1px solid var(--atp-line)}
.atp-inspector-section h4{margin:0 0 6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--atp-muted)}
.atp-fields{display:grid;grid-template-columns:minmax(78px,auto) minmax(0,1fr);gap:5px 10px;font-size:11px;margin:0}
.atp-fields dt{color:var(--atp-muted)}
.atp-fields dd{margin:0;overflow-wrap:anywhere;color:var(--atp-text)}
.atp-inspector-actions{display:flex;flex-wrap:wrap;gap:5px;padding:9px 12px;border-bottom:1px solid var(--atp-line)}
.atp-inspector-actions .atp-btn{font-size:10px;padding:5px 8px}
.atp-hint{font-size:10px;line-height:1.5;color:var(--atp-muted)}
.atp-legend{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:10px;color:var(--atp-muted);padding:8px 12px}
.atp-legend-line{display:inline-block;width:18px;height:3px;border-radius:2px;background:#c47a12}
.atp-legend-line.is-thin{height:1.5px;opacity:.7}
.atp-toast{position:fixed;right:18px;bottom:18px;z-index:1000;max-width:min(420px,calc(100vw - 36px));padding:9px 12px;border-radius:9px;border:1px solid var(--atp-line-strong);background:var(--atp-panel);color:var(--atp-text);font-size:12px;line-height:1.45;box-shadow:0 12px 30px rgba(20,30,50,.16)}
.atp-toast.is-error{border-color:rgba(192,68,68,.45);color:#9b3030;background:#fff5f5}
.atp-toast.is-ok{border-color:rgba(46,139,87,.4);color:#206b43;background:#f3fbf6}
.atp-modal-backdrop{position:fixed;inset:0;z-index:1100;background:rgba(16,24,40,.36);display:flex;align-items:center;justify-content:center;padding:18px}
.atp-modal{width:min(560px,100%);max-height:min(86vh,760px);overflow:auto;border-radius:14px;border:1px solid var(--atp-line);background:var(--atp-bg);box-shadow:0 24px 70px rgba(16,24,40,.3);padding:16px}
.atp-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.atp-modal-head h3{margin:0;font-size:15px}
.atp-form{display:grid;gap:9px}
.atp-form label{display:grid;gap:4px;font-size:11px;color:var(--atp-muted)}
.atp-form input,.atp-form textarea,.atp-form select{font:inherit;font-size:12px;padding:7px 8px;border-radius:7px;border:1px solid var(--atp-line-strong);background:var(--atp-bg);color:var(--atp-text);width:100%}
.atp-form textarea{min-height:72px;resize:vertical}
.atp-form .atp-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:4px 8px;max-height:150px;overflow:auto;padding:6px;border:1px solid var(--atp-line);border-radius:8px;background:var(--atp-panel)}
.atp-form .atp-check{display:flex;gap:6px;align-items:center;font-size:11px;color:var(--atp-text)}
.atp-form .atp-check input{width:auto}
.atp-form-foot{display:flex;justify-content:flex-end;gap:6px;margin-top:4px}
.atp-banner{margin:8px 18px;border:1px solid rgba(192,68,68,.35);background:#fff5f5;color:#9b3030;border-radius:8px;padding:7px 10px;font-size:11px}
.atp-muted{color:var(--atp-muted)}
.atp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes atp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.75)}}
@media (max-width:980px){.atp-inspector{width:290px}.atp-header{padding:10px 12px 8px}.atp-stats,.atp-roster{padding-left:12px;padding-right:12px}}
@media (max-width:760px){.atp-body{flex-direction:column}.atp-inspector{width:auto;max-height:42%;border-left:0;border-top:1px solid var(--atp-line)}.atp-actions{width:100%}}
@media (prefers-reduced-motion:reduce){.atp-live i{animation:none}.atp-node{transition:none}}
`;
function ensureStyles(documentRef) {
  if (!documentRef || !documentRef.head) return;
  const tagId = 'dsh-plugin-agent-team-panel/panel.css';
  try {
    if (documentRef.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return;
    const style = documentRef.createElement('style');
    style.dataset.plugin = 'dsh-plugin-agent-team-panel';
    style.dataset.pluginCss = tagId;
    style.textContent = CSS;
    documentRef.head.appendChild(style);
  } catch {
    /* styling is optional */
  }
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function fmtTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return String(value); }
}
function shortId(value) {
  const text = String(value == null ? '' : value);
  return text.length > 12 ? text.slice(0, 8) + '…' : text;
}
function taskOwnerMember(normalized, task) {
  if (!task || !task.ownerName) return null;
  return (normalized.members || []).find((member) => member.name === task.ownerName) || null;
}
function openMember(openSession, normalized, member) {
  if (!member) return;
  try {
    if (normalized.leadId && member.id !== normalized.leadId) {
      openSession({ parentSessionId: normalized.leadId, childSessionId: member.id, mode: 'continuable' });
    } else if (normalized.leadId) {
      openSession(normalized.leadId);
    } else {
      openSession(member.id);
    }
  } catch {
    /* navigation is best effort */
  }
}
function readTeamState(sessions, sessionId) {
  let leadId = sessionId;
  try {
    const binding = sessions.binding(sessionId);
    const snapshot = binding && binding.session && typeof binding.session.getSnapshot === 'function' ? binding.session.getSnapshot() : null;
    leadId = snapshot && snapshot.subagent && snapshot.subagent.address && snapshot.subagent.address.parentSessionId
      ? snapshot.subagent.address.parentSessionId
      : sessionId;
  } catch {
    leadId = sessionId;
  }
  let list = null;
  try { list = sessions.list.getSnapshot(); } catch { list = null; }
  const projection = list && list.projectionsBySession ? list.projectionsBySession[leadId] : null;
  const values = projection && projection.values ? projection.values : {};
  return {
    leadId,
    sessionId,
    team: values.agentTeam || null,
    goal: values.goal || null,
    listPhase: list && list.phase ? list.phase : null,
    observedAt: Date.now(),
  };
}
function useTeamState(sessions, sessionId) {
  const [raw, setRaw] = React.useState(() => readTeamState(sessions, sessionId));
  React.useEffect(() => {
    let alive = true;
    const update = () => { if (alive) setRaw(readTeamState(sessions, sessionId)); };
    update();
    let offList = null;
    let offSession = null;
    try { offList = sessions.list.subscribe(update); } catch { offList = null; }
    try {
      const binding = sessions.binding(sessionId);
      if (binding && binding.session && typeof binding.session.subscribe === 'function') offSession = binding.session.subscribe(update);
    } catch { offSession = null; }
    return () => {
      alive = false;
      try { if (typeof offList === 'function') offList(); } catch { /* best effort */ }
      try { if (typeof offSession === 'function') offSession(); } catch { /* best effort */ }
    };
  }, [sessions, sessionId]);
  return raw;
}
function loadPositions(leadId) {
  try {
    const text = window.localStorage.getItem(LAYOUT_PREFIX + String(leadId || ''));
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [id, point] of Object.entries(parsed)) {
      if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) out[id] = { x: Number(point.x), y: Number(point.y) };
    }
    return out;
  } catch { return {}; }
}
function savePositions(leadId, positions) {
  try { window.localStorage.setItem(LAYOUT_PREFIX + String(leadId || ''), JSON.stringify(positions)); } catch { /* best effort */ }
}
function postPanel(path, payload) {
  const fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
  if (!fetchImpl) return Promise.reject(Object.assign(new Error('当前页面没有 fetch'), { code: 'NO_FETCH' }));
  return fetchImpl(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-agent-team-panel': '1' },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.ok !== true) {
      const error = data && data.error ? data.error : null;
      const failure = new Error(error && error.message ? error.message : 'HTTP ' + response.status);
      failure.code = error && error.code ? error.code : 'HTTP_' + response.status;
      throw failure;
    }
    return data;
  });
}

// ── components ──────────────────────────────────────────────────────────────
function NewTaskModal(props) {
  const { normalized, busy, onClose, onSubmit } = props;
  const [subject, setSubject] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [blockedBy, setBlockedBy] = React.useState([]);
  const [writeScopes, setWriteScopes] = React.useState('');
  const tasks = normalized.tasks || [];
  const toggleBlocker = (id) => setBlockedBy((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : prev.concat(id));
  return el('div', { className: 'atp-modal-backdrop', role: 'presentation', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
    el('form', { className: 'atp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '新建任务', onSubmit: (event) => { event.preventDefault(); if (!subject.trim() || !description.trim()) return; onSubmit({ subject: subject.trim(), description: description.trim(), blockedBy, writeScopes: writeScopes.split(',').map((item) => item.trim()).filter(Boolean) }); } },
      el('div', { className: 'atp-modal-head' }, el('h3', null, '新建原生 Team 任务'), el('button', { type: 'button', className: 'atp-btn atp-btn-ghost', onClick: onClose, 'aria-label': '关闭' }, '×')),
      el('div', { className: 'atp-form' },
        el('label', null, '任务目标 / 标题', el('input', { value: subject, maxLength: 200, placeholder: '例如：验证登录链路', onChange: (e) => setSubject(e.target.value), required: true })),
        el('label', null, '详细说明与验收标准', el('textarea', { value: description, maxLength: 16384, placeholder: '写清范围、验收条件和已知限制', onChange: (e) => setDescription(e.target.value), required: true })),
        tasks.length > 0 ? el('label', null, '依赖任务（全部完成后才 ready）', el('div', { className: 'atp-check-grid' }, tasks.map((task) => el('label', { key: task.id, className: 'atp-check' }, el('input', { type: 'checkbox', checked: blockedBy.includes(task.id), onChange: () => toggleBlocker(task.id) }), el('span', null, task.id + ' · ' + (task.subject || '未命名')))))) : null,
        el('label', null, '写入范围提示（可选，逗号分隔）', el('input', { value: writeScopes, placeholder: 'src/**, docs/**', onChange: (e) => setWriteScopes(e.target.value) })),
        el('div', { className: 'atp-form-foot' }, el('button', { type: 'button', className: 'atp-btn', onClick: onClose, disabled: busy }, '取消'), el('button', { type: 'submit', className: 'atp-btn atp-btn-primary', disabled: busy || !subject.trim() || !description.trim() }, busy ? '提交中…' : '创建任务')),
      ),
    ),
  );
}
function SpawnModal(props) {
  const { busy, onClose, onSubmit } = props;
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [context, setContext] = React.useState('fresh');
  return el('div', { className: 'atp-modal-backdrop', role: 'presentation', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
    el('form', { className: 'atp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '创建 Team 成员', onSubmit: (event) => { event.preventDefault(); if (!name.trim() || !description.trim() || !prompt.trim()) return; onSubmit({ name: name.trim(), description: description.trim(), prompt: prompt.trim(), context }); } },
      el('div', { className: 'atp-modal-head' }, el('h3', null, '创建原生 Team 成员'), el('button', { type: 'button', className: 'atp-btn atp-btn-ghost', onClick: onClose, 'aria-label': '关闭' }, '×')),
      el('div', { className: 'atp-form' },
        el('label', null, '成员名（lower-kebab-case，不能叫 lead）', el('input', { value: name, maxLength: 64, placeholder: 'reviewer', onChange: (e) => setName(e.target.value), required: true })),
        el('label', null, '职责描述', el('input', { value: description, maxLength: 200, placeholder: '审查变更并给出验证结论', onChange: (e) => setDescription(e.target.value), required: true })),
        el('label', null, '初始任务 prompt', el('textarea', { value: prompt, placeholder: '你是 reviewer……先读……交付……', onChange: (e) => setPrompt(e.target.value), required: true })),
        el('label', null, '上下文', el('select', { value: context, onChange: (e) => setContext(e.target.value) }, el('option', { value: 'fresh' }, 'fresh（不继承 Lead 历史）'), el('option', { value: 'fork' }, 'fork（继承 Lead 已完成轮次）'))),
        el('div', { className: 'atp-form-foot' }, el('button', { type: 'button', className: 'atp-btn', onClick: onClose, disabled: busy }, '取消'), el('button', { type: 'submit', className: 'atp-btn atp-btn-primary', disabled: busy || !name.trim() || !description.trim() || !prompt.trim() }, busy ? '创建中…' : '创建成员')),
      ),
    ),
  );
}
function EditTaskModal(props) {
  const { task, busy, onClose, onSubmit } = props;
  const [subject, setSubject] = React.useState(task.subject || '');
  const [description, setDescription] = React.useState(task.description || '');
  return el('div', { className: 'atp-modal-backdrop', role: 'presentation', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
    el('form', { className: 'atp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '编辑任务', onSubmit: (event) => { event.preventDefault(); if (!subject.trim() || !description.trim()) return; onSubmit({ subject: subject.trim(), description: description.trim() }); } },
      el('div', { className: 'atp-modal-head' }, el('h3', null, '编辑任务 ' + task.id), el('button', { type: 'button', className: 'atp-btn atp-btn-ghost', onClick: onClose, 'aria-label': '关闭' }, '×')),
      el('div', { className: 'atp-form' },
        el('label', null, '任务目标 / 标题', el('input', { value: subject, maxLength: 200, onChange: (e) => setSubject(e.target.value), required: true })),
        el('label', null, '详细说明与验收标准', el('textarea', { value: description, maxLength: 16384, onChange: (e) => setDescription(e.target.value), required: true })),
        el('div', { className: 'atp-form-foot' }, el('button', { type: 'button', className: 'atp-btn', onClick: onClose, disabled: busy }, '取消'), el('button', { type: 'submit', className: 'atp-btn atp-btn-primary', disabled: busy || !subject.trim() || !description.trim() }, busy ? '保存中…' : '保存')),
      ),
    ),
  );
}
function MessageModal(props) {
  const { normalized, busy, onClose, onSubmit } = props;
  const targets = (normalized.members || []).filter((member) => member.name !== normalized.currentMember?.name);
  const [target, setTarget] = React.useState(targets[0]?.name || 'lead');
  const [message, setMessage] = React.useState('');
  return el('div', { className: 'atp-modal-backdrop', role: 'presentation', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
    el('form', { className: 'atp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '发送成员消息', onSubmit: (event) => { event.preventDefault(); if (!target || !message.trim()) return; onSubmit({ target, message: message.trim() }); } },
      el('div', { className: 'atp-modal-head' }, el('h3', null, '发送原生 Team 消息'), el('button', { type: 'button', className: 'atp-btn atp-btn-ghost', onClick: onClose, 'aria-label': '关闭' }, '×')),
      el('div', { className: 'atp-form' },
        el('label', null, '目标成员', el('select', { value: target, onChange: (e) => setTarget(e.target.value) }, targets.map((member) => el('option', { key: member.id, value: member.name }, member.name + (member.role === 'lead' ? ' · lead' : ''))))),
        el('label', null, '消息（自包含，说明需要对方做什么）', el('textarea', { value: message, onChange: (e) => setMessage(e.target.value), required: true })),
        el('div', { className: 'atp-form-foot' }, el('button', { type: 'button', className: 'atp-btn', onClick: onClose, disabled: busy }, '取消'), el('button', { type: 'submit', className: 'atp-btn atp-btn-primary', disabled: busy || !target || !message.trim() }, busy ? '发送中…' : '发送消息')),
      ),
    ),
  );
}
function TaskInspector(props) {
  const { task, normalized, busy, onAction, onEdit, onMessage, onSelectMember } = props;
  if (!task) return null;
  const owner = taskOwnerMember(normalized, task);
  const blockers = (task.blockedBy || []).map((id) => (normalized.tasks || []).find((item) => item.id === id)).filter(Boolean);
  const canClaim = task.status === 'pending' && task.ready && task.canMutate;
  const canRelease = task.status === 'in_progress' && task.canMutate;
  const canComplete = task.status === 'in_progress' && task.canMutate;
  const canReopen = task.status === 'completed' && task.canMutate;
  const goal = normalized.goal;
  return el('div', null,
    el('div', { className: 'atp-inspector-head' }, el('strong', null, '任务详情'), el('span', { className: 'atp-chip atp-chip-' + STAGE_TONE[task.stage] }, STAGE_LABEL[task.stage] || task.stage)),
    el('div', { className: 'atp-inspector-title' }, task.subject || '未命名任务'),
    el('div', { className: 'atp-inspector-actions' },
      canClaim ? el('button', { className: 'atp-btn atp-btn-primary', disabled: busy, onClick: () => onAction(task, 'claim') }, '认领') : null,
      canRelease ? el('button', { className: 'atp-btn', disabled: busy, onClick: () => onAction(task, 'release') }, '释放') : null,
      canComplete ? el('button', { className: 'atp-btn atp-btn-primary', disabled: busy, onClick: () => onAction(task, 'complete') }, '完成') : null,
      canReopen ? el('button', { className: 'atp-btn', disabled: busy, onClick: () => onAction(task, 'reopen') }, '重新打开') : null,
      task.canMutate ? el('button', { className: 'atp-btn', disabled: busy, onClick: () => onEdit(task) }, '编辑') : null,
      normalized.canReassign ? el('button', { className: 'atp-btn', disabled: busy, onClick: () => {
        const name = window.prompt('分配给成员（输入成员名，留空解除分配）', task.ownerName || '');
        if (name === null) return;
        onAction(task, 'reassign', { owner: name.trim() || undefined });
      } }, '分配') : null,
      task.canMutate ? el('button', { className: 'atp-btn atp-btn-danger', disabled: busy, onClick: () => { if (window.confirm('删除任务 ' + task.id + '？')) onAction(task, 'delete'); } }, '删除') : null,
    ),
    el('div', { className: 'atp-inspector-section' },
      el('h4', null, '目标与阶段'),
      el('dl', { className: 'atp-fields' },
        el('dt', null, '任务目标'), el('dd', null, task.subject || '—'),
        el('dt', null, '任务阶段'), el('dd', null, STAGE_LABEL[task.stage] + '（原生状态 ' + task.status + '）'),
        el('dt', null, 'Team Goal'), el('dd', null, goal ? (goal.objective + ' · ' + goal.phase) : '未绑定原生 Goal'),
        el('dt', null, '目标绑定'), el('dd', null, goal ? (goal.id + ' · 修订 ' + goal.revision + ' · 轮次 ' + goal.roundsStarted + '/' + goal.maxGoalRounds) : '当前 Team 没有 goal 投影'),
      ),
    ),
    el('div', { className: 'atp-inspector-section' },
      el('h4', null, '字段'),
      el('dl', { className: 'atp-fields' },
        el('dt', null, '任务 id'), el('dd', null, task.id),
        el('dt', null, 'revision'), el('dd', null, String(task.revision)),
        el('dt', null, '负责人'), el('dd', null, owner ? el('button', { className: 'atp-btn atp-btn-ghost', onClick: () => onSelectMember(owner) }, task.ownerName) : '未分配'),
        el('dt', null, 'ready'), el('dd', null, task.ready ? 'true（可认领）' : 'false'),
        el('dt', null, '依赖'), el('dd', null, blockers.length > 0 ? blockers.map((item) => item.id + ' ' + (item.subject || '')).join('、') : '无'),
        el('dt', null, '写入范围'), el('dd', null, (task.writeScopes || []).length > 0 ? task.writeScopes.join(', ') : '未声明'),
        el('dt', null, '说明'), el('dd', null, task.description || '—'),
      ),
    ),
    el('div', { className: 'atp-inspector-section' },
      el('h4', null, '原生调用'),
      el('p', { className: 'atp-hint' }, '操作走原生 TeamService（ctx.agentTeams），不是模型工具；权限由当前 live Agent 的 Team 角色判定。'),
      el('button', { className: 'atp-btn', disabled: busy, onClick: () => onMessage(task) }, '发送消息'),
    ),
  );
}
function MemberInspector(props) {
  const { member, normalized, onOpen } = props;
  if (!member) return null;
  const owned = (normalized.tasks || []).filter((task) => task.ownerName === member.name);
  return el('div', null,
    el('div', { className: 'atp-inspector-head' }, el('strong', null, '成员详情'), el('span', { className: 'atp-chip' }, member.role)),
    el('div', { className: 'atp-inspector-title' }, member.name),
    el('div', { className: 'atp-inspector-section' },
      el('dl', { className: 'atp-fields' },
        el('dt', null, '角色'), el('dd', null, member.role),
        el('dt', null, '阶段'), el('dd', null, member.phase),
        el('dt', null, '会话'), el('dd', null, member.id),
        el('dt', null, '任务'), el('dd', null, owned.length + ' 个（' + owned.map((task) => task.id).join(', ') + '）'),
      ),
    ),
    el('div', { className: 'atp-inspector-actions' },
      el('button', { className: 'atp-btn atp-btn-primary', onClick: () => onOpen(member) }, member.id === normalized.leadId ? '打开 Lead 会话' : '打开成员会话'),
    ),
  );
}
function emptyCard(title, text) {
  return el('div', { className: 'atp-empty' }, el('div', { className: 'atp-empty-card' }, el('h3', null, title), text));
}

function AgentTeamPanelView(props) {
  const sessionId = props && props.sessionId ? String(props.sessionId) : '';
  const sessions = props && props.sessions ? props.sessions : null;
  const openSession = props && typeof props.openSession === 'function' ? props.openSession : null;
  const raw = useTeamState(sessions, sessionId);
  const initial = props && props.initialState && typeof props.initialState === 'object' ? props.initialState : {};
  const normalized = React.useMemo(() => normalizeTeamView(raw.team, { goal: raw.goal, sessionId }), [raw.team, raw.goal, sessionId]);
  const graph = React.useMemo(() => buildTeamGraph(normalized), [normalized]);
  const [positions, setPositions] = React.useState(() => loadPositions(raw.leadId));
  const [expanded, setExpanded] = React.useState(() => new Set(Array.isArray(initial.expanded) ? initial.expanded : []));
  const [selected, setSelected] = React.useState(initial.selected || null);
  const [stageFilter, setStageFilter] = React.useState(initial.stage || 'all');
  const [view, setView] = React.useState({ x: 24, y: 24, k: 1 });
  const [ports, setPorts] = React.useState({});
  const [stageSize, setStageSize] = React.useState({ w: 1100, h: 680 });
  const [dragging, setDragging] = React.useState(null);
  const [modal, setModal] = React.useState(initial.modal || null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const stageRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const nodeRefs = React.useRef(new Map());
  const dragRef = React.useRef(null);
  const panRef = React.useRef(null);
  const suppressClickRef = React.useRef(false);
  const positionsRef = React.useRef(positions);
  const viewRef = React.useRef(view);
  const fittedRef = React.useRef(null);
  const toastTimer = React.useRef(null);

  React.useEffect(() => { positionsRef.current = positions; }, [positions]);
  React.useEffect(() => { viewRef.current = view; }, [view]);
  const leadRef = React.useRef(raw.leadId);
  React.useEffect(() => {
    if (leadRef.current === raw.leadId) return;
    leadRef.current = raw.leadId;
    setPositions(loadPositions(raw.leadId));
    fittedRef.current = null;
    setSelected(null);
    setExpanded(new Set());
  }, [raw.leadId]);
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageSize({ w: stage.clientWidth || 1100, h: stage.clientHeight || 680 });
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const prev = viewRef.current;
      const nextK = clamp(prev.k * factor, 0.22, 1.9);
      const scale = nextK / prev.k;
      setView({ k: nextK, x: mx - (mx - prev.x) * scale, y: my - (my - prev.y) * scale });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);
  const expandedMap = React.useMemo(() => {
    const out = {};
    for (const id of expanded) out[id] = true;
    return out;
  }, [expanded]);
  const visibleGraph = React.useMemo(() => {
    if (!graph || stageFilter === 'all') return graph;
    const nodes = (graph.tasks || []).filter((node) => node.stage === stageFilter);
    const ids = new Set(nodes.map((node) => node.taskId));
    return {
      ...graph,
      tasks: nodes,
      nodes: nodes.concat(Array.isArray(graph.members) ? graph.members : []),
      edges: (graph.edges || []).filter((edge) => ids.has(edge.taskId) && ids.has(edge.blockerId)),
    };
  }, [graph, stageFilter]);
  const layout = React.useMemo(() => layoutTeamGraph(visibleGraph, { positions, expanded: expandedMap }), [visibleGraph, positions, expandedMap]);
  const fallbackPorts = React.useMemo(() => {
    const out = {};
    for (const box of layout ? (layout.boxes || []) : []) {
      const y = box.y + 26;
      out[box.id] = { left: { x: box.x, y }, right: { x: box.x + box.w, y } };
    }
    return out;
  }, [layout]);
  const effectivePorts = React.useMemo(() => {
    const next = { ...fallbackPorts, ...ports };
    if (dragging) {
      delete next[dragging];
      delete next['task:' + dragging];
    }
    return next;
  }, [fallbackPorts, ports, dragging]);
  const routed = React.useMemo(() => routeTeamEdges(visibleGraph, layout, { ports: effectivePorts }), [visibleGraph, layout, effectivePorts]);

  const notify = React.useCallback((kind, text) => {
    setToast({ kind, text });
    try { if (toastTimer.current) window.clearTimeout(toastTimer.current); } catch { /* ignore */ }
    try { toastTimer.current = window.setTimeout(() => setToast(null), 4800); } catch { /* ignore */ }
  }, []);
  React.useEffect(() => () => { try { if (toastTimer.current) window.clearTimeout(toastTimer.current); } catch { /* ignore */ } }, []);

  const fit = React.useCallback(() => {
    if (!layout) return;
    const width = Math.max(1, layout.width);
    const height = Math.max(1, layout.height);
    const w = Math.max(320, stageSize.w || 1100);
    const h = Math.max(260, stageSize.h || 680);
    const nextK = clamp(Math.min((w - 72) / width, (h - 72) / height), 0.22, 1.5);
    setView({ k: nextK, x: (w - width * nextK) / 2, y: (h - height * nextK) / 2 });
  }, [layout, stageSize]);
  React.useEffect(() => {
    if (!layout || !stageSize.w || fittedRef.current === raw.leadId) return;
    fittedRef.current = raw.leadId;
    fit();
  }, [layout, stageSize, raw.leadId, fit]);

  React.useLayoutEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const measure = () => {
      const worldRect = world.getBoundingClientRect();
      const scale = view.k || 1;
      const next = {};
      for (const box of layout.boxes || []) {
        const node = nodeRefs.current.get(box.id);
        if (!node) continue;
        const left = node.querySelector('[data-atp-port="left"]');
        const right = node.querySelector('[data-atp-port="right"]');
        if (!left && !right) continue;
        const leftRect = left ? left.getBoundingClientRect() : null;
        const rightRect = right ? right.getBoundingClientRect() : null;
        next[box.id] = {
          left: leftRect ? { x: (leftRect.left + leftRect.width / 2 - worldRect.left) / scale, y: (leftRect.top + leftRect.height / 2 - worldRect.top) / scale } : { x: box.x, y: box.y + 26 },
          right: rightRect ? { x: (rightRect.left + rightRect.width / 2 - worldRect.left) / scale, y: (rightRect.top + rightRect.height / 2 - worldRect.top) / scale } : { x: box.x + box.w, y: box.y + 26 },
        };
      }
      if (Object.keys(next).length > 0) setPorts(next);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    for (const node of nodeRefs.current.values()) { try { observer.observe(node); } catch { /* ignore */ } }
    return () => observer.disconnect();
  }, [layout]);

  const selectedBox = selected && layout ? (layout.boxes || []).find((box) => box.id === selected) : null;
  const selectedTask = selectedBox && selectedBox.kind === 'task'
    ? (selectedBox.node && selectedBox.node.task ? selectedBox.node.task : (normalized.tasks || []).find((task) => task.id === (selectedBox.node && selectedBox.node.taskId)))
    : null;
  const selectedMember = selectedBox && selectedBox.kind === 'member' ? (selectedBox.node && selectedBox.node.member ? selectedBox.node.member : selectedBox.node) : null;
  const edgeList = routed && Array.isArray(routed.edges) ? routed.edges : [];
  const bundleList = routed && Array.isArray(routed.bundles) ? routed.bundles : [];

  function toggleExpand(taskId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }
  function openMemberFromNode(member) {
    if (!member) return;
    openMember(openSession, normalized, member);
  }
  function beginNodeDrag(event, box) {
    if (!box || box.kind !== 'task' || event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { taskId: box.node && box.node.taskId ? box.node.taskId : (box.node && box.node.task ? box.node.task.id : ''), boxId: box.id, sx: event.clientX, sy: event.clientY, ox: box.x, oy: box.y, moved: false };
    setDragging(box.node && box.node.taskId ? box.node.taskId : (box.node && box.node.task ? box.node.task.id : ''));
    try { if (stageRef.current && stageRef.current.setPointerCapture) stageRef.current.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }
  function beginPan(event) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target;
    if (target && target.closest && target.closest('[data-atp-node]')) return;
    event.preventDefault();
    panRef.current = { sx: event.clientX, sy: event.clientY, x: view.x, y: view.y };
    try { if (stageRef.current && stageRef.current.setPointerCapture) stageRef.current.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    setDragging(null);
  }
  function onStagePointerMove(event) {
    if (dragRef.current) {
      const drag = dragRef.current;
      const dx = (event.clientX - drag.sx) / (view.k || 1);
      const dy = (event.clientY - drag.sy) / (view.k || 1);
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      const next = { ...positionsRef.current, [drag.taskId]: { x: drag.ox + dx, y: drag.oy + dy } };
      positionsRef.current = next;
      setPositions(next);
      return;
    }
    if (panRef.current) {
      const pan = panRef.current;
      setView((prev) => ({ ...prev, x: pan.x + event.clientX - pan.sx, y: pan.y + event.clientY - pan.sy }));
    }
  }
  function endStagePointer(event) {
    if (dragRef.current) {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragging(null);
      if (drag.moved) {
        suppressClickRef.current = true;
        savePositions(raw.leadId, positionsRef.current);
        try { window.setTimeout(() => { suppressClickRef.current = false; }, 320); } catch { /* ignore */ }
      }
    }
    panRef.current = null;
    try { if (stageRef.current && stageRef.current.releasePointerCapture) stageRef.current.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  }
  function runMutation(path, payload, successText) {
    if (!sessionId) return;
    setBusy(true);
    postPanel(path, { sessionId, ...payload }).then(() => {
      notify('ok', successText);
      setModal(null);
    }).catch((error) => {
      notify('error', (error && error.code ? error.code + ': ' : '') + String(error && error.message ? error.message : error));
    }).finally(() => setBusy(false));
  }
  function taskAction(task, action, extra) {
    const payload = { taskId: task.id, expectedRevision: task.revision, action, ...extra };
    runMutation(ROUTES.updateTask, payload, '已提交：' + action + ' ' + task.id);
  }

  function renderMemberNode(box) {
    const node = box.node || {};
    const member = node.member || node;
    const owned = (normalized.tasks || []).filter((task) => task.ownerName === member.name);
    return el('div', {
      key: box.id,
      ref: (node) => { if (node) nodeRefs.current.set(box.id, node); else nodeRefs.current.delete(box.id); },
      className: 'atp-node atp-node-member' + (selected === box.id ? ' is-selected' : ''),
      style: { left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 14 },
      'data-atp-node': box.id,
      onClick: () => setSelected(box.id),
      onDoubleClick: () => openMemberFromNode(member),
      role: 'button',
      tabIndex: 0,
      onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(box.id); } },
    },
      el('div', { className: 'atp-node-head', style: { padding: '8px 10px', gap: 2 } },
        el('div', { className: 'atp-node-top' },
          el('span', { className: 'atp-member-dot' + (member.phase === 'active' ? ' is-running' : member.phase === 'failed' ? ' is-failed' : '') }),
          el('span', { className: 'atp-node-title' }, member.name || 'member'),
          el('span', { className: 'atp-node-stage' }, member.role || 'member'),
        ),
        el('div', { className: 'atp-node-meta' }, member.phase || '—', ' · ', String(owned.length), ' 个任务'),
      ),
      el('span', { className: 'atp-node-port atp-node-port-left', 'data-atp-port': 'left' }),
      el('span', { className: 'atp-node-port atp-node-port-right', 'data-atp-port': 'right' }),
    );
  }
  function renderTaskNode(box) {
    const node = box.node || {};
    const task = node.task || (normalized.tasks || []).find((item) => item.id === node.taskId) || {};
    const taskId = task.id || node.taskId || '';
    const isExpanded = expanded.has(taskId);
    const completed = task.status === 'completed';
    const cls = 'atp-node atp-node-task is-' + String(task.stage || node.stage || 'blocked') + (selected === box.id ? ' is-selected' : '') + (isExpanded ? ' is-expanded' : '') + (dragging === taskId ? ' is-dragging' : '');
    const owner = taskOwnerMember(normalized, task);
    return el('div', {
      key: box.id,
      ref: (node) => { if (node) nodeRefs.current.set(box.id, node); else nodeRefs.current.delete(box.id); },
      className: cls,
      style: { left: box.x, top: box.y, width: box.w, height: box.h },
      'data-atp-node': box.id,
      onClick: () => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        setSelected(box.id);
      },
      onDoubleClick: () => toggleExpand(taskId),
      role: 'group',
      'aria-label': '任务 ' + taskId + ' ' + (task.subject || ''),
    },
      el('div', { className: 'atp-node-head', onPointerDown: (event) => beginNodeDrag(event, box), onDoubleClick: (event) => { event.stopPropagation(); toggleExpand(taskId); } },
        el('div', { className: 'atp-node-top' },
          el('span', { className: 'atp-stage-dot is-' + String(task.stage || 'blocked') }),
          el('span', { className: 'atp-node-id' }, taskId),
          el('span', { className: 'atp-node-stage' }, STAGE_LABEL[task.stage] || task.stage),
        ),
        el('div', { className: 'atp-node-title', title: task.subject || '' }, task.subject || '未命名任务'),
        el('div', { className: 'atp-node-meta' },
          el('b', null, owner ? owner.name : 'unowned'),
          ' · r' + String(task.revision),
          completed ? ' · 已完成' : task.ready ? ' · ready' : ' · 阻塞 ' + String((task.blockedBy || []).length),
        ),
        el('button', { type: 'button', className: 'atp-node-expand', title: isExpanded ? '收起详情' : '展开详情', 'aria-label': isExpanded ? '收起详情' : '展开详情', onClick: (event) => { event.stopPropagation(); toggleExpand(taskId); } }, isExpanded ? '▴' : '▾'),
      ),
      el('span', { className: 'atp-node-port atp-node-port-left', 'data-atp-port': 'left' }),
      el('span', { className: 'atp-node-port atp-node-port-right', 'data-atp-port': 'right' }),
      isExpanded ? el('div', { className: 'atp-node-body' },
        el('div', { className: 'atp-node-desc' }, task.description || '（无说明）'),
        (task.blockedBy || []).length > 0 ? el('div', { className: 'atp-node-chips' }, el('span', { className: 'atp-chip' }, '依赖'), ...(task.blockedBy || []).map((id) => el('span', { key: id, className: 'atp-chip' }, id))) : null,
        (task.writeScopes || []).length > 0 ? el('div', { className: 'atp-node-chips' }, el('span', { className: 'atp-chip' }, '写入'), ...(task.writeScopes || []).map((scope) => el('span', { key: scope, className: 'atp-chip' }, scope))) : null,
        el('div', { className: 'atp-node-actions' },
          task.status === 'pending' && task.ready && task.canMutate ? el('button', { className: 'atp-btn atp-btn-primary', disabled: busy, onClick: () => taskAction(task, 'claim') }, '认领') : null,
          task.status === 'in_progress' && task.canMutate ? el('button', { className: 'atp-btn atp-btn-primary', disabled: busy, onClick: () => taskAction(task, 'complete') }, '完成') : null,
          task.canMutate ? el('button', { className: 'atp-btn', disabled: busy, onClick: () => setModal({ kind: 'edit', task }) }, '编辑') : null,
        ),
      ) : null,
    );
  }
  function renderEdge(edge) {
    const d = edge && (edge.d || edge.path);
    if (!d) return null;
    return el('path', {
      key: edge.id || d,
      d,
      className: 'atp-edge ' + (edge.bundleId ? 'atp-edge-branch' : 'atp-edge-branch'),
      style: { stroke: EDGE_COLOR, strokeWidth: Number(edge.width) || 1.8 },
      markerEnd: edge.arrow === false ? undefined : 'url(#atp-arrow)',
      'data-edge-type': edge.type || 'blockedBy',
      'data-edge-role': edge.bundleId ? 'branch' : 'single',
      'data-edge-bundle': edge.bundleId || undefined,
    });
  }
  function renderBundle(bundle) {
    if (!bundle || !bundle.trunk || !bundle.trunk.d) return null;
    return el('path', {
      key: bundle.id,
      d: bundle.trunk.d,
      className: 'atp-edge atp-edge-trunk',
      style: { stroke: EDGE_COLOR, strokeWidth: Number(bundle.width) || 3 },
      'data-edge-type': 'blockedBy',
      'data-edge-role': 'trunk',
      'data-edge-bundle': bundle.id,
      'data-bundle-count': bundle.count,
    });
  }

  const taskCount = (normalized.tasks || []).length;
  const failed = normalized.failure || (raw.team && raw.team.failure) || null;
  const header = el('header', { className: 'atp-header' },
    el('div', { className: 'atp-heading' },
      el('div', { className: 'atp-kicker' }, 'NATIVE AGENT TEAM · PROJECTION'),
      el('div', { className: 'atp-title' }, 'Agent Team 面板', raw.team ? el('span', { className: 'atp-live' }, el('i'), 'LIVE') : null),
      el('div', { className: 'atp-goal' },
        normalized.goal ? el('span', null, 'Goal ', el('b', null, normalized.goal.objective), ' · ', normalized.goal.phase, ' · ', normalized.goal.roundsStarted + '/' + normalized.goal.maxGoalRounds) : el('span', null, '未绑定原生 Goal'),
        el('span', null, 'Lead ', el('b', null, normalized.leadId ? shortId(normalized.leadId) : '—')),
      ),
    ),
    el('div', { className: 'atp-actions' },
      el('button', { type: 'button', className: 'atp-btn atp-btn-primary', disabled: !raw.team || busy, onClick: () => setModal({ kind: 'new-task' }) }, '+ 新建任务'),
      el('button', { type: 'button', className: 'atp-btn', disabled: !normalized.canSpawn || busy, title: normalized.canSpawn ? '原生 spawnTeammate' : '仅 Lead 可创建成员', onClick: () => setModal({ kind: 'spawn' }) }, '+ 创建成员'),
      el('button', { type: 'button', className: 'atp-btn', onClick: () => setModal({ kind: 'message' }), disabled: !raw.team || busy }, '发消息'),
      el('button', { type: 'button', className: 'atp-btn atp-btn-icon', title: '缩小', onClick: () => setView((prev) => ({ ...prev, k: clamp(prev.k / 1.12, 0.22, 1.9) })) }, '−'),
      el('button', { type: 'button', className: 'atp-btn atp-btn-icon', title: '放大', onClick: () => setView((prev) => ({ ...prev, k: clamp(prev.k * 1.12, 0.22, 1.9) })) }, '+'),
      el('button', { type: 'button', className: 'atp-btn', onClick: fit }, '适应'),
    ),
  );
  const stats = normalized.stats || {};
  const filterRow = el('div', { className: 'atp-stats' },
    el('span', null, '成员 ', el('b', null, String(stats.members || 0))),
    el('span', null, '任务 ', el('b', null, String(stats.tasks || 0))),
    el('span', null, 'ready ', el('b', null, String(stats.ready || 0))),
    el('span', null, '阻塞 ', el('b', null, String(stats.blocked || 0))),
    el('span', null, '进行中 ', el('b', null, String(stats.active || 0))),
    el('span', null, '完成 ', el('b', null, String(stats.done || 0))),
    el('span', null, '依赖边 ', el('b', null, String(stats.blockedByEdges || 0))),
    el('div', { className: 'atp-filters' },
      ...['all', 'blocked', 'ready', 'active', 'done'].map((stage) => el('button', {
        key: stage,
        type: 'button',
        className: 'atp-filter' + (stageFilter === stage ? ' is-active' : ''),
        onClick: () => setStageFilter(stage),
      }, stage === 'all' ? '全部' : STAGE_LABEL[stage], stage === 'all' ? '' : ' ' + String(stats[stage] || 0))),
    ),
  );
  const roster = (normalized.members || []).length > 0 ? el('div', { className: 'atp-roster' },
    el('span', { className: 'atp-roster-label' }, 'ROSTER'),
    ...(normalized.members || []).map((member) => el('button', {
      key: member.id,
      type: 'button',
      className: 'atp-member' + (selected === 'member:' + member.id ? ' is-current' : ''),
      onClick: () => setSelected('member:' + member.id),
      onDoubleClick: () => openMemberFromNode(member),
      title: member.id,
    }, el('span', { className: 'atp-member-dot' + (member.phase === 'active' ? ' is-running' : member.phase === 'failed' ? ' is-failed' : '') }), member.name, el('small', null, member.role === 'lead' ? 'lead' : member.phase))),
  ) : null;

  let content = null;
  if (!raw.team) {
    content = emptyCard('尚未连接原生 Agent Team', el('div', null,
      el('p', null, '本面板只读原生 Agent Team 投影。请先让 Lead 创建一个 teammate 或任务；Team 未启用时没有可显示的状态。'),
      el('p', null, '不会使用第二套任务存储或模型工具。'),
    ));
  } else if (taskCount === 0) {
    content = emptyCard('Team 已连接，还没有任务', el('div', null,
      el('p', null, '用右上角「新建任务」调用原生 team_task_create；用「创建成员」调用原生 spawn_teammate。'),
      el('p', { className: 'atp-hint' }, '成员 ' + String((normalized.members || []).length) + ' · 当前会话 ' + shortId(sessionId)),
    ));
  } else if (!layout || layout.boxes.length === 0) {
    content = emptyCard('当前筛选没有任务', el('p', null, '切回“全部”或等待 Team 更新。'));
  } else {
    content = el('div', { className: 'atp-body' },
      el('div', {
        className: 'atp-stage' + (dragging ? '' : ''),
        ref: stageRef,
        onPointerDown: beginPan,
        onPointerMove: onStagePointerMove,
        onPointerUp: endStagePointer,
        onPointerCancel: endStagePointer,
      },
        el('div', {
          className: 'atp-world',
          ref: worldRef,
          style: { transform: 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')' },
        },
          el('svg', { className: 'atp-edges', width: layout.width, height: layout.height, viewBox: '0 0 ' + layout.width + ' ' + layout.height, 'aria-hidden': 'true' },
            el('defs', null, el('marker', { id: 'atp-arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, el('path', { d: 'M0 0 L8 4 L0 8 Z', fill: EDGE_COLOR }))),
            ...bundleList.map(renderBundle),
            ...edgeList.map(renderEdge),
            ...bundleList.filter((bundle) => bundle && bundle.junction).map((bundle) => el('circle', { key: 'j:' + (bundle.id || bundle.hubId), className: 'atp-junction', cx: bundle.junction.x, cy: bundle.junction.y, r: 3.4 })),
            ...bundleList.filter((bundle) => bundle && bundle.hub && bundle.junction).map((bundle) => el('text', { key: 'bl:' + bundle.id, className: 'atp-edge-label', x: (bundle.hub.x + bundle.junction.x) / 2, y: (bundle.hub.y + bundle.junction.y) / 2 - 4, textAnchor: 'middle' }, '依赖 ×' + String(bundle.count))),
          ),
          ...layout.boxes.map((box) => box.kind === 'member' ? renderMemberNode(box) : renderTaskNode(box)),
        ),
      ),
      el('aside', { className: 'atp-inspector' },
        selectedTask ? el(TaskInspector, { task: selectedTask, normalized, busy, onAction: taskAction, onEdit: (task) => setModal({ kind: 'edit', task }), onMessage: (task) => setModal({ kind: 'message', task }), onSelectMember: (member) => setSelected('member:' + member.id) })
          : selectedMember ? el(MemberInspector, { member: selectedMember, normalized, onOpen: openMemberFromNode })
            : el('div', null,
              el('div', { className: 'atp-inspector-head' }, el('strong', null, 'Team 概览')),
              el('div', { className: 'atp-inspector-section' },
                el('dl', { className: 'atp-fields' },
                  el('dt', null, 'Lead'), el('dd', null, normalized.leadId ? shortId(normalized.leadId) : '—'),
                  el('dt', null, '当前会话'), el('dd', null, normalized.currentMember ? normalized.currentMember.name : shortId(sessionId)),
                  el('dt', null, 'Team Goal'), el('dd', null, normalized.goal ? normalized.goal.objective : '未绑定'),
                  el('dt', null, '阶段分布'), el('dd', null, 'ready ' + String(stats.ready || 0) + ' · 进行中 ' + String(stats.active || 0) + ' · 完成 ' + String(stats.done || 0) + ' · 阻塞 ' + String(stats.blocked || 0)),
                ),
              ),
              el('div', { className: 'atp-inspector-section' },
                el('h4', null, '怎么用'),
                el('p', { className: 'atp-hint' }, '拖动标题移动任务；双击/▾ 展开详情；连线从 blocker 指向依赖它的任务。多条任务依赖同一个 blocker 时合成粗干线，支线从同一汇合点连续衔接。'),
                el('p', { className: 'atp-hint' }, '所有写操作调用原生 ctx.agentTeams；面板不保存 Team 状态，数据来自 agentTeam 投影并实时刷新。'),
              ),
              el('div', { className: 'atp-legend' },
                el('span', null, el('i', { className: 'atp-legend-line' }), '粗线束'),
                el('span', null, el('i', { className: 'atp-legend-line is-thin' }), '单条依赖'),
                el('span', null, '● 汇合点'),
              ),
            ),
      ),
    );
  }

  return el('section', { className: 'atp-root', 'data-agent-team-panel': '1' },
    header,
    failed ? el('div', { className: 'atp-banner', role: 'alert' }, '原生 agentTeam 投影失败：' + String(failed)) : null,
    stats.tasks !== undefined ? filterRow : null,
    roster,
    content,
    modal && modal.kind === 'new-task' ? el(NewTaskModal, { normalized, busy, onClose: () => setModal(null), onSubmit: (payload) => runMutation(ROUTES.createTask, payload, '已创建原生 Team 任务') }) : null,
    modal && modal.kind === 'spawn' ? el(SpawnModal, { busy, onClose: () => setModal(null), onSubmit: (payload) => runMutation(ROUTES.spawnTeammate, payload, '已请求原生 spawnTeammate') }) : null,
    modal && modal.kind === 'edit' && modal.task ? el(EditTaskModal, { task: modal.task, busy, onClose: () => setModal(null), onSubmit: (payload) => runMutation(ROUTES.updateTask, { taskId: modal.task.id, expectedRevision: modal.task.revision, action: 'edit', ...payload }, '已保存任务 ' + modal.task.id) }) : null,
    modal && modal.kind === 'message' ? el(MessageModal, { normalized, busy, onClose: () => setModal(null), onSubmit: (payload) => runMutation(ROUTES.sendMessage, payload, '已发送原生 Team 消息') }) : null,
    toast ? el('div', { className: 'atp-toast ' + (toast.kind === 'error' ? 'is-error' : toast.kind === 'ok' ? 'is-ok' : ''), role: 'status' }, toast.text) : null,
  );
}

const inject = ['sessions', 'slots', 'uiWorkspace'];

function apply(ctx) {
  const documentRef = typeof document === 'undefined' ? null : document;
  ensureStyles(documentRef);
  if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return;
  const sessions = ctx.sessions;
  const workspace = ctx.uiWorkspace;
  const openSession = workspace && typeof workspace.openSession === 'function' ? (target) => workspace.openSession(target) : null;
  if (!sessions) return;
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: VIEW_ID,
    order: 30,
    label: () => 'Agent Team',
    inject: (sessionId) => ({ sessionId, sessions, openSession }),
  }, AgentTeamPanelView));
}

exports.apply = apply;
exports.inject = inject;
exports.__test = {
  VIEW_ID,
  ROUTES,
  AgentTeamPanelView,
  readTeamState,
  loadPositions,
  savePositions,
  postPanel,
  normalizeTeamView,
  buildTeamGraph,
  layoutTeamGraph,
  routeTeamEdges,
  deriveStage,
  normalizeGoal,
};

    return module.exports;
  }
});
