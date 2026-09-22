import test from 'node:test';
import assert from 'node:assert/strict';
import { createPedestrianSpacing } from '../app/js/living-world/pedestrian-spacing.js';
import { planAgentSpawns, yieldToOpposingPedestrian } from '../app/js/living-world/population.js';

test('walkers stop behind a stationary person without moving off the mapped path', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 1 };
  const spacing = createPedestrianSpacing([a, b], p => p);
  const fraction = spacing.limit(a, 0, 1);
  assert.ok(fraction > .27 && fraction < .29);
  a.z += fraction; spacing.update(a, a);
  assert.ok(spacing.limit(a, 0, 1) < .002);
  b.z = 3; spacing.update(b, b);
  assert.equal(spacing.limit(a, 0, 1), 1);
});

test('crossing motion cannot tunnel through people, but separate floors and clear passing lanes work', () => {
  const a = { x: -2, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  const spacing = createPedestrianSpacing([a, b], p => p);
  assert.ok(spacing.limit(a, 4, 0) < .33);
  b.y = 4; spacing.update(b, b);
  assert.equal(spacing.limit(a, 4, 0), 1);
  b.y = 0; b.z = 1; spacing.update(b, b);
  assert.equal(spacing.limit(a, 4, 0), 1);
});

test('initial population cannot exceed available personal space on a tiny path', () => {
  const graph = { edges: [{ p1: { x: 0, z: 0 }, p2: { x: 0, z: 2 }, length: 2, role: 'path' }] };
  let seed = 8;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const result = planAgentSpawns(30, graph, random, 'pedestrian');
  assert.ok(result.length > 0 && result.length < 4);
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    assert.ok(Math.hypot(result[i].x - result[j].x, result[i].z - result[j].z) >= 1.1);
  }
});

test('narrow-path head-on encounters yield by retracing the path without moving sideways', () => {
  const graph={edges:[{p1:{x:0,z:0},p2:{x:0,z:10},length:10},{p1:{x:0,z:10},p2:{x:0,z:0},length:10}]};
  const a={id:'a',edgeIndex:0,progress:4.64,pathOffset:0}, b={id:'b',edgeIndex:1,progress:4.64,pathOffset:0};
  assert.equal(yieldToOpposingPedestrian(a,[a,b],graph),false);
  assert.equal(yieldToOpposingPedestrian(b,[a,b],graph),true);
  assert.equal(b.edgeIndex,0);assert.equal(b.progress,5.36);assert.equal(Math.abs(b.pathOffset),0);
  assert.equal(yieldToOpposingPedestrian(a,[a,b],graph),false);
});
