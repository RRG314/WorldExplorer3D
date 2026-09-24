import assert from 'node:assert/strict';

// CDP sends a single position event per override; it is not a continuous phone
// GPS watch. Keep supplying fixes while the actual field session observes the
// target. Do not bypass freshness/accuracy/access rules or assign game state.
export async function waitForGpsFieldReveal(page, cdp, fix, targetId, { timeoutMs = 30_000, now = Date.now } = {}) {
  assert.ok(Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude));
  const started = now();
  let lastState;
  do {
    await cdp.send('Emulation.setGeolocationOverride', { ...fix, accuracy: 6, speed: 0, heading: 0 });
    await page.waitForTimeout(620);
    lastState = await page.evaluate(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return { phase: state.worldDiscovery?.interaction?.phase, targetId: state.worldDiscovery?.interaction?.targetId,
        pauseReason: state.liveGps?.fieldSession?.pauseReason, lastFixAgeMs: state.liveGps?.lastFixAgeMs };
    });
    if (lastState.targetId === targetId && lastState.phase === 'revealed') {
      return { scope: 'simulated sensor fixes and real field runtime; real timestamps, no simulation-clock override', elapsedMs: now() - started, lastState };
    }
  } while (now() - started < timeoutMs);
  throw new Error(`GPS field observation did not reveal the selected stop: ${JSON.stringify({ targetId, lastState })}`);
}

// A phone watch continues while panels open, screenshots run, and records save.
// Serialize protocol writes so an older heartbeat cannot overwrite a new fix.
export function createGpsFixStream(cdp, {
  intervalMs = 620, setTimer = setTimeout, clearTimer = clearTimeout
} = {}) {
  let currentFix = null, timer = null, stopped = false, failure = null;
  let pending = Promise.resolve(), sent = 0;
  const assertHealthy = () => { if (failure) throw failure; };
  function transmit() {
    const fix = { ...currentFix };
    const operation = pending.then(async () => {
      if (stopped) return;
      await cdp.send('Emulation.setGeolocationOverride', fix);
      sent++;
    });
    pending = operation.catch(error => { failure = error; });
    return operation;
  }
  function schedule() {
    if (stopped || timer !== null || failure) return;
    timer = setTimer(async () => {
      timer = null;
      try { await transmit(); } catch { /* surfaced to caller and cleanup */ }
      schedule();
    }, intervalMs);
    timer?.unref?.();
  }
  return {
    async send(method, fix) {
      assert.equal(method, 'Emulation.setGeolocationOverride');
      assert.ok(!stopped && Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude));
      assertHealthy();
      currentFix = { ...fix };
      await transmit();
      schedule();
    },
    assertHealthy,
    snapshot: () => ({ sent, active: !stopped && currentFix !== null, failed: !!failure, intervalMs }),
    async stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      await pending;
      assertHealthy();
    }
  };
}
