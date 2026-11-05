import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';

const output = path.resolve(`output/verification/cinematic-app-20261105/journey-${Date.now()}`),
  url = 'http://127.0.0.1:4192/app/';
const qa = await createFieldworkQaSession({
  output,
  careerId: 'geology',
  maximumDurationMs: 420000,
});
const page = qa.page,
  report = {
    scope:
      'Actual application introduction/save/world/controls and released-career handoffs. One controlled IndexedDB write failure; no pose/time/progression injection. Accepted domain procedures are not replayed.',
    checks: [],
    admissions: [],
  };
const profile = () => page.evaluate(() => window.__cinematicStore.getProfile());
async function shot(name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
async function record(name) {
  const backup = await page.evaluate(() => window.__cinematicStore.exportData());
  await fs.writeFile(path.join(output, 'qa-fieldwork-backup.json'), JSON.stringify(backup) + '\n', {
    mode: 0o600,
  });
  const last = await page.evaluate(() => localStorage.getItem('worldExplorer3D.lastLocation.v1'));
  await fs.writeFile(
    path.join(output, 'return-place.json'),
    JSON.stringify({ key: 'worldExplorer3D.lastLocation.v1', value: last }) + '\n'
  );
  report.checks.push(name);
  await fs.writeFile(path.join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(name);
}
async function activities() {
  await page.locator('#explorerGameMenuBtn').click();
  await page.locator('#explorerGameMenu [data-explorer-target=fActivities]').click();
  await page.locator('#experienceBrowser[open]').waitFor();
}
try {
  await configureStagingAppCheck(page, url, { proxyGeospatial: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, {
    timeout: 90000,
  });
  await page.evaluate(async () => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { resolveControlState } = await import('/app/js/transport/control-state.js');
    window.__cinematicStore = createIndexedDbDiscoveryProfileStore();
    window.__cinematicReady = () => ctx.gameStarted && !ctx.worldLoading && !ctx.titleLaunchPending;
    window.__cinematicControl = () => resolveControlState(ctx);
    window.__cinematicFocus = () => ctx.renderer.domElement.focus();
  });
  const resume = process.env.WE3D_CINEMATIC_RESUME_BACKUP;
  if (resume) {
    const backup = JSON.parse(await fs.readFile(resume, 'utf8'));
    const place = JSON.parse(
      await fs.readFile(path.join(path.dirname(resume), 'return-place.json'), 'utf8')
    );
    await page.evaluate(
      async ({ backup, place }) => {
        await window.__cinematicStore.importData(backup);
        if (place.value) localStorage.setItem(place.key, place.value);
      },
      { backup, place }
    );
    await page.reload();
    await page
      .locator('#playerEntryScreen [data-entry=return]')
      .waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(
      () => document.getElementById('startBtn')?.disabled === false,
      null,
      { timeout: 90000 }
    );
    await page.locator('#playerEntryScreen [data-entry=return]').click();
    await page.evaluate(async () => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { resolveControlState } = await import('/app/js/transport/control-state.js');
      window.__cinematicStore = createIndexedDbDiscoveryProfileStore();
      window.__cinematicReady = () =>
        ctx.gameStarted && !ctx.worldLoading && !ctx.titleLaunchPending;
      window.__cinematicControl = () => resolveControlState(ctx);
      window.__cinematicFocus = () => ctx.renderer.domElement.focus();
    });
    report.reusedActualCheckpoint = path.basename(path.dirname(resume));
  } else {
    await page.locator('#playerEntryScreen [data-entry=journey]').first().click();
    await page.fill('#introName', 'River');
    await page.locator('[data-gender=woman]').click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.gender), 'woman');
    await page.locator('#playerIntroduction [data-intro=next]').click();
    await page.locator('[data-intro-career="career:geologist"]').click();
    await page.locator('#playerIntroduction [data-intro=next]').click();
    await page.locator('#playerIntroduction [data-intro=next]').click();
    await page.locator('#playerIntroduction [data-intro=choose-place]').click();
    await page.locator('#globeLocationSearch').fill('39.2904, -76.6122');
    await page.locator('#globeLocationSearch').press('Enter');
    await page.waitForFunction(
      () => Math.abs(Number(document.getElementById('globeCustomLat').value) - 39.2904) < 0.000001
    );
    await page.locator('#globeSelectorStartBtn').click();
    await page.locator('#playerIntroduction[open]').waitFor();
    const before = await profile();
    assert.equal(before.journeyPreferences, undefined);
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
        if (mode === 'readwrite') {
          IDBDatabase.prototype.transaction = original;
          throw new DOMException('Controlled storage failure', 'QuotaExceededError');
        }
        return original.call(this, stores, mode, ...rest);
      };
    });
    await page.locator('#playerIntroduction [data-intro=next]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#playerIntroduction .player-entry-status')
        .textContent.includes('Controlled storage failure')
    );
    assert.equal((await profile()).journeyPreferences, undefined);
    await shot('save-failure-keeps-explorer-choice');
    await page.locator('#playerIntroduction [data-intro=next]').click();
    report.checks.push(
      'native-keyboard-focus-and-real-IDB-save-failure-retry-no-partial-character'
    );
  }
  await page.waitForFunction(() => window.__cinematicReady(), null, { timeout: 180000 });
  const saved = await profile();
  assert.equal(saved.journeyPreferences.explorerName, 'River');
  assert.equal(saved.journeyPreferences.gender, 'woman');
  assert.equal(saved.journeyPreferences.startingCareerId, 'career:geologist');
  assert.equal(saved.characterState.creationComplete, true);
  await record('actual-introduction-saved-and-original-selected-world-ready');
  if (!resume || process.env.WE3D_CINEMATIC_CONTROLS_ONLY === '1') {
    await page.evaluate(() => window.__cinematicFocus());
    if (!resume) {
      const before = await qa.snapshot();
      assert.equal(before.paused, false);
      await page.keyboard.down('w');
      await page.waitForTimeout(650);
      await page.keyboard.up('w');
      const after = await qa.snapshot();
      assert(
        Math.hypot(after.walker.x - before.walker.x, after.walker.z - before.walker.z) > 0.15,
        'Actual walking did not move'
      );
      report.checks.push('positive-normal-walking');
    }
    for (const locomotion of ['drive', 'plane', 'drone', 'walk']) {
      await page.keyboard.press('f');
      await page.waitForFunction(
        (mode) => window.__cinematicControl().locomotion === mode,
        locomotion,
        { timeout: 15000 }
      );
      await page.waitForTimeout(200);
    }
    await shot('actual-world-and-travel-after-introduction');
    await record('native-F-cycle-drive-plane-drone-walk');
  }
  if (process.env.WE3D_CINEMATIC_SAVE_ONLY !== '1') {
    await activities();
    await page.locator('[data-experience-view=careers]').click();
    const ids = await page
      .locator('#experienceBrowser [data-release-status=ready][data-experience-id]')
      .evaluateAll((rows) => rows.map((e) => e.dataset.experienceId));
    assert.equal(ids.length, 19);
    for (const id of ids) {
      await page.locator(`#experienceBrowser [data-experience-id="${id}"]`).click();
      await page.waitForFunction(() => {
        const select = document.querySelector('#experienceBrowser [data-experience-place]');
        return !!select && select.options.length > 0 && select.value !== '';
      });
      const detail = await page.locator('.experience-detail').innerText();
      assert(!/Update required|not available/.test(detail), id + ': unavailable entry');
      report.admissions.push({
        id,
        title: await page.locator('.experience-detail h3').innerText(),
        places: await page.locator('[data-experience-place] option').count(),
        enabled: await page.locator('[data-experience-begin]').isEnabled(),
      });
    }
    await page.locator('[data-experience-group=motion]').click();
    await shot('ready-racer-and-coming-soon-pilot');
    await page.locator('[data-experience-group=all]').click();
    await page.locator('[data-experience-id="career:geologist"]').click();
    await page.locator('[data-experience-begin]').click();
    await qa.waitForCareer('campaign');
    await record('original-geology-runtime-entered-with-intro-preferences-preserved');
    const active = (await profile()).activeExperience;
    await activities();
    await page.locator('[data-experience-view=careers]').click();
    await page.locator('[data-experience-id="career:racer"]').click();
    await page.locator('[data-experience-focus]').click();
    await page.waitForFunction(() =>
      document.querySelector('.experience-status').textContent.includes('Following Racer')
    );
    const focused = await profile();
    assert.equal(focused.journeyPreferences.activeFocusId, 'career:racer');
    assert.deepEqual(focused.activeExperience, active);
    await page.locator('[data-experience-view=continue]').click();
    await page.locator('[data-experience-id="career:geologist"]').click();
    assert.match(await page.locator('[data-experience-begin]').innerText(), /Resume/);
    await page.locator('[data-experience-close]').click();
    await record('follow-career-keeps-active-geology-and-Continue-offers-original-resume');
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
  await record('failed-boundary-actual-checkpoint').catch(() => {});
  await shot('failed').catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
