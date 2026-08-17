import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'account-admin');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '0.0.0.0', candidatePorts: [4347, 4348, 4349] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fatalErrors = [];

page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Firebase|Failed to load resource|ERR_|400|401|403/i.test(message.text())) {
    fatalErrors.push(message.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/account/?section=profile`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.account-nav [data-account-target="profile"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('[data-account-view="profile"]').isHidden(), true, 'Signed-out account content should remain private');
  assert.equal(await page.locator('#authPrompt').isVisible(), true);
  await page.screenshot({ path: path.join(outputDir, 'account-signed-out-desktop.png'), fullPage: true });

  await page.evaluate(() => {
    document.getElementById('authPrompt').hidden = true;
    document.getElementById('accountPanel').hidden = false;
  });
  await page.locator('.account-nav [data-account-target="security"]').click();
  assert.equal(await page.locator('[data-account-view="security"]').getAttribute('hidden'), null);
  assert.equal(await page.locator('[data-account-view]:not([hidden])').count(), 1);
  assert.match(page.url(), /section=security/);
  await page.addStyleTag({ content: '#accountPanel { display: block !important; }' });
  await page.screenshot({ path: path.join(outputDir, 'account-security-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const railBox = await page.locator('.account-rail').boundingBox();
  assert.ok(railBox && railBox.height < 220, `Mobile account navigation is too tall: ${JSON.stringify(railBox)}`);
  await page.screenshot({ path: path.join(outputDir, 'account-security-mobile.png'), fullPage: true });

  await page.goto(`http://127.0.0.1:${server.port}/account/admin.html?view=operations`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-view="system"]').evaluate((button) => button.classList.contains('active')), true);
  assert.equal(await page.locator('#authGate').isVisible(), true);
  assert.equal(await page.locator('#adminWorkspace').isHidden(), true);
  await page.screenshot({ path: path.join(outputDir, 'admin-access-gate-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://0.0.0.0:${server.port}/app/`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  const shippingDiagnostics = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      enabled: ctx.developerDiagnosticsEnabled,
      rdt: ctx.getRdtNoiseConfig?.(),
      text: JSON.parse(globalThis.render_game_to_text?.() || '{}').developerDiagnostics
    };
  });
  assert.equal(shippingDiagnostics.enabled, false);
  assert.equal(shippingDiagnostics.rdt.enabled, false);
  assert.equal(shippingDiagnostics.rdt.cachedCells, 0);
  assert.equal(shippingDiagnostics.text.networkWrites, false);

  const tutorialJourney = await page.evaluate(async () => {
    localStorage.removeItem('worldExplorer3D.tutorialState.v2');
    localStorage.removeItem('worldExplorer3D.tutorialState.v1');
    globalThis.__WE3D_TUTORIAL_ANALYTICS_QUEUE__ = [];
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const tutorial = await import('/app/js/tutorial/tutorial.js?v=2');
    ctx.gameStarted = true;
    ctx.paused = false;
    if (ctx.Walk?.state) ctx.Walk.state.mode = 'drive';
    if (ctx.boatMode) ctx.boatMode.active = false;
    ctx.droneMode = false;
    ctx.car.x = 0;
    ctx.car.z = 0;
    tutorial.initTutorial();
    const presented = [document.querySelector('#tutorialHintCard .tutorial-title')?.textContent || ''];
    const discoveryPanel = document.getElementById('discoveryPanel');
    discoveryPanel?.classList.add('show');
    tutorial.tutorialUpdate();
    const hiddenDuringDiscovery = document.getElementById('tutorialHintCard')?.hidden === true;
    discoveryPanel?.classList.remove('show');
    for (let x = 1; x <= 13; x += 1) {
      ctx.car.x = x;
      tutorial.tutorialUpdate();
    }
    presented.push(document.querySelector('#tutorialHintCard .tutorial-title')?.textContent || '');
    globalThis.dispatchEvent(new CustomEvent('we3d:discovery-telemetry', { detail: { type: 'activity_started' } }));
    presented.push(document.querySelector('#tutorialHintCard .tutorial-title')?.textContent || '');
    globalThis.dispatchEvent(new CustomEvent('we3d:discovery-telemetry', { detail: { type: 'discovery_recorded' } }));
    presented.push(document.querySelector('#tutorialHintCard .tutorial-title')?.textContent || '');
    return {
      state: JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v2') || '{}'),
      presented,
      hiddenDuringDiscovery,
      events: (globalThis.__WE3D_TUTORIAL_ANALYTICS_QUEUE__ || []).map((event) => event.name)
    };
  });
  assert.deepEqual(tutorialJourney.presented, [
    'Take your first steps',
    'Choose one field activity',
    'Record one discovery',
    'Your Explorer story has started'
  ]);
  assert.equal(tutorialJourney.state.completed, true);
  assert.equal(tutorialJourney.hiddenDuringDiscovery, true);
  assert.equal(tutorialJourney.state.stage, 'complete');
  assert.ok(tutorialJourney.events.includes('tutorial_begin'));
  assert.ok(tutorialJourney.events.includes('tutorial_complete'));

  await page.goto(`http://0.0.0.0:${server.port}/app/?diagnostics=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  assert.equal(await page.evaluate(async () => (await import('/app/js/shared-context.js?v=55')).ctx.developerDiagnosticsEnabled), true);
  assert.deepEqual(fatalErrors, []);

  console.log(JSON.stringify({
    ok: true,
    shippingDiagnostics,
    tutorialJourney,
    screenshots: ['account-signed-out-desktop.png', 'account-security-desktop.png', 'account-security-mobile.png', 'admin-access-gate-mobile.png']
  }, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
