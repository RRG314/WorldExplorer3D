import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';

const output = path.resolve(`output/verification/cinematic-app-20261105/entry-${Date.now()}`);
const qa = await createFieldworkQaSession({
  output,
  careerId: 'explorer',
  maximumDurationMs: 240000,
  pageOptions: { hasTouch: true },
});
const page = qa.page,
  report = {
    scope:
      'Actual application entry, native model/globe/career UI and transient unsaved choices. Separate from complete domain procedures.',
    checks: [],
    images: [],
  };
async function shot(name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  report.images.push(name + '.png');
}
async function model(id) {
  await page
    .locator(`#playerIntroduction canvas[data-asset-id="${id}"]`)
    .waitFor({ state: 'visible', timeout: 45000 });
}
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4192/app/');
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, {
    timeout: 90000,
  });
  await shot('actual-cinematic-home');
  if (process.env.WE3D_ENTRY_LAYOUT_ONLY === '1') {
    await page.locator('#playerEntryScreen [data-entry=journey]').first().click();
    await page.locator('#playerIntroduction [data-intro=next]').click();
    assert(
      (await page.locator('#playerIntroduction .chip-row').boundingBox()).height >= 44,
      'Career filters clipped'
    );
    await page.locator('#playerIntroduction .primary').hover();
    await shot('career-filters-and-primary-hover');
    await page.locator('#playerIntroduction [data-intro=exit]').click();
    report.checks.push('unclipped-career-filters-primary-hover');
  } else {
    if (process.env.WE3D_ENTRY_NAV_ONLY !== '1') {
      await page.locator('#playerEntryScreen [data-entry=journey]').first().click();
      await model('character-field-explorer-v1');
      await page.fill('#introName', 'River');
      await page.locator('[data-gender=woman]').click();
      await model('character-field-explorer-woman-v1');
      await shot('actual-explorer-choice');
      await page.locator('#playerIntroduction [data-intro=next]').click();
      const cards = page.locator('#playerIntroduction [data-intro-career]');
      assert.equal(await cards.count(), 20);
      assert.equal(await cards.last().getAttribute('data-intro-career'), 'career:expedition-pilot');
      assert.equal(await cards.last().isDisabled(), true);
      await page.locator('[data-intro-career="career:racer"]').click();
      await shot('actual-ready-careers-first');
      await page.locator('#playerIntroduction [data-intro=next]').click();
      await model('vehicle-bmw-525i-e34');
      assert.equal(await page.locator('[data-intro-car=porsche_carrera_4s]').isDisabled(), true);
      await shot('actual-owned-first-car');
      await page.locator('#playerIntroduction [data-intro=next]').click();
      await page.locator('#playerIntroduction [data-intro=choose-place]').click();
      await page.locator('#globeSelectorScreen.show').waitFor();
      assert.equal(await page.locator('#playerIntroduction').isVisible(), false);
      await page.locator('#globeLocationSearch').fill('39.2904, -76.6122');
      await page.locator('#globeLocationSearch').press('Enter');
      await page.waitForFunction(
        () => Math.abs(Number(document.getElementById('globeCustomLat').value) - 39.2904) < 0.000001
      );
      await shot('actual-uncovered-original-globe');
      assert.match(
        await page.locator('#globeSelectorStartBtn').innerText(),
        /Use this starting place/
      );
      await page.locator('#globeSelectorStartBtn').click();
      await page.locator('#playerIntroduction[open]').waitFor();
      assert.match(await page.locator('.departure-location').innerText(), /39.2904/);
      await page.locator('#playerIntroduction [data-intro=exit]').click();
      await page.locator('#playerEntryScreen').waitFor({ state: 'visible' });
      report.checks.push(
        'actual-native-models-gender-ready-order-owned-car-original-globe-roundtrip-keeps-draft'
      );
    }
    await page.locator('#playerEntryScreen [data-entry=careers]').first().click();
    await page.locator('#experienceBrowser[open]').waitFor();
    if (process.env.WE3D_ENTRY_NAV_ONLY !== '1') {
      await page.waitForFunction(
        () => document.querySelectorAll('#experienceBrowser [data-experience-id]').length === 20
      );
      const tiles = page.locator('#experienceBrowser [data-experience-id]');
      assert.equal(
        await tiles.last().getAttribute('data-experience-id'),
        'career:expedition-pilot'
      );
      assert.equal(await tiles.last().isDisabled(), true);
      await page.locator('[data-experience-view=quick]').click();
      assert.equal(await page.locator('[data-experience-id="activity:harbor-run"]').count(), 1);
    }
    await page.locator('[data-experience-close]').click();
    await page.locator('#globeSelectorBackBtn').click();
    await page.locator('#playerEntryScreen').waitFor({ state: 'visible' });
    report.checks.push(
      process.env.WE3D_ENTRY_NAV_ONLY === '1'
        ? 'Activities-close-to-original-globe-to-Home-visible-navigation'
        : 'actual-career-browser-coming-soon-gate-and-original-HarborRun-job-preserved'
    );
  }
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['landscape', 844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await shot(name + '-home');
    await page.locator('#playerEntryScreen [data-entry=journey]').first().click();
    await model('character-field-explorer-v1');
    await shot(name + '-introduction');
    assert(
      await page.locator('#playerIntroduction').evaluate((e) => e.scrollWidth <= e.clientWidth),
      'Dialog horizontal overflow'
    );
    await page.locator('#playerIntroduction [data-intro=exit]').click();
    report.checks.push(name + ':native-entry-layout');
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
