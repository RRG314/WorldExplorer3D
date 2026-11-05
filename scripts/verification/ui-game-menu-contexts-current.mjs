import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(
  process.env.WE3D_UI_OUTPUT || `output/verification/trail-hud-20261104/modes-${Date.now()}`
);
const selected = (process.env.WE3D_MENU_CONTEXTS || 'space,moon,mars,ocean').split(',');
const detailsOnly = process.env.WE3D_MENU_DETAILS_ONLY === '1';
const report = {
  scope:
    'Changed hamburger routing and responsive presentation in actual contexts. Accepted missions, voyages and scientific procedures are not replayed.',
  checks: [],
};
let qa;
try {
  qa = await createFieldworkQaSession({
    rootDir: process.cwd(),
    output,
    careerId: 'explorer',
    maximumDurationMs: 8 * 60 * 1000,
    pageOptions: { isMobile: true, hasTouch: true },
  });
  const { page } = qa;
  const shot = async (name) => page.screenshot({ path: path.join(output, name + '.png') });
  const menu = async (target) => {
    await page.locator('#explorerGameMenuBtn').click();
    await page.locator(`#explorerGameMenu [data-explorer-target="${target}"]`).click();
    assert.equal(await page.locator('#explorerGameMenu').isVisible(), false);
  };
  for (const mode of selected) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(base + '/app/?diagnostics=1');
    await page.locator('#globeSelectorStartBtn').waitFor({ state: 'visible', timeout: 60000 });
    await page.evaluate(
      async () =>
        (window.menuCtx = (
          await import(
            (globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix ||
              document.documentElement.dataset.runtimeModulePrefix ||
              '') + '/app/js/shared-context.js?v=55'
          )
        ).ctx)
    );
    await page
      .locator(
        {
          space: '#globeSelectorSpaceBtn',
          moon: '#globeSelectorMoonBtn',
          mars: '#globeSelectorMarsBtn',
          ocean: '#coralResearchStart',
        }[mode]
      )
      .click();
    await page.waitForFunction(
      (mode) =>
        !menuCtx.titleLaunchPending &&
        !menuCtx.worldLoading &&
        !menuCtx.paused &&
        (mode === 'space'
          ? menuCtx.spaceFlight?.active
          : mode === 'ocean'
            ? menuCtx.boatDeck?.active
            : menuCtx.gameStarted && (mode === 'moon' ? menuCtx.onMoon : menuCtx.onMars)),
      mode,
      { timeout: 150000 }
    );
    await page.locator('#explorerGameMenuBtn').waitFor({ state: 'visible' });
    await shot(mode + '-play');
    if (!detailsOnly) {
      if (mode === 'space') {
        await menu('exploreBtn');
        await page.locator('#universeNavigator').waitFor({ state: 'visible' });
        await page.locator('#universeCloseBtn').click();
        await menu('hudMapOpenBtn');
        await page.locator('#universeNavigator').waitFor({ state: 'visible' });
        await page.locator('#universeCloseBtn').click();
        report.checks.push('Space hamburger Explore routes to original Wayfinder');
      } else {
        await menu('travelBtn');
        await page.locator('#travelChoices').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#travelVehicleSelect').isVisible(), false);
        if (mode !== 'ocean') {
          await page.locator('#fWalk').click();
          await page.waitForFunction(() => menuCtx.Walk?.state?.mode === 'walk');
          await menu('travelBtn');
          await page.locator('#fDriving').click();
          await page.waitForFunction(() => menuCtx.Walk?.state?.mode !== 'walk');
          report.checks.push(mode + ' hamburger Walk → original rover controller');
        } else {
          await page.keyboard.press('Escape');
          report.checks.push('Vessel retains its original contextual Travel controls');
        }
      }
      await menu('controlsBarBtn');
      await page.locator('#controlsTab').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => menuCtx.hasPauseReason('game_menu')), false);
      report.checks.push(mode + ' original Controls opens and closes without menu pause leak');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '200'));
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    );
    const controls = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '#mobileMovePad,#mobileLookPad,#mobileActionStack button,#mobileDrivePedals button'
        ),
      ]
        .filter(
          (e) =>
            !e.hidden &&
            getComputedStyle(e).display !== 'none' &&
            getComputedStyle(e).visibility !== 'hidden'
        )
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.id,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        })
        .filter((r) => r.width > 0 && r.height > 0)
    );
    for (const [index, a] of controls.entries())
      for (const b of controls.slice(index + 1))
        assert.ok(
          a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
          `${mode}: ${a.id} and ${b.id} remain separate at200%`
        );
    await shot(mode + '-phone-200');
    assert.equal(
      await page
        .locator(
          mode === 'space'
            ? '#spaceFlightHUD'
            : mode === 'moon'
              ? '#solidWorldPanel'
              : mode === 'ocean'
                ? '#researchDeckControls'
                : '#spaceFlightHUD'
        )
        .isVisible(),
      false
    );
    if (mode !== 'mars') {
      await page.locator('#explorerOpportunitiesBtn').click();
      const panel = page.locator(
        mode === 'space'
          ? '#spaceFlightHUD'
          : mode === 'moon'
            ? '#solidWorldPanel'
            : '#researchDeckControls'
      );
      await panel.waitFor({ state: 'visible' });
      await shot(mode + '-details-phone-200');
      const shape = await panel.boundingBox();
      assert.ok(shape.height <= 844 - 310 + 1, 'optional controls have a bounded scroll area');
      await page.keyboard.press('Escape');
      assert.equal(await panel.isVisible(), false);
      report.checks.push(mode + ' quiet button opens bounded original controls; Escape dismisses');
    }

    await page.locator('#explorerGameMenuBtn').click();
    await shot(mode + '-menu-phone-200');
    await page.keyboard.press('Escape');
    if (mode === 'ocean') {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
      await shot('current-ocean-gameplay');
    }
    if (!detailsOnly) {
      await menu('mainMenuBtn');
      await page.locator('#globeSelectorScreen').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => menuCtx.hasPauseReason('game_menu')), false);
      report.checks.push(mode + ' menu Return to globe');
    }
  }
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  await qa?.fail(error);
} finally {
  await qa?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify({ ok: report.ok, output, checks: report.checks, failure: report.failure })
);
if (!report.ok) process.exitCode = 1;
