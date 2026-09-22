import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { advanceGameplay, advanceUntilFishingStage, stepGameplayKeys } from '../scripts/verification/gameplay-simulation.mjs';

test('functional timing rejects idle, fallback, suspended and incomplete simulation receipts', async () => {
  for (const receipt of [undefined, { simulatedMs: 0, frames: 0 },
    { simulatedMs: 100, frames: 6, suspendedFrames: 1 },
    { simulatedMs: 99, frames: 6, suspendedFrames: 0 }]) {
    await assert.rejects(advanceGameplay({ evaluate: async () => receipt }, 100));
  }
  const receipt = { requestedMs: 100, simulatedMs: 100, frames: 6, suspendedFrames: 0 };
  assert.deepEqual(await advanceGameplay({ evaluate: async () => receipt }, 100), receipt);
});

test('instrumented navigation bounds simulation and releases every key after success or failure', async () => {
  for (const failure of [false, true]) {
    const pressed = new Set();
    const durations = [];
    const target = { tagName: 'BODY', dispatchEvent(event) {
      if (event.type === 'keydown') pressed.add(event.code);
      else pressed.delete(event.code);
    } };
    const page = { evaluate: async (fn, args) => vm.runInNewContext(`(${fn.toString()})(args)`, {
      args, document: { activeElement: target },
      KeyboardEvent: class { constructor(type, options) { Object.assign(this, options, { type }); } },
      async advanceTime(duration) {
        assert.deepEqual([...pressed], ['ShiftLeft', 'ArrowUp']);
        durations.push(duration);
        if (failure) throw new Error('simulation failed');
        return { simulatedMs: duration, frames: 1, suspendedFrames: 0 };
      }
    }) };
    if (failure) await assert.rejects(stepGameplayKeys(page, ['ShiftLeft', 'ArrowUp'], 5200), /simulation failed/);
    else {
      await stepGameplayKeys(page, ['ShiftLeft', 'ArrowUp'], 5200);
      assert.deepEqual(durations, [2000, 2000, 1200]);
    }
    assert.equal(pressed.size, 0);
  }
});

test('instrumented navigation does not bypass focused controls or accept suspended movement', async () => {
  const focusedPage = { evaluate: async (fn, args) => vm.runInNewContext(`(${fn.toString()})(args)`, {
    args, document: { activeElement: { tagName: 'BUTTON' } }
  }) };
  await assert.rejects(stepGameplayKeys(focusedPage, 'ArrowUp', 100), /focused UI control/);
  await assert.rejects(stepGameplayKeys({ evaluate: async () => [
    { duration: 100, receipt: { simulatedMs: 100, frames: 6, suspendedFrames: 6 } }
  ] }, 'ArrowUp', 100), /did not advance/);
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
