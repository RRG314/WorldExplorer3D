import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/current-space-journey');
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
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.modes?.space === true
      && document.getElementById('universeToggle')
      && !document.getElementById('loading')?.classList.contains('show');
  }, null, { timeout: 180_000 });

  await page.waitForFunction(() => typeof globalThis.render_game_to_text === 'function' && typeof globalThis.document.getElementById('currentJourneyCard') !== 'undefined');
  await page.waitForTimeout(7_000);
  const runtimeState = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      gameStarted: ctx.gameStarted,
      spaceActive: ctx.spaceFlight?.active,
      tutorialUpdate: typeof ctx.tutorialUpdate,
      tutorial: ctx.getTutorialSnapshot?.() || null,
      cardHidden: document.getElementById('currentJourneyCard')?.hidden
    };
  });
  assert.equal(runtimeState.gameStarted, true, `Space journey needs an active game session: ${JSON.stringify(runtimeState)}`);
  assert.equal(runtimeState.spaceActive, true, `Space flight is not active: ${JSON.stringify(runtimeState)}`);
  assert.equal(runtimeState.tutorialUpdate, 'function', `Current Journey did not start: ${JSON.stringify(runtimeState)}`);
  assert.equal(runtimeState.cardHidden, false, `Current Journey stayed hidden in Space Flight: ${JSON.stringify(runtimeState)}`);
  await page.waitForSelector('#currentJourneyCard:not([hidden])');
  const initialCopy = await page.locator('#currentJourneyCard').textContent();
  assert.match(initialCopy, /Space Flight.*Choose a destination or fly freely.*Wayfinder/is);
  assert.doesNotMatch(initialCopy, /authority|schema|pipeline|scaffold|procedural|generated/i);
  await page.screenshot({ path: path.join(evidenceDir, '01-space-flight-journey.png') });

  await page.selectOption('#spaceDestinationSelect', 'mars');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.spaceFlight?.destinationBodyId === 'mars'
      && document.getElementById('sfDestination')?.textContent === 'Mars'
      && document.getElementById('sfAssistBtn')?.disabled === false;
  });
  const solarCourse = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId,
      phase: ctx.spaceJourney?.phase,
      assistAvailable: ctx.spaceJourneyAssistState?.available,
      craftRole: ctx.spaceFlight?.craftRole,
      pathfinderVisible: Boolean(ctx.spaceFlight?.rocket?.userData?.expeditionPodPresentation?.pod),
      destinationReadout: document.getElementById('sfDestination')?.textContent,
      courseMessage: document.getElementById('sfMessage')?.textContent || ''
    };
  });
  assert.equal(solarCourse.destinationBodyId, 'mars');
  assert.equal(solarCourse.assistAvailable, true);
  assert.equal(solarCourse.craftRole, 'wayfinder');
  assert.equal(solarCourse.pathfinderVisible, false);
  assert.match(solarCourse.courseMessage, /COURSE SET.*MARS.*FLIGHT ASSIST/i);
  const solarDirection = await page.evaluate(() => {
    const cue = document.getElementById('universeCourseCue');
    const bodyLabels = [...document.querySelectorAll('.planet-label, [data-body-id="mars"]')]
      .filter((element) => element.getBoundingClientRect().width > 0);
    return {
      offscreenCueVisible: cue?.hidden === false,
      cueCopy: cue?.textContent?.trim() || '',
      visibleBodyLabelCount: bodyLabels.length
    };
  });
  assert.equal(solarDirection.offscreenCueVisible || solarDirection.visibleBodyLabelCount > 0, true, JSON.stringify(solarDirection));
  await page.screenshot({ path: path.join(evidenceDir, '02-solar-course-set.png') });
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.spaceJourneyAssistState?.active === true;
  });

  await page.locator('#currentJourneyAction').click();
  await page.waitForSelector('#universeNavigator:not([hidden])');
  assert.match(await page.locator('#universeNavigator').textContent(), /Wayfinder.*Choose a destination.*Set Course/is);
  await page.selectOption('#universeDestinationSelect', 'proxima-centauri');
  await page.locator('#universeTravelBtn').click();
  await page.waitForFunction(() => document.getElementById('universeNavigator')?.hidden === true);
  await page.waitForFunction(() => /ACTIVE COURSE|WAYFINDER ASSIST/i.test(document.getElementById('currentJourneyEyebrow')?.textContent || ''));
  const activeCopy = await page.locator('#currentJourneyCard').textContent();
  assert.match(activeCopy, /Proxima Centauri.*course|course.*Proxima Centauri/is);
  await page.screenshot({ path: path.join(evidenceDir, '03-active-space-course.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  if (!await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
    await page.locator('#sfHudToggle').click();
  }
  await page.waitForTimeout(300);
  const mobileLayout = await page.evaluate(() => {
    const card = document.getElementById('currentJourneyCard')?.getBoundingClientRect();
    const hud = document.getElementById('spaceFlightHUD')?.getBoundingClientRect();
    const overlaps = !!card && !!hud && card.left < hud.right && card.right > hud.left && card.top < hud.bottom && card.bottom > hud.top;
    return { card: card?.toJSON(), hud: hud?.toJSON(), overlaps };
  });
  assert.ok(mobileLayout.card && mobileLayout.card.x >= 0 && mobileLayout.card.x + mobileLayout.card.width <= 390 && mobileLayout.card.y + mobileLayout.card.height <= 844);
  assert.equal(mobileLayout.overlaps, false);
  await page.screenshot({ path: path.join(evidenceDir, '04-space-journey-mobile.png') });

  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    checks: {
      currentJourneyAppearsInFreeFlight: true,
      solarCourseCreatesAssistedJourney: solarCourse.destinationBodyId === 'mars' && solarCourse.assistAvailable === true,
      solarCourseHasPersistentDirection: solarDirection.offscreenCueVisible || solarDirection.visibleBodyLabelCount > 0,
      activeCraftNotReplacedBySavedPathfinder: solarCourse.craftRole === 'wayfinder' && solarCourse.pathfinderVisible === false,
      journeyOpensWayfinder: true,
      selectedCourseChangesJourney: true,
      mobileJourneyClearsFlightHud: mobileLayout.overlaps === false,
      naturalPlayerLanguage: !/authority|schema|pipeline|scaffold|procedural|generated/i.test(`${initialCopy} ${activeCopy}`),
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
}
