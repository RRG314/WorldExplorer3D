import assert from 'node:assert/strict';

// Functional input checks use the actual runtime kernel's fixed-step hook.
// These receipts do not measure wall-clock responsiveness or rendering speed.
export async function advanceGameplay(page, milliseconds) {
  assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 2000);
  const receipt = await page.evaluate((duration) => globalThis.advanceTime?.(duration), milliseconds);
  assert.ok(receipt && Math.abs(receipt.simulatedMs - milliseconds) < 0.001 &&
    receipt.frames > 0 && receipt.suspendedFrames === 0,
  `Gameplay did not advance: ${JSON.stringify(receipt)}`);
  return receipt;
}

// Route instrumented navigation through the real DOM keyboard handlers and
// simulation in one browser task. Separate protocol down/step/up calls allow
// live RAF turns between commands, so runner latency changes the steering.
// This proves functional navigation, not trusted hardware input or frame rate.
export async function stepGameplayKeys(page, keys, milliseconds) {
  assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 6000);
  const codes = Array.isArray(keys) ? keys : [keys];
  assert.ok(codes.length > 0 && codes.every(code => /^(Arrow(Up|Down|Left|Right)|ShiftLeft)$/.test(code)));
  const receipts = await page.evaluate(async ({ codes, milliseconds }) => {
    const target = document.activeElement || document.body;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName)) {
      throw new Error('Gameplay navigation is blocked by a focused UI control.');
    }
    const dispatch = (type, code) => target.dispatchEvent(new KeyboardEvent(type, {
      code, key: code === 'ShiftLeft' ? 'Shift' : code,
      shiftKey: codes.includes('ShiftLeft') && type === 'keydown', bubbles: true, cancelable: true
    }));
    try {
      for (const code of codes) dispatch('keydown', code);
      const result = [];
      for (let remaining = milliseconds; remaining > 0;) {
        const duration = Math.min(2000, remaining);
        result.push({ duration, receipt: await globalThis.advanceTime?.(duration) });
        remaining -= duration;
      }
      return result;
    } finally {
      for (const code of [...codes].reverse()) dispatch('keyup', code);
    }
  }, { codes, milliseconds });
  for (const { duration, receipt } of receipts) {
    assert.ok(receipt && Math.abs(receipt.simulatedMs - duration) < 0.001 &&
      receipt.frames > 0 && receipt.suspendedFrames === 0,
    `Navigation simulation did not advance: ${JSON.stringify(receipt)}`);
  }
  return { timing: 'dom-keyboard-runtime-fixed-step', receipts };
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
