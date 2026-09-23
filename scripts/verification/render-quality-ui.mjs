// Functional CI journeys use the shipped quality setting. World data, physics,
// authority and server deadlines remain unchanged; this is not FPS evidence.
export async function selectLowRenderQuality(page) {
  await page.locator('[data-globe-destination="settings"]').click();
  await page.locator('#renderQualitySelect').selectOption('low');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().quality === 'low');
  await page.locator('#globeHubOverlayCloseBtn').click();
  await page.locator('#globeHubOverlay').waitFor({ state: 'hidden' });
}
