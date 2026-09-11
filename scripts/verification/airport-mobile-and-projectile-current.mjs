import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4250').replace(/\/$/, '');
const outputDir = 'output/verification/airport-mobile-and-projectile-current';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push({ status: response.status(), url: response.url() });
});

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.1774', lon: '-76.6684', lname: 'BWI Airport',
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.aviation?.fleetCount >= 7;
  }, null, { timeout: 360_000 });
  const later = page.getByRole('button', { name: 'Later', exact: true }).first();
  if (await later.isVisible().catch(() => false)) await later.click();

  assert.equal(await page.evaluate(() => globalThis.__WE3D_AVIATION_SUPPORT__?.openHub('ticket_hall')), true);
  await page.waitForSelector('.airport-hub[open]', { timeout: 10_000 });
  await page.screenshot({ path: `${outputDir}/airport-hub-390x844.png`, fullPage: true });
  const layout = await page.evaluate(() => {
    const hub = document.querySelector('.airport-hub[open]');
    const rect = hub?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      horizontalOverflow: hub ? hub.scrollWidth - hub.clientWidth : Infinity,
      travelVisible: !!document.querySelector('.airport-hub__travel'),
      searchVisible: !!document.querySelector('#airportDestinationSearch')
    };
  });
  assert.ok(layout.rect && layout.rect.left >= 0 && layout.rect.right <= 390 && layout.rect.top >= 0 && layout.rect.bottom <= 844);
  assert.ok(layout.horizontalOverflow <= 1, `Airport hub overflowed mobile width by ${layout.horizontalOverflow}px.`);
  assert.equal(layout.travelVisible && layout.searchVisible, true);
  await page.locator('.airport-hub__close').click();

  await page.keyboard.press('Digit4');
  await page.keyboard.press('KeyV');
  const projectileActive = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime?.activeProjectiles === 0, null, { timeout: 8_000 });
  const projectileExpired = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime);
  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());

  const checks = Object.freeze({
    mobileFleetBudgetApplied: diagnostics.aviation?.fleetCount >= 7 && diagnostics.aviation?.fleetCount <= 10,
    mobileHubContained: layout.rect?.right <= 390 && layout.rect?.bottom <= 844 && layout.horizontalOverflow <= 1,
    mobileHubActionsPresent: layout.travelVisible && layout.searchVisible,
    projectileActuallySpawned: projectileActive.lastPlayerProjectileLaunch?.phase === 'travel',
    projectileExpired: projectileExpired.activeProjectiles === 0,
    noRuntimeErrors: (diagnostics.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: failedLocalResources.length === 0
  });
  const report = { ok: Object.values(checks).every(Boolean), checks, fleetCount: diagnostics.aviation?.fleetCount ?? null, layout, projectileActive, projectileExpired, pageErrors, failedLocalResources };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mobile airport/projectile journey failed.');
} finally {
  await context.close();
  await browser.close();
}
