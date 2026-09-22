import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGameplay, advanceUntilFishingStage } from '../scripts/verification/gameplay-simulation.mjs';

test('functional timing rejects idle, fallback, suspended and incomplete simulation receipts', async () => {
  for (const receipt of [undefined, { simulatedMs: 0, frames: 0 },
    { simulatedMs: 100, frames: 6, suspendedFrames: 1 },
    { simulatedMs: 99, frames: 6, suspendedFrames: 0 }]) {
    await assert.rejects(advanceGameplay({ evaluate: async () => receipt }, 100));
  }
  const receipt = { requestedMs: 100, simulatedMs: 100, frames: 6, suspendedFrames: 0 };
  assert.deepEqual(await advanceGameplay({ evaluate: async () => receipt }, 100), receipt);
});

test('fishing stage observation terminates on actual target, loss, or simulation budget', async () => {
  let elapsed = 0;
  const page = { evaluate: async (_fn, duration) => {
    if (duration) { elapsed += duration; return { simulatedMs: duration, frames: 6, suspendedFrames: 0 }; }
    return { stage: elapsed >= 300 ? 'bite' : 'waiting' };
  } };
  assert.equal((await advanceUntilFishingStage(page, 'bite', 500)).simulatedMs, 300);
  elapsed = 0;
  await assert.rejects(advanceUntilFishingStage(page, 'bite', 200), /did not reach bite/);
  await assert.rejects(advanceUntilFishingStage({ evaluate: async () => ({ stage: 'lost' }) }, 'bite'), /did not reach bite/);
});
