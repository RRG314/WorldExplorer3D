import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { deployResearchSubmarineFromDeck } from './marine-entry-ui.mjs';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(`output/verification/cinematic-app-20261105/worlds-${Date.now()}`);
const contexts = (process.env.WE3D_CINEMATIC_CONTEXTS || 'moon,mars,space,ocean').split(',');
const qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 480000,
  }),
  page = qa.page;
const report = {
  scope:
    'Actual cinematic-home world launches and original travel/Wayfinder/deck controllers. No repeated scientific methods, missions or laps; no pose/time writes.',
  checks: [],
  contexts,
};
async function shot(name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, name + '.png') });
  await fs.writeFile(path.join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(name);
}
async function menu(target) {
  await page.locator('#explorerGameMenuBtn').click();
  await page.locator(`#explorerGameMenu [data-explorer-target="${target}"]`).click();
}
try {
  if (new URL(base).hostname === '127.0.0.1' || new URL(base).hostname === 'localhost')
    await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  for (const world of contexts) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(base + '/app/');
    await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(
      () => document.querySelector('#startBtn')?.disabled === false,
      null,
      { timeout: 90000 }
    );
    await page.evaluate(async () => {
      window.__worldCtx = (await import('/app/js/shared-context.js?v=55')).ctx;
    });
    await page.locator(`#playerEntryScreen [data-entry-world=${world}]`).click();
    if (world === 'ocean') await page.locator('#coralResearchStart').click();
    await page.waitForFunction(
      (world) => {
        const c = window.__worldCtx;
        return (
          c.gameStarted &&
          !c.worldLoading &&
          !c.titleLaunchPending &&
          (world === 'moon'
            ? c.onMoon
            : world === 'mars'
              ? c.onMars
              : world === 'space'
                ? c.spaceFlight?.active
                : c.boatDeck?.active)
        );
      },
      world,
      { timeout: 150000 }
    );
    if (world === 'space')
      await page.waitForFunction(
        () => !__worldCtx.paused && __worldCtx.spaceFlight?.renderer?.info.render.frame > 2,
        null,
        { timeout: 45000 }
      );
    await shot(world + '-actual-home-entry');
    if (world === 'moon' || world === 'mars') {
      await menu('travelBtn');
      assert.equal(await page.locator('#travelVehicleSelect').isVisible(), false);
      await page.locator('#fWalk').click();
      await page.waitForFunction(
        () => __worldCtx.Walk?.state?.mode === 'walk' && !__worldCtx.droneMode
      );
      await menu('travelBtn');
      await page.locator('#fDriving').click();
      await page.waitForFunction(
        () => __worldCtx.Walk?.state?.mode !== 'walk' && !__worldCtx.droneMode
      );
      await menu('travelBtn');
      await page.locator('#fDrone').click();
      await page.waitForFunction(() => __worldCtx.droneMode);
      await menu('travelBtn');
      await page.locator('#fDriving').click();
      await page.waitForFunction(
        () => !__worldCtx.droneMode && __worldCtx.Walk?.state?.mode !== 'walk'
      );
      report.checks.push(world + ':original-rover-walk-drone-drive');
    } else if (world === 'space') {
      if (
        process.env.WE3D_CINEMATIC_SPACE_CONTROLS_ONLY !== '1' &&
        process.env.WE3D_CINEMATIC_VISUAL_ONLY !== '1'
      ) {
        await menu('exploreBtn');
        await page.locator('#universeNavigator').waitFor({ state: 'visible' });
        await shot('actual-space-wayfinder');
        await page.locator('#universeCloseBtn').click();
      }
      if (process.env.WE3D_CINEMATIC_VISUAL_ONLY !== '1') {
        await menu('controlsBarBtn');
        await page.locator('#controlsTab').waitFor({ state: 'visible' });
        await page.locator('#ctrlHeader').click();
      }
      report.checks.push('space:original-Wayfinder-and-context-controls');
    } else {
      await menu('travelBtn');
      assert.equal(await page.locator('#fDriving').isVisible(), false);
      await page.keyboard.press('Escape');
      await page.locator('#explorerOpportunitiesBtn').click();
      await deployResearchSubmarineFromDeck(page);
      await shot('actual-ocean-submarine');
      report.checks.push('ocean:original-coastal-departure-deck-and-submarine');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(world + '-phone');
    report.checks.push(world + ':cinematic-world-button-and-phone');
  }
  assert.deepEqual(qa.report.errors, []);
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  await shot('failed').catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
