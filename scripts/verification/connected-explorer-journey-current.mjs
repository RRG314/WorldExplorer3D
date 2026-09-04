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

function tutorialState() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || 'null'));
}

async function hold(code, durationMs, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.keyboard.down(code);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(code);
  for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
}

function signedAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

async function followActiveFieldBearing() {
  let previousDistance = Infinity;
  let blockedSteps = 0;
  let latest = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await page.evaluate(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        interaction: diagnostics.worldDiscovery?.interaction || null,
        yaw: Number(diagnostics.activeActor?.orientation?.yaw || 0)
      };
    });
    latest = state;
    if (['observing', 'revealed'].includes(state.interaction?.phase)) return state.interaction;
    assert.equal(state.interaction?.phase, 'seeking', `Unexpected field phase while following the bearing: ${state.interaction?.phase}`);
    const distance = Number(state.interaction.distanceMeters);
    blockedSteps = Number.isFinite(distance) && distance >= previousDistance - 0.35 ? blockedSteps + 1 : 0;
    previousDistance = distance;
    if (blockedSteps >= 3) {
      await hold(attempt % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', 620);
      await hold('ArrowUp', 900, ['Shift']);
      blockedSteps = 0;
      continue;
    }
    const desired = Number(state.interaction.bearingDegrees) * Math.PI / 180;
    const delta = signedAngle(state.yaw, desired);
    if (Math.abs(delta) > 0.09) {
      const turnKey = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
      await hold(turnKey, Math.min(420, Math.max(45, Math.abs(delta) / 2.6 * 1000)));
    }
    await hold('ArrowUp', 650, ['Shift']);
  }
  throw new Error(`The Explorer did not reach the active field site through normal movement controls: ${JSON.stringify(latest)}`);
}

async function completeFirstMovementStep() {
  const turnPattern = ['ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowRight'];
  for (const turnKey of turnPattern) {
    await hold(turnKey, 420);
    await hold('ArrowUp', 1100, ['Shift']);
    const state = await tutorialState();
    if (state?.stage === 'pack') return true;
  }
  const evidence = await page.evaluate(() => ({
    tutorial: JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || 'null'),
    actor: globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor || null
  }));
  throw new Error(`First Journey movement did not advance through normal controls: ${JSON.stringify(evidence)}`);
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false && diagnostics.worldDiscovery?.active === true;
  }, null, { timeout: 360_000 });

  await page.waitForSelector('#tutorialHintCard:not([hidden])', { timeout: 20_000 });
  assert.match(await page.locator('#tutorialHintCard').textContent(), /First Journey.*Move and look around/is);
  assert.equal(await page.locator('#tutorialHintCard').evaluate((element) => element.classList.contains('compact')), false);
  await page.screenshot({ path: `${evidenceDir}/01-first-step-desktop.png` });

  await completeFirstMovementStep();
  assert.match(await page.locator('#tutorialHintCard').textContent(), /Open your Backpack/i);
  await page.locator('#tutorialHintCard .tutorial-primary').click();
  await page.waitForSelector('#urbanEquipment.show');
  await page.locator('#urbanEquipmentCloseBtn').click();

  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || '{}').stage === 'explorer', null, { timeout: 20_000 });
  await page.waitForSelector('#tutorialHintCard:not([hidden])');
  await page.locator('#tutorialHintCard .tutorial-primary').click();
  await page.waitForSelector('#discoveryPanel.show');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || '{}').stage === 'activity', null, { timeout: 20_000 });

  await page.locator('.discoveryTodayRoute summary').click();
  await page.locator('#discoveryExpeditionList [data-field-objective]:not(:disabled)').first().click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || '{}').stage === 'record', null, { timeout: 20_000 });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.phase === 'seeking', null, { timeout: 20_000 });
  await followActiveFieldBearing();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.phase === 'revealed', null, { timeout: 30_000 });

  await page.locator('#discoveryQuickToolBtn').click();
  await page.waitForSelector('#discoveryPanel.show');
  await page.waitForFunction(() => document.getElementById('discoveryPrimaryBtn')?.textContent === 'Record');
  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || '{}').stage === 'review', null, { timeout: 30_000 });
  assert.match(await page.locator('#discoveryResultCard').textContent(), /Field result saved.*Journal.*Field Guide/is);
  await page.locator('#discoveryCloseBtn').click();

  await page.waitForSelector('#tutorialHintCard:not([hidden])');
  assert.match(await page.locator('#tutorialHintCard').textContent(), /See what changed.*Open Journal/is);
  await page.locator('#tutorialHintCard .tutorial-primary').click();
  await page.waitForSelector('.discoveryPane[data-discovery-pane="journal"].active');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v4') || '{}').completed === true, null, { timeout: 20_000 });
  assert.match(await page.locator('#discoveryJournalList').textContent(), /Inspect|Survey|Field/i);
  await page.screenshot({ path: `${evidenceDir}/02-first-record-journal-desktop.png` });

  await page.locator('#discoveryCloseBtn').click();
  await page.waitForSelector('#currentJourneyCard:not([hidden])');
  const currentJourneyCopy = await page.locator('#currentJourneyCard').textContent();
  assert.match(currentJourneyCopy, /Today's Route|Explore This Place/i);
  assert.doesNotMatch(currentJourneyCopy, /authority|schema|pipeline|procedural|generated/i);
  await page.screenshot({ path: `${evidenceDir}/03-current-journey-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBox = await page.locator('#currentJourneyCard').boundingBox();
  assert.ok(mobileBox && mobileBox.x >= 0 && mobileBox.y >= 0 && mobileBox.x + mobileBox.width <= 390);
  const overlaps = await page.evaluate(() => {
    const card = document.getElementById('currentJourneyCard')?.getBoundingClientRect();
    const controls = document.getElementById('floatMenuContainer')?.getBoundingClientRect();
    return !!card && !!controls && card.left < controls.right && card.right > controls.left && card.top < controls.bottom && card.bottom > controls.top;
  });
  assert.equal(overlaps, false, 'Current Journey must not cover the bottom controls.');
  await page.screenshot({ path: `${evidenceDir}/04-current-journey-mobile.png` });

  const state = await tutorialState();
  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'connected-first-explorer-journey-v4',
    checks: {
      movementUsedActualControls: true,
      backpackOpened: true,
      activitySelected: true,
      fieldSiteReachedWithActualControls: true,
      fieldResultRecorded: true,
      journalReviewed: true,
      firstJourneyCompleted: state?.completed === true,
      currentJourneyContinuesAfterOnboarding: /Today's Route|Explore This Place/i.test(currentJourneyCopy || ''),
      naturalPlayerLanguage: !/authority|schema|pipeline|procedural|generated/i.test(currentJourneyCopy || ''),
      mobileCardClearsControls: overlaps === false,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
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
