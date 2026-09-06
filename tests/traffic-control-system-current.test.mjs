import test from 'node:test';
import assert from 'node:assert/strict';

import { compileTrafficControlSystem } from '../app/js/living-world/traffic-control-system.js';

const graph = {
  edges: [
    { length: 50, p1: { x: -50, z: 0 }, p2: { x: 0, z: 0 }, structure: { terrainMode: 'at_grade' } },
    { length: 50, p1: { x: 0, z: -50 }, p2: { x: 0, z: 0 }, structure: { terrainMode: 'at_grade' } }
  ]
};

test('one semantic intersection controls both roadway approach axes', () => {
  const system = compileTrafficControlSystem({
    graph,
    controls: [{ id: 'mapped:signal:1', kind: 'traffic_signal', x: 0, z: 0, provenance: 'mapped' }]
  });
  assert.equal(system.controllers.length, 1);
  assert.equal(system.controlledApproaches, 2);
  const groups = system.controllers[0].approaches.map((entry) => entry.group).sort();
  assert.deepEqual(groups, [0, 1]);
});

test('signals alternate axes and a red approach brakes to its stop line', () => {
  const system = compileTrafficControlSystem({
    graph,
    controls: [{ id: 'signal-with-stable-phase', kind: 'traffic_signal', x: 0, z: 0 }]
  });
  let elapsed = 0;
  let state = system.states(elapsed)[0];
  while (elapsed < 34 && !(state.group0 === 'red' && state.group1 === 'green')) {
    elapsed += .25;
    state = system.states(elapsed)[0];
  }
  assert.ok(elapsed < 34);
  const directive = system.directive(0, 46, 8, elapsed);
  assert.equal(directive.controlled, true);
  assert.equal(directive.aspect, 'red');
  assert.equal(directive.mustStop, true);
  assert.ok(directive.speedScale < 1);
});

test('grade-separated approaches do not inherit at-grade signal control', () => {
  const separatedGraph = {
    edges: [
      graph.edges[0],
      { ...graph.edges[1], structure: { terrainMode: 'subgrade' } }
    ]
  };
  const system = compileTrafficControlSystem({
    graph: separatedGraph,
    controls: [{ kind: 'traffic_signal', x: 0, z: 0 }]
  });
  assert.equal(system.controllers.length, 0);
  assert.equal(system.controlledApproaches, 0);
});

test('a mapped or inferred stop sign controls a single valid approach', () => {
  const system = compileTrafficControlSystem({
    graph: { edges: [graph.edges[0]] },
    controls: [{ id: 'stop:1', kind: 'stop_sign', x: 0, z: 0, provenance: 'mapped' }]
  });
  assert.equal(system.controllers.length, 1);
  assert.equal(system.controlledApproaches, 1);
  const directive = system.directive(0, 47, 4, 0);
  assert.equal(directive.kind, 'stop_sign');
  assert.equal(directive.aspect, 'stop');
  assert.equal(directive.mustStop, true);
  assert.ok(directive.speedScale < 1);
});

test('a control mapped inside an unsplit lane uses projected stop progress', () => {
  const system = compileTrafficControlSystem({
    graph: {
      edges: [
        { length: 100, p1: { x: -50, z: -2 }, p2: { x: 50, z: -2 }, structure: { terrainMode: 'at_grade' } },
        { length: 100, p1: { x: 2, z: -50 }, p2: { x: 2, z: 50 }, structure: { terrainMode: 'at_grade' } }
      ]
    },
    controls: [{ id: 'mid-segment-signal', kind: 'traffic_signal', x: 0, z: 0 }]
  });
  assert.equal(system.controllers.length, 1);
  assert.equal(system.controlledApproaches, 2);
  const approach = system.controllers[0].approaches[0];
  assert.ok(approach.stopProgress > 45 && approach.stopProgress < 55);
});
