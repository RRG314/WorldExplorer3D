import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'companion-domestic-current');
const stage = process.argv.find((arg) => arg.startsWith('--stage='))?.slice('--stage='.length) || 'full';
const server = await startStaticServer({ rootDir: root, ports: [4497, 4498, 4499] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

function bindEvidence(page, label) {
  page.on('pageerror', (error) => browserErrors.push({ label, error: String(error?.stack || error) }));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ label, status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || 'failed';
    if (request.url().startsWith(baseUrl) && reason !== 'net::ERR_ABORTED') localFailures.push({ label, reason, url: request.url() });
  });
}

async function launch(page, { reset = true } = {}) {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  if (reset) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('world-explorer-discovery');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    await page.reload({ waitUntil: 'load', timeout: 120_000 });
  }
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const runtime = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return runtime.gameStarted === true && runtime.worldLoading === false &&
      !!globalThis.__WE3D_COMPANION_SUPPORT__ && !!globalThis.__WE3D_URBAN_CRASH_SUPPORT__;
  }, null, { timeout: 360_000 });
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openCompanions(page) {
  if (!await page.locator('#discoveryPanel.show').isVisible().catch(() => false)) {
    if (await page.locator('#discoveryQuickToolBtn').isVisible().catch(() => false)) await page.locator('#discoveryQuickToolBtn').click();
    else {
      await page.locator('#exploreBtn').click();
      await page.waitForSelector('#exploreMenu.open');
      await page.locator('#fWorldDiscovery').click();
    }
  }
  await page.waitForSelector('#discoveryPanel.show', { timeout: 10_000 });
  await page.locator('#discoveryProfileBtn').click();
  await page.waitForSelector('.discoveryPane[data-discovery-pane="profile"].active');
}

async function moveWalker(page, x, z) {
  await page.evaluate(async ({ x, z }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.Walk.state.walker.x = x;
    ctx.Walk.state.walker.z = z;
    if (ctx.Walk.state.characterMesh) {
      ctx.Walk.state.characterMesh.position.x = x;
      ctx.Walk.state.characterMesh.position.z = z;
    }
  }, { x, z });
}

async function clickContextAction(page, expectedLabel, holdPosition = null) {
  const result = await page.evaluate(async ({ expectedLabel, holdPosition }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (holdPosition && ctx.Walk?.state?.walker) {
      const walker = ctx.Walk.state.walker;
      walker.x = holdPosition.x;
      walker.z = holdPosition.z;
      walker.vx = 0;
      walker.vz = 0;
      if (ctx.Walk.state.characterMesh) {
        ctx.Walk.state.characterMesh.position.x = holdPosition.x;
        ctx.Walk.state.characterMesh.position.z = holdPosition.z;
      }
    }
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      const active = ctx.contextInteractionSnapshot?.().active;
      if (active?.label?.trim?.().toLowerCase() === expectedLabel.toLowerCase()) {
        return { handled: await ctx.handlePrimaryContextInteraction(), active };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      handled: false,
      active: ctx.contextInteractionSnapshot?.().active || null,
      walker: { x: ctx.Walk?.state?.walker?.x, z: ctx.Walk?.state?.walker?.z }
    };
  }, { expectedLabel, holdPosition });
  assert.equal(result.handled, true, `Context action ${expectedLabel} was not handled; state=${JSON.stringify(result)}.`);
}

async function exercise(page, label) {
  await launch(page);
  const actor = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.worldActors()
    .find((entry) => entry.companionPolicy === 'trust-sequence-required' && ['trail-hound', 'field-retriever', 'park-terrier'].includes(entry.speciesId)) || null);
  assert.ok(actor, 'No dog companion encounter was generated for the Baltimore journey.');

  await moveWalker(page, actor.home.x, actor.home.z);
  await clickContextAction(page, 'Watch', actor.home);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__.encounters().some((entry) => entry.trustState === 'Curious' && entry.step === 1));
  await moveWalker(page, actor.home.x, actor.home.z);
  await clickContextAction(page, 'Wait', actor.home);
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__.encounters().some((entry) => entry.step === 2), null, { timeout: 10_000 });
  await moveWalker(page, actor.home.x, actor.home.z);
  await clickContextAction(page, 'Greet', actor.home);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__.encounters().some((entry) => entry.trustState === 'Comfortable' && entry.step === 3));

  await page.waitForSelector('#discoveryPanel.show');
  const namingCard = page.locator('#discoveryCompanionList .discoveryItem').filter({ has: page.locator(`[data-companion-catalog="${actor.speciesId}"]`) });
  await namingCard.locator('[data-companion-name]').fill('Copper');
  await namingCard.getByRole('button', { name: 'Befriend', exact: true }).click();
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().activeName === 'Copper');

  if (stage === 'encounter' || stage === 'mobile') {
    const companion = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    await page.screenshot({ path: path.join(outputDir, `${label}-encounter-befriended.png`) });
    return { actor, companion };
  }

  for (let index = 0; index < 4; index += 1) {
    await page.evaluate((receipt) => globalThis.__WE3D_COMPANION_SUPPORT__.awardXp(receipt, 'field-activity'), `browser-field-${label}-${index}`);
  }
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot().companions[0].progression.level >= 2);
  await openCompanions(page);
  const textBeforeTraining = await page.locator('#discoveryCompanionList').innerText();
  assert.match(textBeforeTraining, /Copper/);
  assert.match(textBeforeTraining, /Level 2/);
  assert.match(textBeforeTraining, /Companion XP|XP to level/i);
  await page.screenshot({ path: path.join(outputDir, `${label}-named-level-2.png`) });

  await page.getByRole('button', { name: 'Practice Recall', exact: true }).click();
  const start = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return { x: ctx.Walk.state.walker.x, z: ctx.Walk.state.walker.z };
  });
  await moveWalker(page, start.x + 7.5, start.z);
  await clickContextAction(page, 'Call');
  await page.waitForFunction(() => {
    const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__.snapshot();
    return snapshot.exercise.active === false && snapshot.companions[0].training.learnedCommands.includes('recall');
  }, null, { timeout: 20_000 });

  const vehicleId = await page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.snapshot?.().vehicles?.find((vehicle) => !vehicle.occupied)?.id || '');
  assert.ok(vehicleId, 'No enterable vehicle was available.');
  await page.evaluate((id) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__.enterVehicle(id), vehicleId);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation?.travelState === 'aboard', null, { timeout: 15_000 });
  const aboard = await page.evaluate(() => {
    const urban = globalThis.__WE3D_URBAN_CRASH_SUPPORT__.snapshot();
    const companion = globalThis.__WE3D_COMPANION_SUPPORT__.snapshot();
    const car = urban.vehicles.find((vehicle) => vehicle.id === urban.activeVehicleId);
    return { companion, separation: Math.hypot(companion.presentation.position.x - car.x, companion.presentation.position.z - car.z) };
  });
  assert.ok(aboard.separation < 1.5, `Companion is ${aboard.separation.toFixed(2)} m from the occupied car.`);

  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().activeName === 'Copper', null, { timeout: 360_000 });
  const reloaded = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
  assert.ok(reloaded.companions[0].training.learnedCommands.includes('recall'));
  assert.ok(reloaded.companions[0].progression.totalXp >= 63);

  await openCompanions(page);
  await page.locator('[data-discovery-tab="journal"]').click();
  const journalText = await page.locator('#discoveryJournalList').innerText();
  assert.match(journalText, /Copper joined the journey/);
  assert.match(journalText, /Copper learned Recall/);
  await page.locator('[data-discovery-tab="guide"]').click();
  const guideText = await page.locator('#discoveryFieldGuideList').innerText();
  assert.match(guideText, /companion owned/i);
  await page.screenshot({ path: path.join(outputDir, `${label}-guide-after-reload.png`) });

  return { actor, aboard, reloaded, textBeforeTraining, journalText, guideText };
}

async function seedLevelTwoCompanion(page, receiptPrefix) {
  await page.evaluate(async ({ receiptPrefix }) => {
    const support = globalThis.__WE3D_COMPANION_SUPPORT__;
    await support.adopt('trail-hound', { name: 'Copper', discoveryId: `${receiptPrefix}:encounter` });
    for (let index = 0; index < 4; index += 1) {
      await support.awardXp(`${receiptPrefix}:field:${index}`, 'field-activity');
    }
  }, { receiptPrefix });
  await page.waitForFunction(() => {
    const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.();
    return snapshot?.activeName === 'Copper' && snapshot.companions[0]?.progression?.level >= 2;
  });
}

async function exerciseProgressionAndRecall(page, label) {
  await launch(page);
  await seedLevelTwoCompanion(page, `focused-${label}`);
  await openCompanions(page);
  const companionList = page.locator('#discoveryCompanionList');
  const before = await companionList.innerText();
  assert.match(before, /Copper/);
  assert.match(before, /Level 2/);
  await page.getByRole('button', { name: 'Practice Recall', exact: true }).click();
  const start = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return { x: ctx.Walk.state.walker.x, z: ctx.Walk.state.walker.z };
  });
  await moveWalker(page, start.x + 7.5, start.z);
  await clickContextAction(page, 'Call');
  await page.waitForFunction(() => {
    const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__.snapshot();
    return snapshot.exercise.active === false && snapshot.companions[0].training.learnedCommands.includes('recall');
  }, null, { timeout: 20_000 });
  const after = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
  await openCompanions(page);
  await page.screenshot({ path: path.join(outputDir, `${label}-recall-complete.png`) });
  return { before, after };
}

async function exerciseVehicleTravel(page) {
  await launch(page);
  await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.adopt('trail-hound', {
    name: 'Copper', discoveryId: 'focused-vehicle:encounter'
  }));
  const vehicleId = await page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__?.snapshot?.().vehicles?.find((vehicle) => !vehicle.occupied)?.id || '');
  assert.ok(vehicleId, 'No enterable vehicle was available.');
  await page.evaluate((id) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__.enterVehicle(id), vehicleId);
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation?.travelState === 'aboard', null, { timeout: 15_000 });
  return page.evaluate(() => {
    const urban = globalThis.__WE3D_URBAN_CRASH_SUPPORT__.snapshot();
    const companion = globalThis.__WE3D_COMPANION_SUPPORT__.snapshot();
    const car = urban.vehicles.find((vehicle) => vehicle.id === urban.activeVehicleId);
    return { companion, separation: Math.hypot(companion.presentation.position.x - car.x, companion.presentation.position.z - car.z) };
  });
}

async function exercisePersistence(page) {
  await launch(page);
  await seedLevelTwoCompanion(page, 'focused-persistence');
  const before = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().activeName === 'Copper', null, { timeout: 360_000 });
  const after = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
  await openCompanions(page);
  const text = await page.locator('#discoveryCompanionList').innerText();
  await page.locator('[data-discovery-tab="journal"]').click();
  const journalPanelExists = await page.locator('#discoveryJournalList').isVisible();
  await page.locator('[data-discovery-tab="guide"]').click();
  const guidePanelExists = await page.locator('#discoveryFieldGuideList').isVisible();
  await page.screenshot({ path: path.join(outputDir, 'desktop-persistence.png') });
  return { before, after, text, journalPanelExists, guidePanelExists };
}

await mkdir(outputDir, { recursive: true });
let report;
try {
  if (stage === 'progression') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    bindEvidence(page, 'progression');
    const result = await exerciseProgressionAndRecall(page, 'desktop');
    await context.close();
    const companion = result.after.companions[0];
    const checks = {
      reachedLevelTwo: companion.progression.level >= 2,
      explicitXpReason: companion.progression.lastAward?.reasonId === 'training-first-clear',
      recallLearned: companion.training.learnedCommands.includes('recall'),
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = {
      ok: Object.values(checks).every(Boolean),
      contract: 'companion-progression-recall-current-v2',
      checks,
      evidence: { level: companion.progression.level, totalXp: companion.progression.totalXp, learnedCommands: companion.training.learnedCommands },
      browserErrors,
      localFailures
    };
    await writeFile(path.join(outputDir, 'progression-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Companion progression/Recall stage failed.');
  } else if (stage === 'vehicle') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    bindEvidence(page, 'vehicle');
    const result = await exerciseVehicleTravel(page);
    await context.close();
    const checks = {
      boardedOccupiedCar: result.companion.presentation.travelState === 'aboard',
      presentationAnchoredToCar: result.separation < 1.5,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'companion-vehicle-current-v2', checks, evidence: { separation: Number(result.separation.toFixed(3)) }, browserErrors, localFailures };
    await writeFile(path.join(outputDir, 'vehicle-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Companion vehicle stage failed.');
  } else if (stage === 'persistence') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    bindEvidence(page, 'persistence');
    const result = await exercisePersistence(page);
    await context.close();
    const checks = {
      namePersists: result.after.activeName === 'Copper',
      xpPersists: result.after.companions[0].progression.totalXp === result.before.companions[0].progression.totalXp,
      uiProjectsSavedLevel: /Copper/.test(result.text) && /Level 2/.test(result.text),
      currentJournalPanel: result.journalPanelExists,
      currentGuidePanel: result.guidePanelExists,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'companion-persistence-current-v2', checks, evidence: { xp: result.after.companions[0].progression.totalXp }, browserErrors, localFailures };
    await writeFile(path.join(outputDir, 'persistence-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Companion persistence stage failed.');
  } else if (stage === 'mobile') {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    bindEvidence(page, 'mobile');
    const result = await exercise(page, 'mobile');
    await context.close();
    const checks = {
      worldEncounter: !!result.actor,
      trustSequenceCompleted: result.companion.activeName === 'Copper',
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'companion-mobile-encounter-current-v2', checks, evidence: { species: result.actor.speciesId }, browserErrors, localFailures };
    await writeFile(path.join(outputDir, 'mobile-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Companion mobile encounter stage failed.');
  } else {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopContext.newPage();
  bindEvidence(desktopPage, 'desktop');
  const desktop = await exercise(desktopPage, 'desktop');
  await desktopContext.close();

  if (stage === 'encounter') {
    report = {
      ok: desktop.companion.activeName === 'Copper',
      contract: 'companion-domestic-encounter-current-v2',
      checks: {
        worldEncounter: !!desktop.actor,
        trustSequenceCompleted: desktop.companion.activeName === 'Copper'
      },
      evidence: { species: desktop.actor.speciesId, activeName: desktop.companion.activeName },
      browserErrors,
      localFailures
    };
    report.ok = report.ok && browserErrors.length === 0 && localFailures.length === 0;
    await writeFile(path.join(outputDir, 'encounter-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Domestic companion encounter stage failed.');
  } else {

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobileContext.newPage();
    bindEvidence(mobilePage, 'mobile');
    const mobile = await exercise(mobilePage, 'mobile');
    await mobileContext.close();

    const checks = {
    namedAfterTrust: desktop.reloaded.activeName === 'Copper',
    receiptXpPersists: desktop.reloaded.companions[0].progression.totalXp >= 63,
    recallTrainingPersists: desktop.reloaded.companions[0].training.learnedCommands.includes('recall'),
    vehicleBoarding: desktop.aboard.companion.presentation.travelState === 'aboard' && desktop.aboard.separation < 1.5,
    journalProjection: /Copper joined the journey/.test(desktop.journalText) && /Copper learned Recall/.test(desktop.journalText),
    guideProjection: /companion owned/i.test(desktop.guideText),
    mobileJourney: mobile.reloaded.activeName === 'Copper' && mobile.reloaded.companions[0].training.learnedCommands.includes('recall'),
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
    report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'companion-domestic-current-v2',
    checks,
    evidence: {
      desktopSpecies: desktop.actor.speciesId,
      desktopXp: desktop.reloaded.companions[0].progression.totalXp,
      desktopLevel: desktop.reloaded.companions[0].progression.level,
      desktopVehicleSeparation: Number(desktop.aboard.separation.toFixed(3)),
      mobileSpecies: mobile.actor.speciesId,
      mobileXp: mobile.reloaded.companions[0].progression.totalXp
    },
    browserErrors,
    localFailures
  };
    await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.ok, true, 'Domestic companion journey failed.');
  }
  }
} finally {
  await browser.close();
  await server.close();
}
