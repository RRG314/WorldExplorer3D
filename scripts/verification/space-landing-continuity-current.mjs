import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/space-landing-continuity');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) failedLocalResources.push({ status: response.status(), url: response.url() });
});

try {
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({ version: 4, started: true, completed: true, skipped: false, stage: 'done' }));
  });
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 180_000 });

  await page.selectOption('#spaceDestinationSelect', 'jupiter');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.destinationBodyId === 'jupiter');
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.assist?.active === true);

  const advanced = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    for (let frame = 0; frame < 2_000 && ctx.spaceJourney?.phase !== 'approach'; frame += 1) {
      ctx.updateRenderedSpaceJourney?.({ realDtS: 0.1 });
    }
    return {
      phase: ctx.spaceJourney?.phase || null,
      assist: ctx.spaceJourneyAssistState || null,
      lastCelestialContact: ctx.spaceFlight?.lastCelestialContact || null,
      lastCelestialAvoidance: ctx.spaceFlight?.lastCelestialAvoidance || null
    };
  });
  assert.equal(advanced.phase, 'approach', `Assisted Jupiter course stopped: ${JSON.stringify(advanced)}.`);
  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId,
      phase: ctx.spaceJourney?.phase,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId,
      craftRole: ctx.spaceFlight?.craftRole,
      podVisible: Boolean(ctx.spaceFlight?.rocket?.userData?.expeditionPodPresentation?.pod),
      landingButtonText: document.getElementById('sfLandBtn')?.textContent?.trim() || '',
      landingButtonDisabled: document.getElementById('sfLandBtn')?.disabled === true,
      altitudeM: ctx.spacecraftState && ctx.spaceJourneyEphemeris?.destination
        ? Math.hypot(
            ctx.spacecraftState.positionM.x - ctx.spaceJourneyEphemeris.destination.positionM.x,
            ctx.spacecraftState.positionM.y - ctx.spaceJourneyEphemeris.destination.positionM.y,
            ctx.spacecraftState.positionM.z - ctx.spaceJourneyEphemeris.destination.positionM.z
          ) - ctx.spaceJourneyEphemeris.destination.radiusM
        : null
    };
  });
  assert.match(before.landingButtonText, /ENTER JUPITER ATMOSPHERE/i, JSON.stringify(before));
  assert.equal(before.landingButtonDisabled, false, JSON.stringify(before));
  await page.screenshot({ path: path.join(evidenceDir, '01-jupiter-entry-ready.png') });
  await page.locator('#sfLandBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.phase === 'atmospheric_exploration');
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId,
      phase: ctx.spaceJourney?.phase,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId,
      craftRole: ctx.spaceFlight?.craftRole,
      podVisible: Boolean(ctx.spaceFlight?.rocket?.userData?.expeditionPodPresentation?.pod),
      shipInteriorActive: ctx.getShipInteriorSnapshot?.()?.active === true
    };
  });
  await page.screenshot({ path: path.join(evidenceDir, '02-jupiter-atmospheric-flight.png') });

  assert.equal(before.destinationBodyId, 'jupiter');
  assert.equal(before.phase, 'approach');
  assert.equal(before.podVisible, false);
  assert.equal(after.journeyId, before.journeyId, 'Planet entry replaced the active journey.');
  assert.equal(after.destinationBodyId, 'jupiter');
  assert.equal(after.phase, 'atmospheric_exploration');
  assert.equal(after.shipInteriorActive, false, 'Planet entry opened the starship interior.');
  assert.equal(after.podVisible, false, 'An unrelated saved Pathfinder replaced the current craft.');
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(failedLocalResources, []);
  console.log(JSON.stringify({
    ok: true,
    checks: {
      courseReachedJupiterApproach: true,
      planetEntryPreservedJourney: after.journeyId === before.journeyId,
      gasGiantOpenedAtmosphericFlight: after.phase === 'atmospheric_exploration',
      planetEntryDidNotOpenShipInterior: after.shipInteriorActive === false,
      activeCraftWasNotReplacedByPathfinder: after.podVisible === false,
      noBrowserErrors: true,
      noFailedLocalResources: true
    },
    before,
    after
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
