import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/verification/wayfinder-manual-handoff-current');
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const failedLocalResources = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

async function flightEvidence() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      journeyId: ctx.spaceJourney?.journeyId || null,
      phase: ctx.spaceJourney?.phase || null,
      destinationBodyId: ctx.spaceJourney?.destinationBodyId || null,
      presentationAuthority: ctx.spaceFlight?.presentationAuthority || null,
      assistActive: ctx.spaceJourneyAssistState?.active === true,
      travelGuidance: ctx.getSpaceTravelSession?.()?.guidance || null,
      position: ctx.spaceFlight?.rocket?.position?.toArray?.() || null,
      quaternion: ctx.spaceFlight?.rocket?.quaternion?.toArray?.() || null,
      cameraPosition: ctx.spaceFlight?.camera?.position?.toArray?.() || null,
      destinationLabel: document.getElementById('sfDestination')?.textContent?.trim() || '',
      bodyClasses: document.body.className
    };
  });
}

function finiteVector(vector) {
  return Array.isArray(vector) && vector.length >= 3 && vector.every(Number.isFinite);
}

try {
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorer3D.tutorialState.v4', JSON.stringify({ version: 4, started: true, completed: true, skipped: false, stage: 'done' }));
  });
  await page.goto(`${baseUrl}/app/?launch=space&wayfinder-handoff=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.environment === 'SPACE_FLIGHT' && state.worldLoading === false;
  }, null, { timeout: 180_000 });

  await page.selectOption('#spaceDestinationSelect', 'mars');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.destinationBodyId === 'mars');
  await page.locator('#sfAssistBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').spaceFlight?.assist?.active === true);
  await page.waitForTimeout(350);
  const assisted = await flightEvidence();
  await page.screenshot({ path: path.join(evidenceDir, '01-assisted-course.png') });

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  const manual = await flightEvidence();
  await page.screenshot({ path: path.join(evidenceDir, '02-manual-handoff.png') });

  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.keyboard.up('Space');
  await page.waitForTimeout(250);
  const thrust = await flightEvidence();
  await page.screenshot({ path: path.join(evidenceDir, '03-manual-thrust.png') });

  const report = { assisted, manual, thrust, pageErrors, failedLocalResources };
  await writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  assert.ok(assisted.journeyId, JSON.stringify(report));
  assert.equal(assisted.destinationBodyId, 'mars', JSON.stringify(report));
  assert.equal(assisted.assistActive, true, JSON.stringify(report));
  assert.equal(manual.journeyId, assisted.journeyId, 'Manual steering deleted or replaced the active Wayfinder journey.');
  assert.equal(manual.destinationBodyId, 'mars', 'Manual steering lost the selected destination.');
  assert.equal(manual.presentationAuthority, 'si', 'Manual steering switched coordinate-system authority.');
  assert.equal(manual.assistActive, false, 'Manual steering did not release flight assist.');
  assert.equal(manual.travelGuidance, 'manual', 'Manual steering did not publish manual guidance.');
  assert.equal(thrust.journeyId, assisted.journeyId, 'Thrust after manual handoff replaced the active journey.');
  assert.equal(thrust.destinationBodyId, 'mars', 'Thrust after manual handoff lost the selected destination.');
  assert.equal(thrust.presentationAuthority, 'si', 'Thrust after manual handoff changed coordinate-system authority.');
  assert.ok(finiteVector(manual.position) && finiteVector(manual.cameraPosition), JSON.stringify(report));
  assert.ok(finiteVector(thrust.position) && finiteVector(thrust.cameraPosition), JSON.stringify(report));
  assert.notDeepEqual(manual.quaternion, assisted.quaternion, 'Arrow input did not steer the spacecraft.');
  assert.notDeepEqual(thrust.position, manual.position, 'Space did not produce manual thrust after releasing assist.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedLocalResources, []);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
