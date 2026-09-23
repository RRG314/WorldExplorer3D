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
      return { scope: 'real GPS fixes and field runtime; no simulation-clock override', elapsedMs: now() - started, lastState };
    }
  } while (now() - started < timeoutMs);
  throw new Error(`GPS field observation did not reveal the selected stop: ${JSON.stringify({ targetId, lastState })}`);
}
