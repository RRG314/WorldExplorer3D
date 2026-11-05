import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from '../verification/fieldwork-qa-session.mjs';

const output = path.resolve(`output/research/career-world-20261105/globe-${Date.now()}`);
const qa = await createFieldworkQaSession({
  output,
  careerId: 'explorer',
  maximumDurationMs: 180000,
  pageOptions: { hasTouch: true },
});
const page = qa.page;
const report = {
  scope:
    'Design preview: original interactive globe, location carry and affected layouts. Provider fixture is separate from live local availability. No live saves or world procedures.',
  checks: [],
  images: [],
};
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function shot(name) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + ': page overflow'
  );
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  report.images.push(name + '.png');
}
async function search(query) {
  await page.fill('#destinationQuery', query);
  await page.locator('.destination-search button').click();
  await page.waitForFunction(
    () => !document.querySelector('.destination-status').textContent.includes('Finding')
  );
}
async function openGlobe() {
  await page.locator('.landing-navigation [data-screen=worlds]').click();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).globe.render?.triangles > 0
  );
}
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4192/docs/career-world-integration/index.html');
  await page.waitForFunction(() => window.render_game_to_text);
  if (process.env.WE3D_GLOBE_BACK_ONLY === '1') {
    await openGlobe();
    await page.locator('.landing-navigation [data-screen=worlds]').click();
    await page.locator('[data-place-cancel]').click();
    assert.equal((await state()).screen, 'start');
    assert.equal((await state()).globe.render, null);
    await page.locator('[data-action=start-journey]').click();
    for (let i = 0; i < 4; i++) await page.locator('[data-intro=next]').click();
    assert.equal((await state()).screen, 'play');
    assert(!/NaN|undefined/.test(await page.locator('#view').innerText()));
    await page.locator('.landing-navigation [data-screen=worlds]').click();
    await page.locator('[data-place-cancel]').click();
    assert.equal((await state()).screen, 'play');
    report.checks.push(
      'repeat-Explore-preserves-Back-target-default-departure-has-no-invalid-coordinate-text'
    );
    await shot('default-departure-after-globe-back');
  } else {
    assert.equal((await state()).model, 'A');
    await openGlobe();
    await page.waitForTimeout(1800);
    if (process.env.WE3D_GLOBE_FINISH_ONLY !== '1') await shot('desktop-uncovered-native-globe');
    const canvas = page.locator('.destination-globe-stage canvas'),
      box = await canvas.boundingBox();
    if (
      process.env.WE3D_GLOBE_PRESENTATION_ONLY !== '1' &&
      process.env.WE3D_GLOBE_FINISH_ONLY !== '1'
    ) {
      const before = (await state()).globe;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 25, {
        steps: 10,
      });
      await page.mouse.up();
      assert.notDeepEqual((await state()).globe.rotation, before.rotation);
      await page.mouse.click(box.x + box.width / 2 + 15, box.y + box.height / 2 + 12);
      assert.notEqual((await state()).globe.selection.lat, before.selection.lat);
      report.checks.push('native-drag-and-arbitrary-raycast-pick');
      await page.locator('[data-zoom=in]').click();
      await page.waitForFunction(
        (distance) =>
          JSON.parse(window.render_game_to_text()).globe.zoom.cameraDistance < distance - 0.1,
        before.zoom.cameraDistance
      );
      await page.locator('[data-zoom=out]').click();
      await page.locator('[data-overview]').click();
      assert.equal((await state()).globe.zoom.cameraDistance, 3.2);
      await page.locator('[data-map=map]').click();
      assert.equal(await page.locator('[data-map=map]').getAttribute('aria-pressed'), 'true');
      await page.locator('[data-map=satellite]').click();
      assert.equal(await page.locator('[data-map=satellite]').getAttribute('aria-pressed'), 'true');
      report.checks.push('native-zoom-basemaps-overview');
      for (const point of ['-33.9249, 18.4241', '0, 0', '12.5, -179.9']) {
        await search(point);
        const expected = point.split(',').map(Number),
          got = (await state()).globe.selection;
        assert.equal(got.lat, expected[0]);
        assert.equal(got.lon, expected[1]);
      }
      const valid = (await state()).globe.selection;
      await search('91, 181');
      assert.match(await page.locator('.destination-status').innerText(), /Latitude must/);
      assert.deepEqual((await state()).globe.selection, valid);
      report.checks.push('southern-equator-dateline-coordinates-and-invalid-rejection');
      await page.route('**/api/geospatial/search?**', (route) =>
        route.fulfill({
          json: [
            {
              lat: '35.6812',
              lon: '139.7671',
              name: 'Tokyo Station',
              display_name: 'Tokyo Station, Tokyo, Japan',
              category: 'railway',
              type: 'station',
            },
          ],
        })
      );
      await search('Tokyo Station controlled UI fixture');
      await page.locator('[data-place-result="0"]').click();
      assert.equal((await state()).globe.selection.name, 'Tokyo Station');
      await page.unroute('**/api/geospatial/search?**');
      report.checks.push('controlled-original-provider-result-selection');
      await search('Cape Town');
      report.localPlaceSearch = await page.locator('.destination-status').innerText();
      await page.locator('[data-use-place]').click();
      assert.equal((await state()).destination.name, 'Tokyo Station');
      assert.equal((await state()).globe.open, false);
      assert.equal((await state()).globe.render, null);
      assert.equal(await page.locator('.hero h1').innerText(), 'TOKYO STATION');
      await page.locator('.brand').click();
      await page.locator('[data-action=start-journey]').click();
      for (let i = 0; i < 3; i++) await page.locator('[data-intro=next]').click();
      assert.match(await page.locator('.departure-location').innerText(), /Tokyo Station/);
      await page.locator('[data-intro=choose-place]').click();
      await search('-33.9249, 18.4241');
      await page.locator('[data-use-place]').click();
      assert.equal((await state()).screen, 'setup');
      assert.equal((await state()).introduction.step, 3);
      await page.locator('[data-intro-edit="1"]').click();
      await page.locator('[data-intro-career="career:racer"]').click();
      await page.locator('[data-intro=next]').click();
      await page.locator('[data-intro=next]').click();
      assert.match(await page.locator('.departure-location').innerText(), /-33.9249/);
      await page.locator('[data-intro=next]').click();
      assert.equal((await state()).destination.lat, -33.9249);
      assert.equal((await state()).career, 'career:racer');
      report.checks.push(
        'arbitrary-place-survives-introduction-edit-career-switch-begin-no-Baltimore-override'
      );
      await openGlobe();
    }
    const views = [
      ['short-desktop', 1280, 508],
      ['phone', 390, 844],
      ['phone-landscape', 844, 390],
    ];
    for (const [name, width, height] of views.slice(
      process.env.WE3D_GLOBE_FINISH_ONLY === '1' ? 2 : 0
    )) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      const initial = await canvas.boundingBox();
      (report.layouts ||= []).push({ name, width, height, globe: initial });
      if (name !== 'phone-landscape')
        assert(initial.y + initial.height <= height, name + ': globe below first viewport');
      await page.locator('.destination-globe-stage').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const b = await canvas.boundingBox();
      assert(b.width >= 250 && b.height >= 168, name + ': usable globe area');
      const hit = await canvas.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e;
      });
      assert(hit, name + ': globe covered');
      if (name === 'phone') {
        const previous = (await state()).globe.selection;
        await page.touchscreen.tap(b.x + b.width / 2 + 12, b.y + b.height / 2);
        assert.notEqual((await state()).globe.selection.lon, previous.lon);
      }
      await shot(name + '-native-globe');
      report.checks.push(name + ':uncovered-visible-usable-globe');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-place-cancel]').click();
      assert.equal((await state()).globe.render, null);
      await openGlobe();
    }
    await page.locator('[data-world=ocean]').click();
    assert.equal((await state()).globe.render, null);
    await page.locator('.destination-contexts [data-world=earth]').click();
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).globe.render?.triangles > 0
    );
    report.checks.push('reopen-single-controller-close-world-switch-native-renderer-release');
    const thumbs = await page
      .locator('.destination-contexts img')
      .evaluateAll((nodes) =>
        nodes.map((e) => ({ loaded: e.complete && e.naturalWidth > 0, src: e.getAttribute('src') }))
      );
    assert.equal(thumbs.length, 5);
    assert(
      thumbs.every((e) => e.loaded),
      'Broken world image'
    );
    await page.locator('.destination-details summary').click();
    await page.fill('[name=lat]', '90');
    await page.fill('[name=lon]', '-180');
    await page.locator('.destination-coordinates button').click();
    assert.equal((await state()).globe.selection.lat, 90);
    assert.equal((await state()).globe.selection.lon, -180);
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
    await page.locator('[data-locate]').click();
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).globe.selection.name === 'My location'
    );
    assert.equal((await state()).globe.selection.lat, 51.5074);
    await page.route('**/api/geospatial/search?**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ json: [{ lat: '1', lon: '2', name: 'Late result' }] }).catch(() => {});
    });
    await page.fill('#destinationQuery', 'Delayed controlled result');
    await page.locator('.destination-search button').click();
    const pickBox = await canvas.boundingBox();
    await page.mouse.click(pickBox.x + pickBox.width / 2, pickBox.y + pickBox.height / 2);
    const picked = (await state()).globe.selection;
    await page.waitForTimeout(650);
    assert.deepEqual((await state()).globe.selection, picked);
    await page.unroute('**/api/geospatial/search?**');
    await page.locator('#designTools > summary').click();
    await page.locator('#resetBtn').click();
    assert.equal((await state()).destination, null);
    await openGlobe();
    assert.equal((await state()).globe.selection.name, 'Baltimore');
    report.checks.push(
      'five-authentic-thumbnails-manual-pole-geolocation-controlled-late-search-cancel-preview-reset'
    );
  }
  assert.deepEqual(qa.report.errors, []);
  report.providerErrors = qa.report.providerErrors;
  report.final = await state();
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  await page.screenshot({ path: path.join(output, 'failed.png'), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
