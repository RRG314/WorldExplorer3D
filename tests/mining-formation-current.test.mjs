import test from 'node:test';
import assert from 'node:assert/strict';
import {
  miningFormation,
  miningAssay,
  miningCutPlan,
  miningSeparate,
  miningProcess,
  miningFabricate,
  MINING_LIMITS,
} from '../app/js/campaign/mining-formation.js';
test('the reviewed seeded formation produces reproducible distinct visible grades and a magnetic waste control', () => {
  for (const id of ['campaign', 'narrow-vein', 'mixed-batch']) {
    const f = miningFormation(id);
    assert.deepEqual(f, miningFormation(id));
    assert.equal(f.cells.length, 45);
    assert.ok(
      f.cells.every((c) => Number.isSafeInteger(c.copperGrams) && c.copperGrams < c.massGrams)
    );
    const high = miningAssay(f, ['b:1:2']),
      magnetic = miningAssay(f, ['c:1:2']);
    assert.ok(high.gradePermille >= MINING_LIMITS.oreCutoffPermille);
    assert.equal(magnetic.magnetic, true);
    assert.ok(magnetic.gradePermille < MINING_LIMITS.oreCutoffPermille);
  }
  assert.throws(() => miningFormation('constructor'));
});
test('bounded cuts preserve support cells and the return route and reject detached or overloaded selections', () => {
  const f = miningFormation();
  const plan = miningCutPlan(f, ['b:1:1', 'b:1:2'], { returnRouteClear: true });
  assert.equal(plan.massGrams, 40000);
  assert.equal(plan.volumeCubicMeters, 0.016);
  assert.equal(plan.supportsPreserved, true);
  for (const ids of [
    ['b:1:0'],
    ['b:0:2'],
    ['b:2:2'],
    ['b:1:1', 'b:1:3'],
    ['a:1:1', 'b:1:1'],
    ['b:1:1', 'b:1:1'],
  ])
    assert.throws(() => miningCutPlan(f, ids, { returnRouteClear: true }));
  assert.throws(() => miningCutPlan(f, ['b:1:1'], { returnRouteClear: false }));
  assert.throws(() => miningCutPlan({ ...f, seed: 0 }, ['b:1:1'], { returnRouteClear: true }));
});
test('assay-based waste sorting cannot erase feed or treat a magnetic anomaly as ore', () => {
  const f = miningFormation('mixed-batch'),
    ids = ['b:1:1', 'b:1:2', 'b:1:3'],
    s = miningSeparate(f, ids, ['b:1:2']);
  assert.equal(s.inputGrams, 60000);
  assert.equal(s.oreGrams, 20000);
  assert.equal(s.wasteGrams, 40000);
  assert.equal(s.inputCopperGrams, s.oreCopperGrams + s.wasteCopperGrams);
  assert.throws(() => miningSeparate(f, ids, ids));
  assert.throws(() => miningSeparate(f, ['c:1:2'], ['c:1:2']));
  assert.throws(() => miningSeparate(f, ids, ['b:1:2', 'b:1:2']));
});
test('all three different cut strategies conserve total mass and copper through concentrate, material, retained losses and the useful yard order', () => {
  for (const [id, ids, ore] of [
    ['campaign', ['b:1:1', 'b:1:2'], ['b:1:1', 'b:1:2']],
    ['narrow-vein', ['b:1:2'], ['b:1:2']],
    ['mixed-batch', ['b:1:1', 'b:1:2', 'b:1:3'], ['b:1:2']],
  ]) {
    const f = miningFormation(id);
    miningCutPlan(f, ids, { returnRouteClear: true });
    const p = miningProcess(f, ids, ore),
      order = miningFabricate(p);
    assert.equal(
      p.inputGrams,
      p.wasteGrams + p.tailingsGrams + p.materialGrams + p.refiningResidueGrams
    );
    assert.equal(
      p.inputCopperGrams,
      p.wasteCopperGrams + p.tailingsCopperGrams + p.materialGrams + p.refiningResidueCopperGrams
    );
    assert.equal(
      order.productGrams + order.remainingMaterialGrams + order.fabricationWasteGrams,
      p.materialGrams
    );
    assert.equal(order.productGrams, 1000);
    assert.equal(order.product, 'quarry-survey-marker-base');
    assert.equal(p.source.seed, f.seed);
  }
  const f = miningFormation('narrow-vein'),
    one = miningAssay(f, ['b:1:2']),
    diluted = miningAssay(f, ['b:1:1', 'b:1:2', 'b:1:3']);
  assert.ok(diluted.gradePermille < one.gradePermille / 2);
});
test('a forged lot, seed, source selection, loss or output cannot reach fabrication', () => {
  const f = miningFormation(),
    p = miningProcess(f, ['b:1:1', 'b:1:2'], ['b:1:1', 'b:1:2']);
  for (const patch of [
    { materialGrams: p.materialGrams + 1 },
    { tailingsGrams: p.tailingsGrams - 1 },
    { source: { ...p.source, seed: 42 } },
    { sourceCellIds: ['a:1:1'] },
    { settings: { ...p.settings, refiningRecoveryPermille: 1000 } },
  ])
    assert.throws(() => miningFabricate({ ...p, ...patch }));
  assert.throws(() => miningFabricate(p, -1));
  assert.throws(() => miningFabricate(p, 0));
  assert.throws(() => miningFabricate(p, 500));
  assert.throws(() => miningProcess(f, ['a:1:1'], ['a:1:1']));
});
