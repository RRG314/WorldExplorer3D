import test from 'node:test';
import assert from 'node:assert/strict';

import { createSurfaceLayerSuppression } from '../app/js/boat-mode/surface-layer-visibility.js';

test('open-ocean presentation hides terrestrial cover and restores exact prior visibility', () => {
  const terrain = { visible: true };
  const grass = { visible: true };
  const alreadyHidden = { visible: false };
  let layers = [terrain, grass, alreadyHidden];
  const suppression = createSurfaceLayerSuppression(() => layers);

  suppression.setActive(true);
  assert.deepEqual(layers.map((layer) => layer.visible), [false, false, false]);

  const lateGrass = { visible: true };
  layers = [...layers, lateGrass];
  suppression.setActive(true);
  assert.equal(lateGrass.visible, false, 'late vegetation rebuilds are also suppressed');

  suppression.setActive(false);
  assert.deepEqual(layers.map((layer) => layer.visible), [true, true, false, true]);
  assert.equal(suppression.snapshot().hiddenLayerCount, 0);
});
