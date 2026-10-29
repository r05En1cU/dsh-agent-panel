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

export const TASK_WIDTH = 232;
export const TASK_HEIGHT = 92;
export const TASK_EXPANDED_HEIGHT = 192;
export const MEMBER_WIDTH = 168;
export const MEMBER_HEIGHT = 64;
export const MEMBER_EXPANDED_HEIGHT = 120;
export const PADDING = 32;
export const COLUMN_GAP = 112;
export const ROW_GAP = 28;
export const MEMBER_GAP = 12;
export const MEMBER_COLUMN_GAP = 72;
export const SINGLE_EDGE_WIDTH = 1.8;
export const BRANCH_EDGE_WIDTH = 1.8;
export const TRUNK_BASE_WIDTH = 2.8;
export const TRUNK_STEP_WIDTH = 1.1;
export const TRUNK_MAX_WIDTH = 8;
export const BUNDLE_MIN_LENGTH = 30;
export const BUNDLE_MAX_LENGTH = 140;
export const BUNDLE_LENGTH_RATIO = 0.5;

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
export function layoutTeamGraph(graph, options = {}) {
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
export function routeTeamEdges(graph, layout, options = {}) {
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
