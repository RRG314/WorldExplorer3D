import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVING_PEDESTRIAN_CAPABILITIES,
  physicalEdgeKey,
  planAgentSpawns
} from '../app/js/living-world/population.js?v=22';

function randomFrom(seed = 73421) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function edge(id, x, z, role = 'sidewalk', activityScore = 1, reversed = false) {
  const first = { x, y: 0, z };
  const second = { x: x + 80, y: 0, z };
  return {
    id,
    p1: reversed ? second : first,
    p2: reversed ? first : second,
    from: reversed ? `${id}:b` : `${id}:a`,
    to: reversed ? `${id}:a` : `${id}:b`,
    length: 80,
    role,
    activityScore,
    commercial: role === 'entrance',
    provenance: role === 'sidewalk' ? 'inferred_sidewalk' : 'mapped_path'
  };
}

test('forward and reverse edges share one physical crowd corridor', () => {
  assert.equal(
    physicalEdgeKey(edge('forward', 0, 0)),
    physicalEdgeKey(edge('reverse', 0, 0, 'sidewalk', 1, true))
  );
});

test('dense pedestrian demand spreads across corridors instead of forming ranks', () => {
  const edges = [];
  for (let index = 0; index < 8; index += 1) {
    const role = index === 0 ? 'entrance' : 'sidewalk';
    const activity = index === 0 ? 8 : 1 + index % 3;
    edges.push(edge(`corridor-${index}:forward`, 0, index * 15, role, activity));
    edges.push(edge(`corridor-${index}:reverse`, 0, index * 15, role, activity, true));
  }
  const placements = planAgentSpawns(56, { edges }, randomFrom(), 'pedestrian');
  const counts = new Map();
  placements.forEach((entry) => counts.set(entry.corridorKey, (counts.get(entry.corridorKey) || 0) + 1));
  assert.equal(placements.length, 56);
  assert.equal(counts.size, 8);
  assert.ok(Math.max(...counts.values()) <= 10);
  assert.ok(new Set(placements.map((entry) => entry.pathOffset.toFixed(2))).size >= 20);
});

test('every ambient pedestrian publishes one universal gameplay capability contract', () => {
  assert.deepEqual(LIVING_PEDESTRIAN_CAPABILITIES, {
    selectable: true,
    conversational: true,
    collisionTarget: true,
    projectileTarget: true,
    vehicleImpactTarget: true,
    damageable: true
  });
});
