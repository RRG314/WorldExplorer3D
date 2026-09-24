import assert from 'node:assert/strict';

// Functional input checks use the actual runtime kernel's fixed-step hook.
// Every simulation step runs, but only the final frame is drawn per burst.
// These receipts do not measure wall-clock responsiveness or rendering speed.
export async function advanceGameplay(page, milliseconds) {
  assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 2000);
  const receipt = await page.evaluate((duration) => globalThis.advanceTime?.(duration, { renderIntermediateFrames: false }), milliseconds);
  assert.ok(receipt && Math.abs(receipt.simulatedMs - milliseconds) < 0.001 &&
    receipt.frames > 0 && receipt.suspendedFrames === 0,
  `Gameplay did not advance: ${JSON.stringify(receipt)}`);
  return receipt;
}

// Route instrumented navigation through the real DOM keyboard handlers and
// simulation in one browser task. Separate protocol down/step/up calls allow
// live RAF turns between commands, so runner latency changes the steering.
// This proves functional navigation, not trusted hardware input or frame rate.
export async function stepGameplayKeys(page, keys, milliseconds, { yieldToNetwork = false } = {}) {
  assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 6000);
  const codes = Array.isArray(keys) ? keys : [keys];
  assert.ok(codes.length > 0 && codes.every(code => /^(Arrow(Up|Down|Left|Right)|ShiftLeft|Space)$/.test(code)));
  const receipts = await page.evaluate(async ({ codes, milliseconds, yieldToNetwork }) => {
    const target = document.activeElement || document.body;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName)) {
      throw new Error('Gameplay navigation is blocked by a focused UI control.');
    }
    const dispatch = (type, code) => target.dispatchEvent(new KeyboardEvent(type, {
      code, key: code === 'ShiftLeft' ? 'Shift' : code === 'Space' ? ' ' : code,
      shiftKey: codes.includes('ShiftLeft') && type === 'keydown', bubbles: true, cancelable: true
    }));
    try {
      for (const code of codes) dispatch('keydown', code);
      const result = [];
      for (let remaining = milliseconds; remaining > 0;) {
        // The kernel owns RAF suspension through every heartbeat/network yield.
        // Yielding here would resume live animation while these keys remain held.
        const duration = Math.min(2000, remaining);
        result.push({ duration, receipt: await globalThis.advanceTime?.(duration, { yieldToNetwork, renderIntermediateFrames: false }) });
        remaining -= duration;
      }
      return result;
    } finally {
      for (const code of [...codes].reverse()) dispatch('keyup', code);
    }
  }, { codes, milliseconds, yieldToNetwork });
  for (const { duration, receipt } of receipts) {
    assert.ok(receipt && Math.abs(receipt.simulatedMs - duration) < 0.001 &&
      receipt.frames > 0 && receipt.suspendedFrames === 0,
    `Navigation simulation did not advance: ${JSON.stringify(receipt)}`);
  }
  return { timing: yieldToNetwork ? 'dom-keyboard-fixed-step-with-network-yields' : 'dom-keyboard-runtime-fixed-step', receipts };
}

export async function advanceUntilFishingStage(page, stage, maximumMs = 10000) {
  let simulatedMs = 0;
  while (true) {
    const fishing = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().fishing || {});
    if (fishing.stage === stage) return { timing: 'runtime-fixed-step', simulatedMs, fishing };
    assert.ok(!['lost', 'landed', 'closed'].includes(fishing.stage) && simulatedMs < maximumMs,
      `Fishing did not reach ${stage}: ${JSON.stringify({ simulatedMs, fishing })}`);
    const receipt = await advanceGameplay(page, 100);
    simulatedMs += receipt.simulatedMs;
  }
}

// A live traffic target can move between separate automation protocol calls.
// Check the visible interaction and send its normal DOM key in one browser
// task; no pose, ownership, or gameplay state is assigned by the verifier.
export async function enterNearbyVehicle(page, vehicleId) {
  const result = await page.evaluate(async id => {
    const before = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const urban = before.urbanSandbox || {};
    if (urban.interaction?.action !== 'enter_vehicle' || urban.nearbyVehicleId !== id) return null;
    const target = document.activeElement || document.body;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName)) {
      throw new Error('Vehicle input is blocked by a focused UI control.');
    }
    try {
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true, cancelable: true }));
      const receipt = await globalThis.advanceTime?.(150);
      return { receipt, state: globalThis.getWorldExplorerRuntimeDiagnostics?.() };
    } finally {
      target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true, cancelable: true }));
    }
  }, vehicleId);
  if (!result) return null;
  assert.ok(result.receipt?.simulatedMs === 150 && result.receipt?.frames > 0 && result.receipt?.suspendedFrames === 0,
    `Vehicle entry did not advance: ${JSON.stringify(result.receipt)}`);
  const urban = result.state?.urbanSandbox;
  const vehicle = urban?.vehicles?.find(entry => entry.id === vehicleId);
  assert.ok(urban?.phase === 'enter' && Math.abs(Number(vehicle?.driverDoor?.openRadians || 0)) > .05,
    `Normal vehicle interaction did not open the selected door: ${JSON.stringify({ phase: urban?.phase, vehicle })}`);
  return { ...result, timing: 'dom-keyboard-runtime-fixed-step' };
}

// Camera easing is simulation-driven while the saved mobile idle delay is real
// time. Keep both clocks explicit; this proves recovery, not device latency.
export async function settleReleasedCamera(page, { maximumHeadingDegrees, minimumTrailingDistance, maximumSimulationMs, idleDelayMs = 1000 }) {
  assert.ok(maximumHeadingDegrees > 0 && minimumTrailingDistance > 0);
  assert.ok(maximumSimulationMs > 0 && maximumSimulationMs <= 6000 && idleDelayMs >= 900);
  const started = Date.now();
  await page.waitForTimeout(idleDelayMs);
  const read = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  const afterIdle = await read();
  let state = afterIdle, simulatedMs = 0;
  const receipts = [];
  while (true) {
    assert.ok(state.mobileControls?.look?.active !== true && state.mobileControls?.move?.active !== true,
      'Camera recovery requires released touch controls');
    const camera = state.cameraFollow;
    if (Number(camera?.headingAlignmentDegrees) < maximumHeadingDegrees &&
        Number(camera?.trailingDistance) > minimumTrailingDistance) {
      return { state, afterIdleCamera: afterIdle.cameraFollow, simulatedMs, idleDelayMs,
        wallElapsedMs: Date.now() - started, receipts, evidenceScope: 'functional recovery; not wall-clock latency acceptance' };
    }
    assert.ok(simulatedMs < maximumSimulationMs, `Camera failed to recover within simulation budget: ${JSON.stringify({ simulatedMs, camera })}`);
    const receipt = await advanceGameplay(page, Math.min(250, maximumSimulationMs - simulatedMs));
    receipts.push(receipt);
    simulatedMs += receipt.simulatedMs;
    state = await read();
  }
}
