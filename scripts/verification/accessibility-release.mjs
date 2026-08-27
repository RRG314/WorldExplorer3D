import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const servedRoot = path.resolve(root, process.env.WE3D_VERIFY_ROOT || root);
const server = await startStaticServer({ rootDir: servedRoot, ports: [4434, 4435, 4436] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const outputRoot = path.join(root, 'output', 'verification', 'accessibility-release');

async function keyboardReach(page, predicate, maximumTabs = 180) {
  for (let index = 0; index < maximumTabs; index += 1) {
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        id: element?.id || '',
        destination: element?.dataset?.globeDestination || '',
        text: String(element?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
      };
    });
    if (predicate(focused)) return focused;
    await page.keyboard.press('Tab');
  }
  return null;
}

async function semanticAudit(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"][tabindex]')].filter(visible);
    const missingNames = interactive.filter((element) => {
      const labels = 'labels' in element ? [...(element.labels || [])].map((label) => label.textContent).join(' ') : '';
      const name = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || labels ||
        element.textContent || element.getAttribute('title') || element.getAttribute('placeholder') || element.getAttribute('value');
      return !String(name || '').trim();
    }).map((element) => element.id || element.outerHTML.slice(0, 100));
    return {
      interactiveCount: interactive.length,
      missingNames,
      duplicateIds: [...new Set([...document.querySelectorAll('[id]')].map((element) => element.id).filter((id, index, ids) => ids.indexOf(id) !== index))],
      liveRegions: [...document.querySelectorAll('[aria-live]')].filter(visible).length,
      modalDialogs: [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].length
    };
  });
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
  });
  try {
    await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
    const consent = page.locator('#analyticsConsentDenyBtn');
    if (await consent.isVisible().catch(() => false)) await consent.click();
    const titleAudit = await semanticAudit(page);
    const titleAccessibility = await page.evaluate(() => globalThis.getWorldExplorerAccessibilitySnapshot?.() || null);

    const controlsTarget = await keyboardReach(page, (focused) => focused.destination === 'controls');
    assert.ok(controlsTarget, 'Keyboard Tab must reach Quick Start/Controls.');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#globeHubOverlay:not([hidden]) #accessibilitySettings', { timeout: 10_000 });
    const textTarget = await keyboardReach(page, (focused) => focused.id === 'accessibilityTextScale');
    assert.ok(textTarget, 'Keyboard Tab must reach text-size control.');
    await page.keyboard.type('Extra');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessibilityReducedMotion');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessibilityHighContrast');
    await page.keyboard.press('Space');
    const settingsApplied = await page.evaluate(() => globalThis.getWorldExplorerAccessibilitySnapshot?.() || null);
    const trappedIds = [];
    for (let index = 0; index < 24; index += 1) {
      await page.keyboard.press('Tab');
      trappedIds.push(await page.evaluate(() => ({ id: document.activeElement?.id || '', inside: document.getElementById('globeHubOverlay')?.contains(document.activeElement) === true })));
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('globeHubOverlay')?.hidden === true, null, { timeout: 10_000 });
    const restoredFocus = await page.evaluate(() => document.activeElement?.dataset?.globeDestination || '');

    const startTarget = await keyboardReach(page, (focused) => focused.id === 'globeSelectorStartBtn');
    assert.ok(startTarget, 'Keyboard Tab must reach Explore.');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return state.gameStarted === true && state.worldLoading === false && Number(state.worldCounts?.buildings || 0) > 0 && Number(state.worldCounts?.roads || 0) > 0;
    }, null, { timeout: 300_000 });
    await page.waitForTimeout(2_000);

    const beforeWalk = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.position || null);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowUp');
    const afterWalk = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.position || null);
    const walkedMeters = Math.hypot(Number(afterWalk?.x) - Number(beforeWalk?.x), Number(afterWalk?.z) - Number(beforeWalk?.z));

    await page.keyboard.press('KeyI');
    await page.waitForSelector('#urbanEquipment.show', { timeout: 10_000 });
    const backpack = await page.evaluate(() => ({
      label: document.getElementById('urbanEquipment')?.getAttribute('aria-label') || '',
      statusRole: document.getElementById('urbanEquipmentStatus')?.getAttribute('role') || ''
    }));
    await page.keyboard.press('KeyI');
    await page.waitForFunction(() => !document.getElementById('urbanEquipment')?.classList.contains('show'), null, { timeout: 10_000 });

    await page.keyboard.press('Escape');
    await page.waitForSelector('#pauseScreen.show', { timeout: 10_000 });
    const pauseFocusInside = await page.evaluate(() => document.getElementById('pauseScreen')?.contains(document.activeElement) === true);
    const resumeTarget = await keyboardReach(page, (focused) => focused.id === 'resumeBtn', 20);
    assert.ok(resumeTarget, 'Keyboard Tab must reach Resume inside the pause dialog.');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('pauseScreen')?.classList.contains('show'), null, { timeout: 10_000 });
    const worldAudit = await semanticAudit(page);
    await page.screenshot({ path: path.join(outputRoot, 'desktop-keyboard-accessibility.png'), fullPage: false });

    const checks = {
      browserZoomAllowed: titleAccessibility?.browserZoomAllowed === true,
      titleInteractiveNames: titleAudit.missingNames.length === 0,
      noDuplicateIds: titleAudit.duplicateIds.length === 0 && worldAudit.duplicateIds.length === 0,
      liveRegionsPresent: titleAudit.liveRegions > 0 && worldAudit.liveRegions > 0,
      keyboardReachesControlsAndExplore: !!controlsTarget && !!startTarget,
      accessibilitySettingsPersisted: settingsApplied?.settings?.textScale === '130' && settingsApplied?.settings?.reducedMotion === true && settingsApplied?.settings?.highContrast === true,
      focusTrappedInModal: trappedIds.length === 24 && trappedIds.every((entry) => entry.inside),
      focusRestored: restoredFocus === 'controls',
      normalKeyboardWalking: walkedMeters >= 0.25,
      backpackSemanticStatus: backpack.label === 'Character Backpack' && backpack.statusRole === 'status',
      pauseDialogFocus: pauseFocusInside,
      worldInteractiveNames: worldAudit.missingNames.length === 0,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), checks, titleAudit, worldAudit, settingsApplied, walkedMeters, backpack, trappedIds, browserErrors, localFailures };
  } finally {
    await context.close();
  }
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ url: response.url(), status: response.status() });
  });
  try {
    await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
    const liveGpsUnderActivities = await page.evaluate(() => document.getElementById('tab-games')?.contains(document.querySelector('[data-mode="livegps"]')) === true);
    await page.locator('#globeSelectorStartBtn').tap();
    await page.waitForFunction(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return state.gameStarted === true && state.worldLoading === false && Number(state.worldCounts?.buildings || 0) > 0 && Number(state.worldCounts?.roads || 0) > 0;
    }, null, { timeout: 300_000 });
    await page.waitForTimeout(2_000);
    await page.locator('#controlsBarBtn').tap();
    await page.waitForSelector('#controlsTab.bar-open #accessibilitySettings', { timeout: 10_000 });
    await page.locator('#accessibilityTextScale').selectOption('130');
    await page.locator('#accessibilityReducedMotion').check();
    await page.locator('#accessibilityHighContrast').check();
    const snapshot = await page.evaluate(() => globalThis.getWorldExplorerAccessibilitySnapshot?.() || null);
    const touchTargets = await page.evaluate(() => {
      const ids = ['controlsBarBtn', 'mobileActionPrimary', 'mobileActionSecondary', 'mobileControlsReset', 'accessibilityTextScale', 'accessibilityReducedMotion', 'accessibilityHighContrast'];
      return ids.map((id) => {
        const control = document.getElementById(id);
        const element = ['accessibilityReducedMotion', 'accessibilityHighContrast'].includes(id)
          ? control?.closest('label')
          : control;
        const rect = element?.getBoundingClientRect();
        return { id, visible: !!rect && rect.width > 0 && rect.height > 0, width: rect?.width || 0, height: rect?.height || 0 };
      });
    });
    const audit = await semanticAudit(page);
    await page.screenshot({ path: path.join(outputRoot, 'mobile-accessibility-settings-390x844.png'), fullPage: false });
    const checks = {
      viewport390x844: await page.evaluate(() => innerWidth === 390 && innerHeight === 844),
      liveGpsRemainsUnderActivities: liveGpsUnderActivities,
      settingsApplied: snapshot?.settings?.textScale === '130' && snapshot?.settings?.reducedMotion === true && snapshot?.settings?.highContrast === true,
      touchTargetsAtLeast44: touchTargets.filter((entry) => entry.visible).every((entry) => entry.width >= 44 && entry.height >= 44),
      interactiveNames: audit.missingNames.length === 0,
      noDuplicateIds: audit.duplicateIds.length === 0,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    return { ok: Object.values(checks).every(Boolean), checks, snapshot, touchTargets, audit, browserErrors, localFailures };
  } finally {
    await context.close();
  }
}

try {
  await mkdir(outputRoot, { recursive: true });
  const desktop = await runDesktop();
  const mobile = await runMobile();
  const report = { ok: desktop.ok && mobile.ok, contract: 'minimum-5-accessibility-release-v1', generatedAt: new Date().toISOString(), writesProduction: false, desktop, mobile };
  await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Minimum-5 keyboard, semantic, focus, settings, or 390x844 accessibility boundary failed.');
} finally {
  await browser.close();
  await server.close();
}
