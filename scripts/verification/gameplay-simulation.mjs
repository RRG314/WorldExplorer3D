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
