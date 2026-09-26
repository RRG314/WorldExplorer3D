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


test('networked input delegates timer yields to the real kernel without releasing clock ownership', async () => {
  const { createRuntimeKernel } = await import('../app/js/runtime/kernel.js');
  const pressed = new Set(), pending = new Map();
  let time = 0, nextId = 0, movementMs = 0, yields = 0;
  const target = { tagName: 'BODY', dispatchEvent(event) {
    if (event.type === 'keydown') pressed.add(event.code);
    else pressed.delete(event.code);
  } };
  const kernel = createRuntimeKernel({
    now: () => time,
    requestFrame: fn => { pending.set(++nextId, fn); return nextId; },
    cancelFrame: id => pending.delete(id),
    yieldToNetwork: async () => {
      assert.ok(pressed.has('ArrowUp')); yields++; time += 2000;
      for (const [id, callback] of [...pending]) { pending.delete(id); callback(time); }
    }
  });
  kernel.registerSystem({id: 'movement', update(frame) { if (pressed.has('ArrowUp')) movementMs += frame.dt * 1000; }});
  kernel.start();
  const page = { evaluate: async (fn, args) => vm.runInNewContext(`(${fn.toString()})(args)`, {
    args, document: { activeElement: target },
    KeyboardEvent: class { constructor(type, options) { Object.assign(this, options, { type }); } },
    setTimeout(callback) {
      time += 2000;
      for (const [id, frame] of [...pending]) { pending.delete(id); frame(time); }
      callback();
    },
    advanceTime: (duration, options) => options?.yieldToNetwork
      ? kernel.advanceWithNetworkYields(duration) : kernel.advanceBy(duration)
  }) };
  const receipt = await stepGameplayKeys(page, 'ArrowUp', 50, { yieldToNetwork: true });
  assert.ok(Math.abs(movementMs - 50) < 1e-8, `Extra live movement: ${movementMs}`);
  assert.equal(yields, 4); assert.equal(pressed.size, 0);
  assert.equal(receipt.timing, 'dom-keyboard-fixed-step-with-network-yields');
  kernel.dispose();
});


test('GPS field waiting supplies fresh fixes until the selected target reveals and remains bounded', async () => {
 const { waitForGpsFieldReveal } = await import('../scripts/verification/gps-fix-stream.mjs');
 for (const succeeds of [true, false]) {
  let time = 0, fixes = 0;
  const cdp = { send: async (method, fix) => {
   assert.equal(method, 'Emulation.setGeolocationOverride');
   assert.deepEqual(fix, { latitude: 39, longitude: -76, accuracy: 6, speed: 0, heading: 0 }); fixes++;
  } };
  const page = { waitForTimeout: async ms => { time += ms; }, evaluate: async () => ({
   targetId: fixes === 1 ? 'previous-stop' : 'selected-stop',
   phase: succeeds ? 'revealed' : 'observing', pauseReason: null, lastFixAgeMs: 620
  }) };
  const run = waitForGpsFieldReveal(page, cdp, { latitude: 39, longitude: -76 }, 'selected-stop', { timeoutMs: 1500, now: () => time });
  if (succeeds) { assert.equal((await run).lastState.targetId, 'selected-stop'); assert.equal(fixes, 2); }
  else { await assert.rejects(run, /did not reveal/); assert.equal(fixes, 3); }
 }
});

test('the GPS watch stays fresh through UI work, preserves bad accuracy, and stops its owned timer', async () => {
 const { createGpsFixStream } = await import('../scripts/verification/gps-fix-stream.mjs');
 const timers=new Map(),fixes=[];let next=0,inFlight=0;
 const stream=createGpsFixStream({send:async(method,fix)=>{
  assert.equal(method,'Emulation.setGeolocationOverride');assert.equal(++inFlight,1);
  await Promise.resolve();fixes.push(fix);inFlight--;
 }},{setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
 const tick=async()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();};
 await stream.send('Emulation.setGeolocationOverride',{latitude:39,longitude:-76,accuracy:6,speed:0});
 await tick();await tick();
 assert.equal(fixes.length,3);assert.equal(timers.size,1);
 await stream.send('Emulation.setGeolocationOverride',{latitude:39,longitude:-76,accuracy:60,speed:0});
 await tick();assert.equal(fixes.at(-1).accuracy,60);
 await stream.stop();assert.equal(timers.size,0);assert.equal(stream.snapshot().active,false);
 await assert.rejects(stream.send('Emulation.setGeolocationOverride',{latitude:39,longitude:-76}),/assertion|false/i);
});

test('GPS heartbeat failures surface and cannot leave an orphan timer', async () => {
 const { createGpsFixStream } = await import('../scripts/verification/gps-fix-stream.mjs');
 let tick,attempt=0;
 const stream=createGpsFixStream({send:async()=>{if(++attempt===2)throw new Error('GPS protocol failed');}},
  {setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{tick=null;}});
 await stream.send('Emulation.setGeolocationOverride',{latitude:39,longitude:-76});
 const next=tick;tick=null;await next();
 assert.equal(tick,null);assert.throws(()=>stream.assertHealthy(),/GPS protocol failed/);
 await assert.rejects(stream.stop(),/GPS protocol failed/);
});


test('functional camera recovery respects idle delay, simulation cap and released input', async () => {
  const { settleReleasedCamera } = await import('../scripts/verification/gameplay-simulation.mjs');
  for (const scenario of ['recovers', 'stuck', 'held', 'invalid-clock']) {
    let simulated = 0, waited = 0;
    const page = {
      waitForTimeout: async ms => { waited += ms; },
      evaluate: async (_fn, duration) => {
        if (duration) {
          simulated += duration;
          return { simulatedMs: scenario === 'invalid-clock' ? 0 : duration, frames: 15, suspendedFrames: 0 };
        }
        return { cameraFollow: { headingAlignmentDegrees: scenario === 'recovers' ? 60 * Math.exp(-4.2 * simulated / 1000) : 60, trailingDistance: 5 },
          mobileControls: { look: { active: scenario === 'held' }, move: { active: false } } };
      }
    };
    const run = settleReleasedCamera(page, { maximumHeadingDegrees: 6, minimumTrailingDistance: 2, maximumSimulationMs: 1500 });
    if (scenario === 'recovers') {
      const receipt = await run;
      assert.equal(receipt.simulatedMs, 750);
      assert.equal(receipt.receipts.length, 3);
      assert.ok(receipt.state.cameraFollow.headingAlignmentDegrees < 6);
    } else await assert.rejects(run, /failed to recover|released touch|did not advance/);
    assert.equal(waited, 1000);
    assert.ok(simulated <= 1500);
  }
});


test('vehicle collision probe allows tangential sliding but requires sustained inward blockage', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/verification/urban-sandbox.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function probeVehicleCollision('), source.indexOf('\nasync function useEquipmentSimulation('));
  for (const moves of [false, true]) {
    let step = 0;
    const probe = vm.runInNewContext(`(${body})`, {
      turnToward: async () => {},
      actorState: async () => ({ x: moves ? -1.2 - step : -1.2, z: step * .01, distance: 1.2 }),
      inputStep: async (_page, key, duration) => { assert.equal(key, 'ArrowUp'); assert.equal(duration, 1000); step++; }
    });
    const result = await probe({}, { x: 0, z: 0, yaw: 0 });
    assert.equal(result.blocked, !moves);
    if (moves) assert.equal(result.budgetExhausted, true);
    else assert.equal(result.stagnantMs, 7000);
  }
});
