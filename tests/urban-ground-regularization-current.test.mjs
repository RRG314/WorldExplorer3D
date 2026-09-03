import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDenseSettlementGroundModel,
  denseSettlementNeedsTerrainRegularization,
  fitDenseSettlementGroundPlane
} from '../app/js/terrain/urban-ground-regularization.js';

test('dense settlement ground plane rejects positive structure returns', () => {
  const samples = [];
  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) {
      const terrain = 4 + x * 0.4 - z * 0.2;
      samples.push({ x, z, y: terrain + (x >= 0 && z >= 0 ? 18 : 0) });
    }
  }
  const result = fitDenseSettlementGroundPlane(samples);
  assert.ok(result);
  assert.ok(Math.abs(result.centerY - 4) < 0.25, `expected ground near 4, got ${result.centerY}`);
});

test('dense settlement ground grid is continuous and preserves a sustained slope', () => {
  const ground = createDenseSettlementGroundModel((x, z) => 10 + x * 0.01 + z * 0.02, {
    gridSpacing: 100,
    sampleRadius: 60
  });
  assert.ok(Math.abs(ground.sample(49.99, 22) - ground.sample(50.01, 22)) < 0.01);
  assert.ok(Math.abs(ground.sample(70, -30) - 10.1) < 0.01);
});

test('dense settlement ground grid removes a building plateau without a cliff', () => {
  const ground = createDenseSettlementGroundModel((x, z) => {
    const terrain = 3 + x * 0.002;
    return terrain + (Math.abs(x) < 70 && Math.abs(z) < 70 ? 24 : 0);
  }, { gridSpacing: 120, sampleRadius: 100 });
  const samples = [];
  for (let x = -140; x <= 140; x += 10) samples.push(ground.sample(x, 0));
  const largestStep = Math.max(...samples.slice(1).map((value, index) => Math.abs(value - samples[index])));
  assert.ok(largestStep < 0.2, `expected a continuous ground surface, saw ${largestStep}`);
  assert.ok(Math.max(...samples) < 5);
});

test('terrain regularization is not enabled outside a confirmed dense settlement', () => {
  assert.equal(denseSettlementNeedsTerrainRegularization({ settlement: { dense: true } }), true);
  assert.equal(denseSettlementNeedsTerrainRegularization({ settlement: { dense: false } }), false);
  assert.equal(denseSettlementNeedsTerrainRegularization(null), false);
});

test('partial coastal source coverage stays on the continuous grid authority', () => {
  const ground = createDenseSettlementGroundModel((x, z) => {
    if (x < -40) return null;
    return 8 + x * 0.003 + z * 0.001;
  }, { gridSpacing: 100, sampleRadius: 60 });
  const samples = [];
  for (let x = -25; x <= 125; x += 2) samples.push(ground.sample(x, 0, 99));
  const largestStep = Math.max(...samples.slice(1).map((value, index) => Math.abs(value - samples[index])));
  assert.ok(largestStep < 0.2, `expected continuous partial-coverage ground, saw ${largestStep}`);
  assert.ok(Math.max(...samples) < 10, 'raw fallback must not leak into a partially covered grid cell');
});

test('district-scale sampling rejects a block-sized rooftop field', () => {
  const ground = createDenseSettlementGroundModel((x, z) => {
    const terrain = 12 + x * 0.01 + z * 0.004;
    return terrain + (Math.abs(x) < 260 && Math.abs(z) < 260 ? 140 : 0);
  }, { gridSpacing: 360, sampleRadius: 480, sampleDivisions: 6 });
  const samples = [];
  for (let x = -360; x <= 360; x += 12) samples.push(ground.sample(x, 0));
  const largestStep = Math.max(...samples.slice(1).map((value, index) => Math.abs(value - samples[index])));
  assert.ok(largestStep < 0.3, `expected district ground without a rooftop cliff, saw ${largestStep}`);
  assert.ok(Math.max(...samples) < 25, 'block-sized rooftops must not become ground');
});

test('lower-envelope plane cannot extrapolate beyond observed terrain', () => {
  const samples = [];
  for (let x = -4; x <= 4; x += 1) {
    for (let z = -4; z <= 4; z += 1) {
      const realTerrain = 100 + x * 12 + z * 4;
      samples.push({ x, z, y: realTerrain + (x > -2 ? 220 : 0) });
    }
  }
  const result = fitDenseSettlementGroundPlane(samples);
  assert.ok(result);
  const observed = samples.map((sample) => sample.y);
  assert.ok(result.centerY >= Math.min(...observed));
  assert.ok(result.centerY <= Math.max(...observed));
});
