import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTeamView, buildTeamGraph } from '../src/model.mjs';
import {
  layoutTeamGraph,
  routeTeamEdges,
  TASK_WIDTH,
  TASK_HEIGHT,
  TASK_EXPANDED_HEIGHT,
  MEMBER_WIDTH,
  MEMBER_HEIGHT,
  MEMBER_EXPANDED_HEIGHT,
  MEMBER_GAP,
  PADDING,
  COLUMN_GAP,
  ROW_GAP,
  MEMBER_COLUMN_GAP,
  SINGLE_EDGE_WIDTH,
  BRANCH_EDGE_WIDTH,
  TRUNK_BASE_WIDTH,
  TRUNK_STEP_WIDTH,
  TRUNK_MAX_WIDTH,
  BUNDLE_MIN_LENGTH,
  BUNDLE_MAX_LENGTH,
} from '../src/geometry.mjs';

function task(id, extra = {}) {
  return {
    id,
    revision: 1,
    subject: 'subject ' + id,
    description: '',
    status: 'pending',
    blockedBy: [],
    writeScopes: [],
    ready: false,
    writeScopeWarnings: [],
    ...extra,
  };
}

function member(id, role = 'teammate', extra = {}) {
  return { id, name: id, role, phase: 'active', ...extra };
}

function graphOf(tasks, members = [member('lead', 'lead')]) {
  return buildTeamGraph(normalizeTeamView({ members, tasks }));
}

function boxOf(layout, id) {
  const box = layout.boxes.find((entry) => entry.id === id);
  assert.ok(box, 'missing box ' + id);
  return box;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fanOutTasks(count) {
  const tasks = [task('task-1', { status: 'completed' })];
  for (let index = 2; index <= count + 1; index += 1) {
    tasks.push(task('task-' + index, { blockedBy: ['task-1'] }));
  }
  return tasks;
}

test('an empty graph lays out to an empty canvas and routes nothing', () => {
  const emptyGraph = buildTeamGraph(normalizeTeamView(null));
  const layout = layoutTeamGraph(emptyGraph);
  assert.deepEqual(layout, { width: 0, height: 0, boxes: [], tasks: [], members: [], levels: [] });
  assert.deepEqual(routeTeamEdges(emptyGraph, layout), { edges: [], bundles: [], ports: {} });

  // Null-ish inputs are treated as an empty graph, never as invented nodes.
  assert.deepEqual(layoutTeamGraph(null), layout);
  assert.deepEqual(routeTeamEdges(null, layout), { edges: [], bundles: [], ports: {} });
});

test('layout puts blockers on lower layers and dependents to their right', () => {
  const graph = graphOf([
    task('task-1', { status: 'completed' }),
    task('task-2', { status: 'in_progress', blockedBy: ['task-1'] }),
    task('task-4', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1', 'task-2'] }),
  ]);
  const layout = layoutTeamGraph(graph);

  assert.deepEqual(layout.levels.map((level) => [level.level, level.taskIds]), [
    [0, ['task-1']],
    [1, ['task-2', 'task-4']],
    [2, ['task-3']],
  ]);
  assert.deepEqual(layout.levels.map((level) => level.x), [PADDING, PADDING + TASK_WIDTH + COLUMN_GAP, PADDING + 2 * (TASK_WIDTH + COLUMN_GAP)]);

  const task1 = boxOf(layout, 'task:task-1');
  const task2 = boxOf(layout, 'task:task-2');
  const task4 = boxOf(layout, 'task:task-4');
  const task3 = boxOf(layout, 'task:task-3');

  assert.ok(task1.x < task2.x, 'blocker is left of its dependent');
  assert.ok(task2.x < task3.x, 'chained blocker is left of its dependent');
  assert.equal(task2.x, task4.x, 'same layer shares one column');
  assert.ok(task2.y < task4.y, 'same layer stacks in wire order');
  assert.equal(task4.y - task2.y, TASK_HEIGHT + ROW_GAP);
  assert.equal(task1.w, TASK_WIDTH);
  assert.equal(task1.h, TASK_HEIGHT);
  assert.equal(task1.node.id, 'task:task-1');

  assert.equal(layout.width, Math.max(...layout.boxes.map((box) => box.x + box.w)) + PADDING);
  assert.equal(layout.height, Math.max(...layout.boxes.map((box) => box.y + box.h)) + PADDING);
  assert.equal(layout.tasks.length, 4);
  assert.equal(layout.members.length, 1);
});

test('the member roster sits in its own column to the right of the task layers', () => {
  const graph = graphOf([task('task-1')], [member('lead', 'lead'), member('ada')]);
  const layout = layoutTeamGraph(graph);
  const taskBox = boxOf(layout, 'task:task-1');
  const leadBox = boxOf(layout, 'member:lead');
  const adaBox = boxOf(layout, 'member:ada');

  assert.equal(layout.members.length, 2);
  assert.equal(leadBox.kind, 'member');
  assert.equal(leadBox.node.role, 'lead');
  assert.equal(leadBox.w, MEMBER_WIDTH);
  assert.equal(leadBox.h, MEMBER_HEIGHT);
  assert.equal(leadBox.x, taskBox.x + TASK_WIDTH + MEMBER_COLUMN_GAP);
  assert.ok(leadBox.x > taskBox.x + taskBox.w, 'member column is right of the task boxes');
  assert.equal(adaBox.y, leadBox.y + MEMBER_HEIGHT + MEMBER_GAP);

  const expanded = layoutTeamGraph(graph, { expanded: { 'member:lead': true } });
  assert.equal(boxOf(expanded, 'member:lead').h, MEMBER_EXPANDED_HEIGHT);
  assert.equal(boxOf(expanded, 'member:ada').h, MEMBER_HEIGHT);
});

test('dragging a box moves its ports and the routed edge follows', () => {
  const graph = graphOf([task('task-1'), task('task-2', { blockedBy: ['task-1'] })]);
  const layout = layoutTeamGraph(graph, { positions: { 'task-2': { x: 900, y: 640 } } });
  const moved = boxOf(layout, 'task:task-2');
  assert.equal(moved.x, 900);
  assert.equal(moved.y, 640);

  const routes = routeTeamEdges(graph, layout);
  assert.equal(routes.edges.length, 1);
  const edge = routes.edges[0];
  assert.equal(edge.from, 'task:task-1');
  assert.equal(edge.to, 'task:task-2');
  assert.equal(edge.bundleId, null);
  assert.equal(edge.width, SINGLE_EDGE_WIDTH);
  assert.equal(edge.arrow, true);
  assert.deepEqual(edge.points[1], { x: 900, y: 640 + TASK_HEIGHT / 2 });
  assert.deepEqual(edge.points[0], routes.ports['task:task-1'].right);
  assert.deepEqual(routes.ports['task:task-2'].left, edge.points[1]);
});

test('expanded boxes use the same routing with the taller box center', () => {
  const graph = graphOf([task('task-1'), task('task-2', { blockedBy: ['task-1'] })]);
  const collapsed = layoutTeamGraph(graph);
  const expanded = layoutTeamGraph(graph, {
    expanded: { 'task-2': true },
    positions: { 'task-2': { x: 900, y: 640 } },
  });

  assert.equal(boxOf(collapsed, 'task:task-2').h, TASK_HEIGHT);
  assert.equal(boxOf(expanded, 'task:task-2').h, TASK_EXPANDED_HEIGHT);

  const collapsedRoutes = routeTeamEdges(graph, collapsed);
  const expandedRoutes = routeTeamEdges(graph, expanded);
  const collapsedBox = boxOf(collapsed, 'task:task-2');
  assert.deepEqual(collapsedRoutes.edges[0].points[1], {
    x: collapsedBox.x,
    y: collapsedBox.y + TASK_HEIGHT / 2,
  });
  assert.deepEqual(expandedRoutes.edges[0].points[1], { x: 900, y: 640 + TASK_EXPANDED_HEIGHT / 2 });
  assert.notDeepEqual(collapsedRoutes.edges[0].points[1], expandedRoutes.edges[0].points[1]);
});

test('two dependents of one blocker form one coarse bundle with an exact shared junction', () => {
  const graph = graphOf([
    task('task-1', { status: 'completed' }),
    task('task-2', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1'] }),
  ]);
  const layout = layoutTeamGraph(graph);
  const routes = routeTeamEdges(graph, layout);

  assert.equal(routes.bundles.length, 1);
  const bundle = routes.bundles[0];
  assert.equal(bundle.id, 'blockedBy:task-1');
  assert.equal(bundle.count, 2);
  assert.equal(bundle.from, 'task:task-1');
  assert.equal(bundle.blockerId, 'task-1');
  assert.equal(bundle.width, 3.9);
  assert.ok(Math.abs(bundle.width - Math.min(TRUNK_MAX_WIDTH, TRUNK_BASE_WIDTH + TRUNK_STEP_WIDTH * (bundle.count - 1))) < 1e-9);

  assert.equal(bundle.trunk.arrow, false);
  assert.equal(bundle.trunk.width, bundle.width);
  assert.equal(bundle.trunk.points.length, 2);
  assert.deepEqual(bundle.trunk.points[0], routes.ports['task:task-1'].right);
  assert.deepEqual(bundle.hub, routes.ports['task:task-1'].right);
  assert.deepEqual(bundle.trunk.points[1], bundle.junction);
  assert.ok(bundle.junction.x > bundle.hub.x, 'junction lies between hub and target ports');
  assert.ok(bundle.junction.x < Math.min(...bundle.branches.map((branch) => branch.points[1].x)));

  assert.equal(bundle.branches.length, 2);
  for (const branch of bundle.branches) {
    assert.equal(branch.width, BRANCH_EDGE_WIDTH);
    assert.equal(branch.arrow, true);
    // Continuity contract: the trunk end and every branch start are the exact same point.
    assert.deepEqual(branch.points[0], bundle.trunk.points[1]);
    assert.deepEqual(branch.points[0], bundle.junction);
    assert.deepEqual(branch.points[1], routes.ports[branch.to].left);
  }

  assert.equal(routes.edges.length, 2);
  for (const edge of routes.edges) {
    assert.equal(edge.bundleId, bundle.id);
    assert.equal(edge.width, BRANCH_EDGE_WIDTH);
    assert.equal(edge.arrow, true);
    const branch = bundle.branches.find((entry) => entry.to === edge.to);
    assert.ok(branch, 'edge ' + edge.id + ' has a branch');
    assert.deepEqual(edge.points, branch.points);
    assert.equal(edge.d, branch.d);
  }
  assert.deepEqual(bundle.edgeIds, routes.edges.map((edge) => edge.id));
});

test('three and six dependents keep exact bundle continuity and cap the trunk width', () => {
  const three = graphOf(fanOutTasks(3));
  const threeRoutes = routeTeamEdges(three, layoutTeamGraph(three));
  assert.equal(threeRoutes.bundles.length, 1);
  assert.equal(threeRoutes.bundles[0].count, 3);
  assert.equal(threeRoutes.bundles[0].width, 5);
  assert.equal(threeRoutes.bundles[0].branches.length, 3);
  for (const branch of threeRoutes.bundles[0].branches) {
    assert.deepEqual(branch.points[0], threeRoutes.bundles[0].trunk.points[1]);
  }

  const six = graphOf(fanOutTasks(6));
  const sixRoutes = routeTeamEdges(six, layoutTeamGraph(six));
  assert.equal(sixRoutes.bundles.length, 1);
  assert.equal(sixRoutes.bundles[0].count, 6);
  assert.equal(sixRoutes.bundles[0].width, TRUNK_MAX_WIDTH);
  assert.equal(sixRoutes.bundles[0].branches.length, 6);
  for (const branch of sixRoutes.bundles[0].branches) {
    assert.deepEqual(branch.points[0], sixRoutes.bundles[0].trunk.points[1]);
  }
});

test('a single dependent stays a thin unbundled edge with an arrow', () => {
  const graph = graphOf([task('task-1'), task('task-2', { blockedBy: ['task-1'] })]);
  const layout = layoutTeamGraph(graph);
  const routes = routeTeamEdges(graph, layout);

  assert.deepEqual(routes.bundles, []);
  assert.equal(routes.edges.length, 1);
  const edge = routes.edges[0];
  assert.equal(edge.width, SINGLE_EDGE_WIDTH);
  assert.equal(edge.bundleId, null);
  assert.equal(edge.arrow, true);
  assert.equal(edge.points.length, 2);
  assert.deepEqual(edge.points, [
    routes.ports['task:task-1'].right,
    routes.ports['task:task-2'].left,
  ]);
});

test('bundles group per blocker, so two blockers produce two independent bundles', () => {
  const graph = graphOf([
    task('task-1'),
    task('task-2'),
    task('task-3', { blockedBy: ['task-1'] }),
    task('task-4', { blockedBy: ['task-1'] }),
    task('task-5', { blockedBy: ['task-2'] }),
    task('task-6', { blockedBy: ['task-2'] }),
  ]);
  const routes = routeTeamEdges(graph, layoutTeamGraph(graph));
  assert.deepEqual(routes.bundles.map((bundle) => [bundle.blockerId, bundle.count]), [
    ['task-1', 2],
    ['task-2', 2],
  ]);
  for (const bundle of routes.bundles) {
    assert.equal(bundle.branches.length, 2);
    assert.deepEqual(bundle.trunk.points[1], bundle.junction);
    for (const branch of bundle.branches) assert.deepEqual(branch.points[0], bundle.junction);
  }
});

test('measured ports override box anchors exactly', () => {
  const graph = graphOf([
    task('task-1'),
    task('task-2', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1'] }),
  ]);
  const layout = layoutTeamGraph(graph);
  const ports = {
    'task:task-1': { left: { x: 10, y: 20 }, right: { x: 110, y: 20 } },
    'task:task-2': { left: { x: 300, y: 40 }, right: { x: 400, y: 40 } },
    'task:task-3': { left: { x: 300, y: 90 }, right: { x: 400, y: 90 } },
  };
  const routes = routeTeamEdges(graph, layout, { ports });

  assert.deepEqual(routes.ports['task:task-1'], ports['task:task-1']);
  assert.deepEqual(routes.ports['task:task-2'], ports['task:task-2']);
  assert.deepEqual(routes.ports['task:task-3'], ports['task:task-3']);

  const bundle = routes.bundles[0];
  assert.deepEqual(bundle.hub, { x: 110, y: 20 });
  assert.deepEqual(bundle.trunk.points[0], { x: 110, y: 20 });
  for (const branch of bundle.branches) {
    assert.deepEqual(branch.points[1], ports[branch.to].left);
  }
});

test('measured ports also drive single edges', () => {
  const graph = graphOf([task('task-1'), task('task-2', { blockedBy: ['task-1'] })]);
  const layout = layoutTeamGraph(graph);
  const ports = {
    'task:task-1': { left: { x: 0, y: 0 }, right: { x: 50, y: 5 } },
    'task:task-2': { left: { x: 500, y: 60 }, right: { x: 600, y: 60 } },
  };
  const routes = routeTeamEdges(graph, layout, { ports });
  assert.deepEqual(routes.edges[0].points, [
    { x: 50, y: 5 },
    { x: 500, y: 60 },
  ]);
});

test('the junction distance is clamped to the bundle bounds', () => {
  const graph = graphOf([
    task('task-1'),
    task('task-2', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1'] }),
  ]);
  const layout = layoutTeamGraph(graph);

  const near = routeTeamEdges(graph, layout, {
    ports: {
      'task:task-1': { left: { x: 0, y: 100 }, right: { x: 100, y: 100 } },
      'task:task-2': { left: { x: 110, y: 100 }, right: { x: 200, y: 100 } },
      'task:task-3': { left: { x: 110, y: 105 }, right: { x: 200, y: 105 } },
    },
  });
  const nearBundle = near.bundles[0];
  const nearDistance = Math.hypot(nearBundle.junction.x - nearBundle.hub.x, nearBundle.junction.y - nearBundle.hub.y);
  // The junction is rounded to 1/1000 px for the SVG path; allow that rounding here.
  assert.ok(Math.abs(nearDistance - BUNDLE_MIN_LENGTH) < 0.01, 'near distance ' + nearDistance);

  const far = routeTeamEdges(graph, layout, {
    ports: {
      'task:task-1': { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
      'task:task-2': { left: { x: 1000, y: 0 }, right: { x: 1100, y: 0 } },
      'task:task-3': { left: { x: 1000, y: 60 }, right: { x: 1100, y: 60 } },
    },
  });
  const farBundle = far.bundles[0];
  const farDistance = Math.hypot(farBundle.junction.x - farBundle.hub.x, farBundle.junction.y - farBundle.hub.y);
  assert.ok(Math.abs(farDistance - BUNDLE_MAX_LENGTH) < 0.01, 'far distance ' + farDistance);
});

test('self loops and edges with missing endpoints are dropped', () => {
  const graph = graphOf([task('task-1'), task('task-2', { blockedBy: ['task-1'] })]);
  graph.edges.push({
    id: 'blockedBy:task-1:task-1',
    type: 'blockedBy',
    taskId: 'task-1',
    blockerId: 'task-1',
    from: 'task:task-1',
    to: 'task:task-1',
  });
  graph.edges.push({
    id: 'blockedBy:task-2:ghost',
    type: 'blockedBy',
    taskId: 'task-2',
    blockerId: 'ghost',
    from: 'task:ghost',
    to: 'task:task-2',
  });

  const layout = layoutTeamGraph(graph);
  assert.deepEqual(layout.levels.map((level) => level.taskIds), [['task-1'], ['task-2']]);
  const routes = routeTeamEdges(graph, layout);
  assert.equal(routes.edges.length, 1);
  assert.deepEqual(routes.bundles, []);
  assert.equal(routes.edges[0].id, 'blockedBy:task-2:task-1');
});

test('layout and routing are deterministic, and the graph is not mutated', () => {
  const graph = graphOf([
    task('task-1', { status: 'completed' }),
    task('task-2', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1'] }),
    task('task-4', { blockedBy: ['task-2', 'task-3'] }),
  ], [member('lead', 'lead'), member('ada')]);
  const before = clone(graph);

  const layoutA = layoutTeamGraph(graph);
  const layoutB = layoutTeamGraph(graph);
  assert.deepEqual(layoutA, layoutB);

  const routesA = routeTeamEdges(graph, layoutA);
  const routesB = routeTeamEdges(graph, layoutA);
  assert.deepEqual(routesA, routesB);
  assert.equal(JSON.stringify(routesA), JSON.stringify(routesB));
  assert.deepEqual(graph, before);
});

test('an empty layout still exposes ports for boxed nodes but routes nothing', () => {
  const graph = graphOf([task('task-1')]);
  const layout = layoutTeamGraph(graph);
  const routes = routeTeamEdges(graph, layout);
  assert.deepEqual(routes.edges, []);
  assert.deepEqual(routes.bundles, []);
  assert.deepEqual(Object.keys(routes.ports), ['task:task-1', 'member:lead']);
  assert.deepEqual(routes.ports['task:task-1'], {
    left: { x: PADDING, y: PADDING + TASK_HEIGHT / 2 },
    right: { x: PADDING + TASK_WIDTH, y: PADDING + TASK_HEIGHT / 2 },
  });
});
test('a moved blocker and an expanded dependent keep the same bundle contract', () => {
  const graph = graphOf([
    task('task-1', { status: 'completed' }),
    task('task-2', { blockedBy: ['task-1'] }),
    task('task-3', { blockedBy: ['task-1'] }),
  ]);
  const layout = layoutTeamGraph(graph, {
    positions: {
      'task-1': { x: 100, y: 500 },
      'task-2': { x: 800, y: 300 },
      'task-3': { x: 800, y: 600 },
    },
    expanded: { 'task-2': true },
  });
  const routes = routeTeamEdges(graph, layout);
  const bundle = routes.bundles[0];

  assert.equal(boxOf(layout, 'task:task-2').h, TASK_EXPANDED_HEIGHT);
  assert.deepEqual(bundle.hub, { x: 100 + TASK_WIDTH, y: 500 + TASK_HEIGHT / 2 });
  assert.equal(routes.bundles.length, 1);
  assert.equal(bundle.branches.length, 2);
  for (const branch of bundle.branches) {
    assert.deepEqual(branch.points[0], bundle.trunk.points[1]);
    assert.deepEqual(branch.points[1], routes.ports[branch.to].left);
  }
});
