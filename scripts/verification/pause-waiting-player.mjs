import assert from 'node:assert/strict';

export async function pauseWaitingPlayer(page) {
  await page.bringToFront();
  // Normal keyboard gameplay already owns focus. A redundant canvas click
  // waits for rendered stability and can consume a short server lease on a
  // slow GPU before Escape is even sent. Refocus only actual form controls.
  const focusedControl = await page.evaluate(() => {
    const element = document.activeElement;
    return element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element?.tagName);
  });
  if (focusedControl) await page.locator('body > canvas:not(#minimap)').click();
  const attempts = [];
  // Escape first dismisses an open gameplay panel. Observe that normal UI
  // transition before using Escape again to request the actual pause dialog.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    attempts.push(await page.evaluate(() => ({
      focusedElement: document.activeElement?.tagName,
      visiblePanels: [...document.querySelectorAll('[role="dialog"], #largeMap, #discoveryPanel, #urbanEquipmentPanel')]
        .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        .map(element => element.id),
      paused: globalThis.getWorldExplorerRuntimeDiagnostics?.().paused
    })));
    if (await page.locator('#pauseScreen.show').isVisible()) break;
    await page.keyboard.press('Escape');
    if (await page.waitForFunction(() =>
      globalThis.getWorldExplorerRuntimeDiagnostics?.().paused === true &&
      document.getElementById('pauseScreen')?.classList.contains('show'),
    null, { timeout: 5_000, polling: 250 }).then(() => true, () => false)) break;
  }
  assert.ok(await page.locator('#pauseScreen.show').isVisible(),
    `Normal Escape input did not open pause: ${JSON.stringify(attempts)}`);
  const renderedFrames = () => page.evaluate(() =>
    globalThis.getWorldExplorerRuntimeDiagnostics?.().runtimeKernel?.phases?.render?.find(system => system.id === 'core.renderer')?.updates);
  const before = await renderedFrames();
  await page.waitForTimeout(500);
  const after = await renderedFrames();
  assert.ok(Number.isFinite(before) && before === after, 'Manual pause must stop city drawing while the other client plays.');
  return { before, after, attempts };
}
