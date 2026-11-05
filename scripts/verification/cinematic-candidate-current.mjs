import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4193';
const local = ['127.0.0.1', 'localhost'].includes(new URL(base).hostname);
const candidate = process.env.WE3D_VERIFY_ROOT;
assert(candidate, 'Select the immutable artifact');
const manifest = JSON.parse(await fs.readFile(path.join(candidate, 'build-manifest.json'), 'utf8'));
assert.equal(manifest.firebaseProjectId, 'we3d-staging-20260712');
if (!local) {
  assert.match(new URL(base).hostname, /^we3d-staging-20260712--[a-z0-9-]+\.web\.app$/);
  assert(
    !process.env.WE3D_STAGING_APP_CHECK_FILE,
    'Hosted ordinary acceptance forbids debug attestation'
  );
}
const output = path.resolve(
  `output/verification/cinematic-app-20261105/${local ? 'package' : 'hosted'}-${Date.now()}`
);
const qa = await createFieldworkQaSession({
  output,
  careerId: 'explorer',
  maximumDurationMs: 480000,
  pageOptions: { hasTouch: true },
  headless: local,
});
const page = qa.page,
  report = {
    scope: local
      ? 'Exact immutable staging package with registered disposable staging automation attestation.'
      : 'Exact hosted staging build, ordinary Chrome/reCAPTCHA and real Hosting search. No debug tokens, provider mocks, accounts or player-history mutations.',
    buildId: manifest.buildId,
    base,
    checks: [],
    responses: [],
  };
page.on('response', (response) => {
  const u = new URL(response.url());
  if (u.pathname === '/api/geospatial/search' || u.pathname === '/getPlaceLookup')
    report.responses.push({ host: u.hostname, path: u.pathname, status: response.status() });
});
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
};
const menu = async (target) => {
  await page.locator('#explorerGameMenuBtn').click();
  await page.locator(`#explorerGameMenu [data-explorer-target="${target}"]`).click();
};
try {
  if (local) await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/app/');
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, {
    timeout: 90000,
  });
  assert.equal(
    await page.evaluate(() =>
      fetch('/build-manifest.json')
        .then((r) => r.json())
        .then((b) => b.buildId)
    ),
    manifest.buildId
  );
  if (!local)
    assert.equal(await page.evaluate(() => !!globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN), false);
  await page.evaluate(async () => {
    globalThis.candidateCtx = (
      await import(
        (globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix ||
          document.documentElement.dataset.runtimeModulePrefix ||
          '') + '/app/js/shared-context.js?v=55'
      )
    ).ctx;
  });
  await page.locator('#playerEntryScreen img').evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((i) => i.decode()));
  });
  await shot('cinematic-native-home');
  report.checks.push('exact-build-native-Home-and-real-gameplay-images');
  await page.locator('#playerEntryScreen [data-entry=journey]').first().click();
  await page.locator('#introName').fill('River');
  await page.locator('[data-gender=woman]').click();
  await page.locator('#playerIntroduction [data-intro=next]').click();
  await page.locator('[data-intro-group=motion]').click();
  assert.equal(
    await page.locator('[data-intro-career="career:expedition-pilot"]').isDisabled(),
    true
  );
  await shot('ready-careers-and-coming-soon');
  await page.locator('[data-intro-group=all]').click();
  await page.locator('[data-intro-career="career:geologist"]').click();
  await page.locator('#playerIntroduction [data-intro=next]').click();
  await page.locator('#playerIntroduction canvas[data-asset-id="vehicle-bmw-525i-e34"]').waitFor({ state: 'visible', timeout: 45000 });
  await shot('original-owned-bmw');
  await page.locator('#playerIntroduction [data-intro=next]').click();
  assert.equal(await page.locator('#introGuided').isChecked(), true);
  await page.locator('#playerIntroduction [data-intro=choose-place]').click();
  for (const [query, minLat, maxLat, minLon, maxLon] of [
    ['Kyoto, Japan', 33, 37, 133, 137],
    ['10 Downing Street, London', 51, 52, -1, 1],
  ]) {
    await page.locator('#globeLocationSearch').fill(query);
    await page.locator('#globeLocationSearch').press('Enter');
    await page
      .locator('#globeLocationSearchResults button')
      .first()
      .waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('#globeLocationSearchResults button').first().click();
    const p = await page.evaluate(() => candidateCtx.globeSelector.getSelection());
    assert(
      p.lat > minLat && p.lat < maxLat && p.lon > minLon && p.lon < maxLon,
      query + ': selected wrong place'
    );
    report.checks.push({ search: query, lat: p.lat, lon: p.lon });
  }
  await shot('live-address-on-original-globe');
  await page.locator('#globeLocationSearch').fill('39.2904, -76.6122');
  await page.locator('#globeLocationSearch').press('Enter');
  await page.waitForFunction(
    () => Math.abs(Number(document.getElementById('globeCustomLat').value) - 39.2904) < 0.000001
  );
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#playerIntroduction[open]').waitFor();
  await shot('native-departure');
  await page.locator('#playerIntroduction [data-intro=next]').click();
  await page.waitForFunction(
    () =>
      candidateCtx.gameStarted &&
      !candidateCtx.worldLoading &&
      !candidateCtx.titleLaunchPending &&
      !candidateCtx.paused &&
      candidateCtx.renderer?.info.render.frame > 2,
    null,
    { timeout: 240000 }
  );
  const saved = await page.evaluate(() => candidateCtx.discoveryProfileStore.getProfile());
  assert.equal(saved.journeyPreferences.explorerName, 'River');
  assert.equal(saved.journeyPreferences.gender, 'woman');
  assert.equal(saved.journeyPreferences.activeFocusId, 'career:geologist');
  const tutorial = await page.evaluate(() => candidateCtx.getTutorialSnapshot());
  assert.equal(tutorial.enabled, true);
  assert.equal(tutorial.skipped, false);
  report.guidance = tutorial;
  await shot('saved-explorer-and-native-first-steps');
  report.checks.push('saved-introduction-and-original-guided-first-session');
  await page.evaluate(() => candidateCtx.renderer.domElement.focus());
  for (const mode of ['car', 'plane', 'drone', 'walk']) {
    await page.keyboard.press('f');
    await page.waitForFunction(
      (mode) =>
        mode === 'drone'
          ? candidateCtx.droneMode
          : mode === 'plane'
            ? candidateCtx.planeMode?.active
            : mode === 'walk'
              ? !candidateCtx.droneMode &&
                !candidateCtx.planeMode?.active &&
                candidateCtx.Walk?.state.mode === 'walk'
              : !candidateCtx.droneMode &&
                !candidateCtx.planeMode?.active &&
                candidateCtx.Walk?.state.mode !== 'walk',
      mode,
      { timeout: 15000 }
    );
  }
  report.checks.push('original-F-vehicle-cycle');
  await menu('fActivities');
  await page.locator('#experienceBrowser[open]').waitFor();
  await page.locator('[data-experience-view=careers]').click();
  assert.equal(
    await page
      .locator('#experienceBrowser [data-release-status=ready][data-experience-id]')
      .count(),
    19
  );
  assert.equal(
    await page.locator('[data-experience-id="career:expedition-pilot"]').isDisabled(),
    true
  );
  await page.locator('[data-experience-close]').click();
  await menu('travelBtn');
  await page.locator('#fWalk').click();
  await menu('controlsBarBtn');
  await page.locator('#controlsTab').waitFor({ state: 'visible' });
  await page.locator('#ctrlHeader').click();
  report.checks.push('native-career-travel-and-controls-handoffs');
  for (const [w, h, scale] of [
    [390, 844, '100'],
    [844, 390, '200'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
    await shot(`gameplay-${w}-${scale}`);
    assert(
      await page.locator('#explorerGameMenuBtn').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width >= 44 &&
          r.height >= 44 &&
          e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
        );
      })
    );
    report.checks.push(`touch-gameplay-menu-${w}-${scale}`);
  }
  assert(report.responses.some((r) => r.status === 200));
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
