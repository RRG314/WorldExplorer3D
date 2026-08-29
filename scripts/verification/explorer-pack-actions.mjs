import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4202').replace(/\/$/, '');
const evidenceDir = 'output/verification/explorer-pack-actions';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true
});
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];

page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

const diagnostics = () => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});

async function openExploreMenu() {
  if (await page.locator('#exploreMenu.open').isVisible().catch(() => false)) return;
  await page.locator('#exploreBtn').click();
  await page.waitForSelector('#exploreMenu.open', { timeout: 5_000 });
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();

  // This journey validates the changed gameplay authorities. It deliberately
  // does not wait for provider-dependent road/building counts.
  await page.waitForFunction(() => {
    const current = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return current?.gameStarted === true && current?.environment === 'EARTH' &&
      current?.worldDiscovery?.active === true && current?.urbanSandbox?.active === true;
  }, null, { timeout: 180_000 });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldLoading === false, null, { timeout: 120_000 });

  await openExploreMenu();
  await page.locator('#fWalk').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().mode === 'walking', null, { timeout: 10_000 }).catch(() => {});

  // A single touch/click must leave one menu open; there is no second touchend
  // dispatcher allowed to immediately toggle it closed again.
  await openExploreMenu();
  assert.equal(await page.locator('#exploreMenu.open').isVisible(), true);
  assert.equal(await page.locator('#fBackpack').isVisible(), true);
  await page.locator('#fBackpack').click();
  await page.waitForSelector('#urbanEquipment.show', { timeout: 5_000 });
  assert.match(await page.locator('#urbanEquipment').textContent(), /Backpack/i);
  await page.screenshot({ path: `${evidenceDir}/mobile-backpack-direct-entry.png` });
  await page.locator('#urbanEquipmentCloseBtn').click();

  await openExploreMenu();
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 5_000 });
  assert.equal(await page.locator('#discoveryOpenBackpackTodayBtn').isVisible(), true);

  const choices = page.locator('.discoveryActionChip');
  assert.ok(await choices.count() >= 2, 'Expected at least two local activity choices.');
  const selectedChoice = choices.nth(1);
  const selectedId = await selectedChoice.getAttribute('data-discovery-action');
  await selectedChoice.click();
  const samples = [];
  for (let index = 0; index < 16; index += 1) {
    samples.push(await page.locator('.discoveryActionChip.active').getAttribute('data-discovery-action'));
    await page.waitForTimeout(100);
  }
  assert.deepEqual([...new Set(samples)], [selectedId]);
  await page.screenshot({ path: `${evidenceDir}/mobile-stable-activity-selection.png` });

  await page.locator('#discoveryOpenBackpackTodayBtn').click();
  await page.waitForSelector('#urbanEquipment.show', { timeout: 5_000 });
  await page.locator('#urbanEquipmentCloseBtn').click();

  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(90);
  const handsUse = (await diagnostics()).urbanSandbox?.projectileRuntime?.useAnimation;
  assert.equal(handsUse?.id, 'hands');
  assert.equal(handsUse?.category, 'unarmed');
  await page.screenshot({ path: `${evidenceDir}/mobile-hands-action.png` });

  await page.waitForTimeout(500);
  await page.keyboard.press('Digit3');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(100);
  const staffUse = (await diagnostics()).urbanSandbox?.projectileRuntime?.useAnimation;
  assert.equal(staffUse?.id, 'baton');
  assert.equal(staffUse?.category, 'melee');
  await page.screenshot({ path: `${evidenceDir}/mobile-staff-action.png` });

  await page.waitForTimeout(500);
  await page.keyboard.press('Digit4');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(90);
  const weapon = (await diagnostics()).urbanSandbox?.projectileRuntime;
  assert.equal(weapon?.useAnimation?.id, 'pulse-sidearm');
  assert.equal(weapon?.lastProjectileAction?.equipmentId, 'pulse-sidearm');
  assert.equal(await page.locator('#urbanWeaponReticle').isVisible(), true);
  await page.screenshot({ path: `${evidenceDir}/mobile-sidearm-action.png` });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openExploreMenu();
  await page.locator('#fWorldDiscovery').click();
  await page.waitForSelector('#discoveryPanel.show', { timeout: 5_000 });
  assert.equal(await page.locator('#discoveryOpenBackpackTodayBtn').isVisible(), true);
  await page.screenshot({ path: `${evidenceDir}/desktop-explorer-entry.png` });

  const current = await diagnostics();
  const report = {
    ok: pageErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'changed-explorer-pack-and-visible-actions',
    checks: {
      oneMobileExploreToggleAuthority: true,
      directBackpackEntry: true,
      todayBackpackEntry: true,
      stableActivitySelection: true,
      visibleHandsAction: handsUse?.category === 'unarmed',
      visibleStaffAction: staffUse?.category === 'melee',
      visibleWeaponActionAndReticle: weapon?.useAnimation?.id === 'pulse-sidearm' && weapon?.lastProjectileAction?.equipmentId === 'pulse-sidearm',
      desktopAndMobileRenderedFromOneWorldLoad: true,
      earthGameplayRuntime: current.gameStarted === true && current.environment === 'EARTH',
      noPageErrors: pageErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    pageErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
}
