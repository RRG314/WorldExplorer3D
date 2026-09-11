import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const servedRoot = path.resolve(process.cwd(), String(process.env.WE3D_VERIFY_ROOT || '.'));
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4437, 4438, 4439] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const evidenceDir = 'output/verification/connected-explorer-journey';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

await context.addInitScript(() => {
  localStorage.removeItem('worldExplorer3D.tutorialState.v5');
  localStorage.removeItem('worldExplorer3D.tutorialState.v4');
  localStorage.removeItem('worldExplorer3D.keyboardBindings.v1');
});

function tutorialState() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || 'null'));
}

async function hold(code, durationMs, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.keyboard.down(code);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(code);
  for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
}

async function moveWithRemappedForwardKey() {
  const before = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await hold('KeyZ', 900, ['Shift']);
    const state = await tutorialState();
    if (state?.stage === 'interact') {
      const after = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null);
      return { before, after };
    }
    await hold(attempt % 2 === 0 ? 'KeyA' : 'KeyD', 160);
  }
  throw new Error(`Remapped forward key did not advance the live tutorial: ${JSON.stringify(await tutorialState())}`);
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });

  // Configure an actual action before entering the world. This verifies the
  // player-facing settings, saved authority, and runtime consumer together.
  await page.locator('[data-globe-destination="controls"]').first().click();
  await page.waitForSelector('#keyboardBindingSettings');
  await page.locator('#keyboardBindingSettings summary').click();
  await page.locator('[data-binding-action="move_forward"]').click();
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.keyboardBindings.v1') || '{}').move_forward === 'KeyZ');
  assert.match(await page.locator('#keyboardBindingSettings').textContent(), /Move \/ accelerate\s*Z\s*Change/is);
  await page.screenshot({ path: `${evidenceDir}/01-configurable-controls-desktop.png` });
  await page.locator('[data-globe-destination="location"]').first().click();

  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false;
  }, null, { timeout: 360_000 });
  await page.waitForFunction(() => !document.getElementById('loading')?.classList.contains('show'), null, { timeout: 120_000 });

  await page.waitForSelector('#tutorialHintCard:not([hidden])', { timeout: 20_000 });
  const firstStepText = await page.locator('#tutorialHintCard').textContent();
  assert.match(firstStepText, /First Journey.*ZASD to move.*Mouse to look/is);
  assert.equal(await page.locator('#tutorialHintCard').evaluate((element) => element.classList.contains('compact')), true);
  await page.locator('#tutorialHintCard .tutorial-details-btn').click();
  assert.match(await page.locator('#tutorialHintCard').textContent(), /Right mouse button to look|Drag with the right mouse button to look/i);
  await page.screenshot({ path: `${evidenceDir}/02-first-journey-details-desktop.png` });
  await page.locator('#tutorialHintCard .tutorial-details-btn').click();

  const moved = await moveWithRemappedForwardKey();
  assert.equal((await tutorialState())?.stage, 'interact');
  const beforePosition = moved.before?.position || moved.before;
  const afterPosition = moved.after?.position || moved.after;
  assert.notDeepEqual(afterPosition, beforePosition, 'The remapped key must move the active actor in the live world.');
  assert.match(await page.locator('#tutorialHintCard').textContent(), /Try one nearby action/i);
  assert.match(await page.locator('#tutorialHintCard').textContent(), /visible door, person, parked vehicle, or usable object/i);
  await page.waitForSelector('#urbanVehiclePrompt.show', { timeout: 20_000 });
  const promptPriority = await page.evaluate(() => {
    const prompt = document.getElementById('urbanVehiclePrompt');
    const tutorial = document.getElementById('tutorialHintCard');
    const journey = document.getElementById('currentJourneyCard');
    const rect = prompt?.getBoundingClientRect();
    return {
      promptRightAligned: !!rect && rect.left > innerWidth / 2,
      tutorialSuppressed: !!tutorial && getComputedStyle(tutorial).display === 'none',
      currentJourneySuppressed: !!journey && (journey.hidden || getComputedStyle(journey).display === 'none')
    };
  });
  assert.deepEqual(promptPriority, { promptRightAligned: true, tutorialSuppressed: true, currentJourneySuppressed: true });
  await page.screenshot({ path: `${evidenceDir}/03-context-action-priority-desktop.png` });

  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || '{}').stage === 'explore', null, { timeout: 20_000 });
  await page.evaluate(() => document.getElementById('fWorldDiscovery')?.click());
  await page.waitForSelector('#discoveryPanel.show', { timeout: 20_000 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v5') || '{}').completed === true, null, { timeout: 20_000 });
  await page.locator('#discoveryCloseBtn').click();

  const statusSemantics = await page.evaluate(() => ({
    tutorialRole: document.getElementById('tutorialHintCard')?.getAttribute('role'),
    tutorialLive: document.getElementById('tutorialHintCard')?.getAttribute('aria-live'),
    journeyRole: document.getElementById('currentJourneyCard')?.getAttribute('role'),
    journeyLive: document.getElementById('currentJourneyCard')?.getAttribute('aria-live')
  }));
  assert.deepEqual(statusSemantics, {
    tutorialRole: 'status', tutorialLive: 'polite', journeyRole: 'status', journeyLive: 'polite'
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const touchLayout = await page.evaluate(() => {
    const tutorial = document.getElementById('tutorialHintCard');
    const touch = document.getElementById('mobileControls') || document.getElementById('touchControls');
    const card = tutorial && !tutorial.hidden ? tutorial.getBoundingClientRect() : null;
    const controls = touch && getComputedStyle(touch).display !== 'none' ? touch.getBoundingClientRect() : null;
    const overlap = !!card && !!controls && card.left < controls.right && card.right > controls.left && card.top < controls.bottom && card.bottom > controls.top;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      tutorialWithinViewport: !card || (card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight),
      tutorialClearsTouchControls: !overlap,
      touchSnapshot: globalThis.getWorldExplorerRuntimeDiagnostics?.().input?.touch || null
    };
  });
  assert.equal(touchLayout.tutorialWithinViewport, true);
  assert.equal(touchLayout.tutorialClearsTouchControls, true);
  await page.screenshot({ path: `${evidenceDir}/04-mobile-world-layout.png` });

  const finalState = await tutorialState();
  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'optional-first-journey-v5',
    checks: {
      controlsUiVisibleAndSaved: true,
      remappedKeyMovedLiveActor: true,
      tutorialUsesCurrentBindingLabel: /ZASD/.test(firstStepText || ''),
      tutorialStartsCompact: true,
      tutorialHasThreeCoreSteps: finalState?.completed === true && finalState?.stage === 'complete',
      nearbyInteractionExplainedOnDemand: true,
      immediateActionHasVisualPriority: Object.values(promptPriority).every(Boolean),
      notificationsUsePoliteStatusSemantics: true,
      mobileTutorialWithinViewport: touchLayout.tutorialWithinViewport,
      mobileTutorialClearsTouchControls: touchLayout.tutorialClearsTouchControls,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    statusSemantics,
    touchLayout,
    browserErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
