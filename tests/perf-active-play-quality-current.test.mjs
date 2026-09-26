import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
const documentFixture = new EventTarget();
documentFixture.hidden = false;
globalThis.document = documentFixture;
const { recordPerfFrame, getPerfAutoQualityTier, setPerfAutoQualityTier, setPerfAutoQualityEnabled } = await import('../app/js/perf.js');

const frames = (count, dt) => { for (let i = 0; i < count; i++) recordPerfFrame(dt); };

test('title and loading delays do not reduce gameplay quality or contaminate the next active sample', () => {
  setPerfAutoQualityEnabled(true, { persist: false });
  setPerfAutoQualityTier('balanced');
  ctx.gameStarted = false;
  frames(100, 0.15);
  assert.equal(getPerfAutoQualityTier(), 'balanced', 'Title frame rate does not measure world rendering');
  ctx.gameStarted = true; ctx.worldLoading = true;
  frames(100, 0.15);
  assert.equal(getPerfAutoQualityTier(), 'balanced', 'Compilation time is not a gameplay frame budget');
  ctx.worldLoading = false;
  frames(480, 1 / 60);
  assert.equal(getPerfAutoQualityTier(), 'balanced', 'Healthy gameplay must not inherit loading spikes');
  frames(100, 0.1);
  assert.equal(getPerfAutoQualityTier(), 'performance', 'Sustained slow active gameplay still reduces quality');
});

test('background-tab time is excluded from automatic gameplay quality decisions', () => {
  const original = globalThis.document;
  try {
    setPerfAutoQualityTier('balanced');
    ctx.gameStarted = true; ctx.worldLoading = false;
    globalThis.document.hidden = true;
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    frames(100, 0.2);
    assert.equal(getPerfAutoQualityTier(), 'balanced');
    globalThis.document.hidden = false;
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    recordPerfFrame(120); // First frame spans an entirely suspended tab.
    frames(480, 1 / 60);
    assert.equal(getPerfAutoQualityTier(), 'balanced');
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
    ctx.gameStarted = false;
  }
});
