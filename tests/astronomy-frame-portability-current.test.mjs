import test from 'node:test';
import assert from 'node:assert/strict';
import { astronomyHarness } from './helpers/astronomy-study.mjs';

test('saved detector projections tolerate only subnanopixel engine roundoff while preserving exact pixels and settings', () => {
  const h = astronomyHarness();
  h.align();
  h.command({ type: 'configure', seconds: 2 });
  const raw = h.capture(),
    before = structuredClone(h.state);
  for (const change of [
    (r) => {
      r.image.targetPixel.x += 0.00001;
    },
    (r) => {
      r.image.targetPixel.x = NaN;
    },
    (r) => {
      r.image.targetPixel.extra = 'unverified';
    },
    (r) => {
      const pixels = atob(r.image.pixelsBase64);
      r.image.pixelsBase64 = btoa(String.fromCharCode(pixels.charCodeAt(0) ^ 1) + pixels.slice(1));
    },
    (r) => {
      r.image.seed++;
    },
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    assert.throws(() => h.command({ type: 'expose', exposure: bad }));
    assert.deepEqual(h.state, before);
  }
  raw.image.targetPixel.x += 1e-12;
  h.command({ type: 'expose', exposure: raw });
  assert.deepEqual(
    h.state.active.frames.primary.image,
    raw.image,
    'Original coordinate and pixels remain untouched'
  );
});
