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
  for (const keys of [['ShiftLeft', 'ArrowUp'], ['Space']]) {
  for (const failure of [false, true]) {
    const pressed = new Set();
    const durations = [];
    const target = { tagName: 'BODY', dispatchEvent(event) {
      if (event.code === 'Space') assert.equal(event.key, ' ');
      if (event.type === 'keydown') pressed.add(event.code);
      else pressed.delete(event.code);
    } };
    const page = { evaluate: async (fn, args) => vm.runInNewContext(`(${fn.toString()})(args)`, {
      args, document: { activeElement: target },
      KeyboardEvent: class { constructor(type, options) { Object.assign(this, options, { type }); } },
      async advanceTime(duration) {
        assert.deepEqual([...pressed], keys);
        durations.push(duration);
        if (failure) throw new Error('simulation failed');
        return { simulatedMs: duration, frames: 1, suspendedFrames: 0 };
      }
    }) };
    if (failure) await assert.rejects(stepGameplayKeys(page, keys, 5200), /simulation failed/);
    else {
      await stepGameplayKeys(page, keys, 5200);
      assert.deepEqual(durations, [2000, 2000, 1200]);
    }
    assert.equal(pressed.size, 0);
  }
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

// Execute the actual urban navigation function without starting its browser.
// The target can move independently of the actor, as live traffic/NPCs do.
async function urbanApproachHarness(moves) {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/verification/urban-sandbox.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function walkTo('), source.indexOf('\nasync function launchEarth('));
  let step = 0;
  const walkTo = vm.runInNewContext(`(${body})`, {
    actorState: async () => ({ x: 0, z: moves ? step : 0, yaw: 0, distance: moves ? 100 + step * 9 : 100 - step * 10 }),
    inputStep: async () => { step++; }, wrapYaw: value => value,
    diagnostics: async () => ({}), console, Date
  });
  return walkTo({}, { x: 0, z: 100 }, {
    maxSteps: 5, stagnantLimit: 1, stopDistance: .1,
    resolveTarget: async () => ({ x: 0, z: moves ? 100 + step * 10 : 100 - step * 10 })
  });
}

test('urban navigation detects a blocked player even while a target approaches', async () => {
  assert.equal((await urbanApproachHarness(false)).blocked, true);
});

test('urban navigation does not call a moving player blocked when a target moves away', async () => {
  const result = await urbanApproachHarness(true);
  assert.equal(result.blocked, false);
  assert.equal(result.steps, 5);
});

// Pausing an already focused world must not wait for another canvas click;
// a slow renderer could consume the backend lease during actionability waits.
test('waiting-player pause only refocuses the canvas when a form owns input', async () => {
  const { pauseWaitingPlayer } = await import('../scripts/verification/pause-waiting-player.mjs');
  for (const focused of [false, true]) {
    let canvasClicks = 0, paused = false;
    const page = {
      bringToFront: async () => {},
      evaluate: async fn => {
        const source = fn.toString();
        if (source.includes('isContentEditable')) return focused;
        if (source.includes('focusedElement')) return { focusedElement: 'BODY', visiblePanels: [], paused };
        return 42;
      },
      locator: selector => ({
        click: async () => { assert.ok(selector.includes('canvas')); canvasClicks++; },
        isVisible: async () => paused
      }),
      keyboard: { press: async key => { assert.equal(key, 'Escape'); paused = true; } },
      waitForFunction: async () => { assert.equal(paused, true); },
      waitForTimeout: async () => {}
    };
    const receipt = await pauseWaitingPlayer(page);
    assert.equal(canvasClicks, focused ? 1 : 0);
    assert.equal(receipt.before, receipt.after);
    assert.equal(paused, true);
  }
});

test('vehicle input rechecks the actual nearby identity and releases E on failed simulation', async () => {
  const { enterNearbyVehicle } = await import('../scripts/verification/gameplay-simulation.mjs');
  for (const scenario of ['moved', 'focused', 'failure', 'success']) {
    const events = [];
    let entered = false;
    const target = { tagName: scenario === 'focused' ? 'BUTTON' : 'BODY', dispatchEvent: e => events.push(e.type) };
    const page = { evaluate: async (fn, id) => vm.runInNewContext(`(${fn.toString()})(id)`, {
      id, document: { activeElement: target },
      KeyboardEvent: class { constructor(type, options) { Object.assign(this, options, { type }); } },
      getWorldExplorerRuntimeDiagnostics: () => ({ urbanSandbox: {
        phase: entered ? 'enter' : 'walking', nearbyVehicleId: scenario === 'moved' ? 'other' : 'car',
        interaction: { action: 'enter_vehicle' }, vehicles: [{ id: 'car', driverDoor: { openRadians: entered ? .2 : 0 } }]
      } }),
      advanceTime: async duration => {
        assert.equal(duration, 150); assert.deepEqual(events, ['keydown']);
        if (scenario === 'failure') throw Error('simulation failed');
        entered = true; return { simulatedMs: duration, frames: 9, suspendedFrames: 0 };
      }
    }) };
    if (scenario === 'moved') { assert.equal(await enterNearbyVehicle(page, 'car'), null); assert.deepEqual(events, []); }
    else if (scenario === 'focused') { await assert.rejects(enterNearbyVehicle(page, 'car'), /focused UI control/); assert.deepEqual(events, []); }
    else {
      if (scenario === 'failure') await assert.rejects(enterNearbyVehicle(page, 'car'), /simulation failed/);
      else assert.equal((await enterNearbyVehicle(page, 'car')).state.urbanSandbox.phase, 'enter');
      assert.deepEqual(events, ['keydown', 'keyup']);
    }
  }
});
