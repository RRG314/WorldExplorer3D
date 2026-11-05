import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from '../verification/fieldwork-qa-session.mjs';

const output = path.resolve(`output/research/career-world-20261105/introduction-${Date.now()}`);
const qa = await createFieldworkQaSession({
  output,
  careerId: 'explorer',
  maximumDurationMs: 300000,
  pageOptions: process.env.WE3D_INTRO_PHONE_ONLY === '1' ? { hasTouch: true, isMobile: true } : {},
});
let page = qa.page;
const report = {
  scope:
    'Revised review landing and introduction. Actual licensed models, normal UI, ephemeral choices. No production or player-save writes.',
  checks: [],
  images: [],
};
const url = 'http://127.0.0.1:4192/docs/career-world-integration/index.html';
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function shot(name) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': horizontal page overflow'
  );
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  report.images.push(name + '.png');
}
async function model(id) {
  await page
    .locator(`[data-intro-model] canvas[data-asset-id="${id}"]`)
    .waitFor({ state: 'visible', timeout: 45000 });
  assert(await page.locator('[data-model-credit]').innerText(), 'Missing original asset credit');
  report.checks.push('native-model:' + id);
}
async function noLeases() {
  await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16');
    window.__introLeasesReleased = () =>
      modelAssetCacheSnapshot().entries.every((e) => e.leases === 0);
  });
  await page.waitForFunction(() => window.__introLeasesReleased());
  assert.equal(await page.evaluate(() => window.__introLeasesReleased()), true);
  report.checks.push('all-original-model-leases-released');
}
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.waitForFunction(() => window.render_game_to_text);
  if (process.env.WE3D_INTRO_CONTROLS_ONLY === '1') {
    await page.locator('[data-action=start-journey]').click();
    await page.fill('#introName', 'Kite');
    await page.locator('[data-gender=woman]').click();
    await page.locator('[data-intro=next]').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'view');
    await page.locator('[data-intro-career="career:racer"]').click();
    await page.locator('[data-intro=next]').click();
    await page.locator('[data-intro-car=porsche_carrera_4s]').click();
    await page.locator('[data-intro=next]').click();
    await page.locator('#designTools > summary').click();
    await page.locator('#resetBtn').click();
    const v = await state();
    assert.equal(v.introduction.name, '');
    assert.equal(v.introduction.gender, 'man');
    assert.equal(v.introduction.vehicleId, 'bmw_e34');
    assert.equal(v.introduction.careerId, 'career:explorer');
    assert.equal(v.setupComplete, false);
    await noLeases();
    report.checks.push('step-keyboard-focus-reset-clears-only-preview-and-late-loads-release');
  } else if (process.env.WE3D_INTRO_PHONE_ONLY === '1') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-action=start-journey]').tap();
    await model('character-field-explorer-v1');
    await page.locator('[data-gender=woman]').tap();
    await model('character-field-explorer-woman-v1');
    await page.fill('#introName', 'Jordan');
    await page.locator('[data-gender=woman]').scrollIntoViewIfNeeded();
    const hit = await page.locator('[data-gender=woman]').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    assert(hit, 'Next/Back panel blocks gender controls');
    await shot('phone-character-form-unobstructed');
    await page.locator('[data-intro=next]').tap();
    await page.locator('[data-intro-group=motion]').tap();
    await page.locator('[data-intro-career="career:racer"]').tap();
    await shot('phone-career-unobstructed');
    await page.locator('[data-intro=next]').tap();
    await model('vehicle-bmw-525i-e34');
    await page.locator('[data-intro-car=bmw_m3_e46]').scrollIntoViewIfNeeded();
    const previousCarScroll = await page.locator('.intro-split').evaluate((e) => e.scrollTop);
    await page.locator('[data-intro-car=bmw_m3_e46]').tap();
    await model('road-bmw-m3-e46');
    assert(
      Math.abs(
        (await page.locator('.intro-split').evaluate((e) => e.scrollTop)) - previousCarScroll
      ) < 8,
      'Changing car jumped the mobile selection list'
    );
    await shot('phone-car-selection-unobstructed');
    await page.locator('[data-intro=next]').tap();
    await shot('phone-departure-unobstructed');
    await page.locator('[data-intro=next]').tap();
    const v = await state();
    assert.equal(v.explorerName, 'Jordan');
    assert.equal(v.gender, 'woman');
    assert.equal(v.career, 'career:racer');
    assert.equal(v.vehicleId, 'bmw_m3_e46');
    await noLeases();
    report.checks.push(
      'phone-fixed-actions-outside-scrollable-content-native-touch-choice-hit-testing'
    );
  } else if (process.env.WE3D_INTRO_VISUAL_ONLY === '1') {
    await shot('landing-desktop-corrected');
    await page.locator('[data-action=start-journey]').click();
    await page.locator('[data-gender=woman]').click();
    await model('character-field-explorer-woman-v1');
    await shot('character-desktop-corrected');
    await page.locator('[data-intro=next]').click();
    await page.locator('[data-intro=next]').click();
    await model('vehicle-bmw-525i-e34');
    assert.equal(
      await page.locator('[data-intro-model] canvas').getAttribute('data-presentation'),
      'original-primary-e34'
    );
    await shot('starter-bmw-desktop-corrected');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('starter-bmw-phone-corrected');
    await page.locator('[data-intro=back]').click();
    await page.locator('[data-intro=back]').click();
    await model('character-field-explorer-woman-v1');
    await shot('character-phone-corrected');
    await page.locator('[data-intro=exit]').click();
    await noLeases();
    await shot('landing-phone-corrected');
    report.checks.push('primary-closed-bmw-original-preparer-and-readable-dark-showroom');
  } else {
    assert.equal(
      await page.locator('#model').isVisible(),
      false,
      'Comparison options still dominate entry'
    );
    assert.equal(await page.locator('[data-landing-world]').count(), 4);
    assert.equal(await page.locator('.landing-feature').count(), 4);
    await shot('01-landing-desktop');
    report.checks.push('player-first-landing-and-world-career-create-return-entry');
    const originalStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await page.locator('[data-action=start-journey]').click();
    await model('character-field-explorer-v1');
    await page.fill('#introName', 'Avery');
    await page.locator('[data-gender=woman]').click();
    await model('character-field-explorer-woman-v1');
    await shot('02-character-desktop');
    await page.locator('[data-intro=next]').click();
    assert.equal(await page.locator('[data-intro-career]').count(), 20);
    await page.locator('[data-intro-group=motion]').click();
    await page.locator('[data-intro-career="career:racer"]').click();
    await shot('03-career-desktop');
    await page.locator('[data-intro=next]').click();
    await model('vehicle-bmw-525i-e34');
    for (const [id, asset] of [
      ['bmw_m3_e46', 'road-bmw-m3-e46'],
      ['datsun_280z', 'road-datsun-280z'],
      ['porsche_carrera_4s', 'road-porsche-911-carrera-4s'],
    ]) {
      await page.locator(`[data-intro-car="${id}"]`).click();
      await model(asset);
    }
    await page.locator('[data-intro=rotate-left]').click();
    await page.locator('[data-intro-model] canvas').focus();
    await page.keyboard.press('ArrowRight');
    await shot('04-porsche-desktop');
    await page.locator('[data-intro=next]').click();
    await page.locator('[data-intro-edit="0"]').click();
    assert.equal(await page.inputValue('#introName'), 'Avery');
    assert.equal((await state()).introduction.vehicleId, 'porsche_carrera_4s');
    await model('character-field-explorer-woman-v1');
    await page.fill('#introName', 'Avery Reid');
    await page.locator('[data-intro=next]').click();
    await page.locator('[data-intro=next]').click();
    await model('road-porsche-911-carrera-4s');
    await page.locator('[data-intro=next]').click();
    await shot('05-departure-desktop');
    assert.match(
      await page.locator('.departure-summary').innerText(),
      /Avery Reid[\s\S]*Woman[\s\S]*Racer[\s\S]*Porsche/i
    );
    await page.locator('[data-intro=next]').click();
    const finished = await state();
    assert.equal(finished.screen, 'play');
    assert.equal(finished.setupComplete, true);
    assert.equal(finished.explorerName, 'Avery Reid');
    assert.equal(finished.gender, 'woman');
    assert.equal(finished.career, 'career:racer');
    assert.equal(finished.vehicleId, 'porsche_carrera_4s');
    assert.equal(finished.vehicleLabel, 'Porsche 911 Carrera 4S');
    assert.match(await page.locator('.goal-strip').innerText(), /Garage/);
    await noLeases();
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), originalStorage);
    report.checks.push(
      'all-four-steps-back-edit-retention-and-begin-carry-choices-without-storage-write'
    );
    await page.locator('.brand').click();
    await page.locator('.landing-feature[data-career="career:geologist"]').click();
    await page.locator('[data-action=career-journey]').click();
    assert.equal((await state()).introduction.careerId, 'career:geologist');
    await page.locator('[data-intro=exit]').click();
    await noLeases();
    await page.locator('#designTools > summary').click();
    assert.equal(await page.locator('#model').isVisible(), true);
    await page.locator('#designTools > summary').click();
    report.checks.push('career-detail-start-and-collapsed-comparison-access');
    await page.close();

    const context = await qa.page
      .context()
      .browser()
      .newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page = await context.newPage();
    page.on('pageerror', (e) => qa.report.errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.render_game_to_text);
    await shot('06-landing-phone');
    const start = await page.locator('[data-action=start-journey]').boundingBox();
    await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
    await model('character-field-explorer-v1');
    await shot('07-character-phone');
    await page.locator('[data-intro=next]').tap();
    await page.locator('[data-intro-career="career:explorer"]').tap();
    await page.locator('[data-intro=next]').tap();
    await model('vehicle-bmw-525i-e34');
    await shot('08-car-phone');
    await page.locator('[data-intro=back]').tap();
    assert.equal((await state()).introduction.careerId, 'career:explorer');
    await page.locator('[data-intro=next]').tap();
    await model('vehicle-bmw-525i-e34');
    await page.locator('[data-intro=next]').tap();
    await shot('09-departure-phone');
    await page.setViewportSize({ width: 844, height: 390 });
    await shot('10-departure-landscape');
    await page.locator('[data-intro=next]').tap();
    assert.equal((await state()).focus, null, 'Free Explorer should not become a forced career');
    await noLeases();
    await context.close();
    report.checks.push('native-touch-default-free-explorer-and-included-starter');
  }
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  process.exitCode = 1;
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  report.pageErrors = qa.report.errors;
  report.consoleErrors = qa.report.providerErrors;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await qa.close();
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
