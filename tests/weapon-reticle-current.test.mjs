import test from 'node:test';
import assert from 'node:assert/strict';

import { reticlePresentation } from '../app/js/urban-sandbox/weapon-reticle-authority.js';

test('reticle spread honestly opens with movement and recoil then recovers', () => {
  const settled = reticlePresentation({ kind: 'pulse', speedMph: 0, firedAgoMs: 1000 });
  const moving = reticlePresentation({ kind: 'pulse', speedMph: 12, firedAgoMs: 1000 });
  const fired = reticlePresentation({ kind: 'pulse', speedMph: 12, firedAgoMs: 0 });
  assert.equal(settled.gapPx, 8);
  assert.ok(moving.gapPx > settled.gapPx);
  assert.ok(fired.gapPx > moving.gapPx);
});

test('weapon profiles are distinct and hit confirmation is brief', () => {
  assert.notEqual(
    reticlePresentation({ kind: 'laser', firedAgoMs: 1000 }).gapPx,
    reticlePresentation({ kind: 'paintball', firedAgoMs: 1000 }).gapPx
  );
  assert.equal(reticlePresentation({ hitAgoMs: 80 }).hitConfirmed, true);
  assert.equal(reticlePresentation({ hitAgoMs: 300 }).hitConfirmed, false);
});
