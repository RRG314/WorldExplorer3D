import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const baseline = process.env.WE3D_SELECTOR_BASELINE === '1';
const touch = process.env.WE3D_SELECTOR_TOUCH === '1';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(
  `output/verification/globe-selector-layout-20261105/${baseline ? 'before' : touch ? 'touch' : 'desktop'}-${Date.now()}`
);
const qa = await createFieldworkQaSession({
    output,
    careerId: 'explorer',
    maximumDurationMs: 240000,
    pageOptions: { hasTouch: touch },
  }),
  page = qa.page;
const aux = process.env.WE3D_SELECTOR_AUX_ONLY === '1';
const launchOnly = process.env.WE3D_SELECTOR_LAUNCH_ONLY === '1';
const hosted = process.env.WE3D_SELECTOR_HOSTED_SMOKE === '1';
const views = hosted
  ? [
      [1280, 508, '100'],
      [390, 844, '100'],
    ]
  : launchOnly
    ? [
        [390, 844, '100'],
        [844, 390, '100'],
      ]
    : aux
      ? [[1440, 960, '100']]
      : baseline
        ? [[1280, 508, '100']]
        : touch
          ? [
              [390, 844, '100'],
              [844, 390, '100'],
              [390, 844, '200'],
              [844, 390, '200'],
            ]
          : [
              [1440, 960, '100'],
              [1280, 508, '100'],
            ];
const report = {
  scope:
    'Only the globe selector viewport/zoom/picking/metadata/footer and hit targets. No world launches, live search, accepted careers, saves, races or provider procedures replayed.',
  baseline,
  touch,
  cases: [],
};
const selected = () =>
  page.evaluate(async () => {
    const prefix =
      globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix ||
      document.documentElement.dataset.runtimeModulePrefix ||
      '';
    return (
      await import(prefix + '/app/js/shared-context.js?v=55')
    ).ctx.globeSelector.getSelection();
  });
try {
  for (const [width, height, scale] of views) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/app/');
    await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(
      () => document.getElementById('startBtn')?.disabled === false,
      null,
      { timeout: 90000 }
    );
    await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
    await page.locator('#playerEntryScreen [data-entry=explore]:visible').first().click();
    await page.locator('#globeSelectorCanvas').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const key = `${width}-${height}-${scale}`;
    const layout = await page.evaluate(() => {
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          right: r.right,
        };
      };
      const c = document.getElementById('globeSelectorCanvas'),
        s = c.closest('.globe-selector-stage');
      return {
        canvas: rect(c),
        frame: rect(s),
        buffer: { width: c.width, height: c.height },
        destinations: rect(document.querySelector('.globe-destination-bar')),
        attribution: rect(document.getElementById('globeSelectorBasemapAttribution')),
        scale: rect(document.getElementById('globeSelectorScaleReadout')),
        hintVisible: !!document.querySelector('.globe-selector-hint:not([hidden])'),
        buttons: [...document.querySelectorAll('.globe-destination-bar button')].map((e) => ({
          id: e.id,
          ...rect(e),
        })),
      };
    });
    if (!baseline) {
      assert(
        Math.abs(layout.canvas.height - layout.frame.height) <= 3,
        'Canvas must fill the full frame without a hidden reserved band'
      );
      assert(Math.abs(layout.canvas.y - layout.frame.y) <= 2);
      assert(
        Math.abs(
          layout.buffer.width / layout.buffer.height - layout.canvas.width / layout.canvas.height
        ) < 0.03
      );
      for (const name of ['attribution', 'scale', 'destinations'])
        assert(layout[name].y >= layout.canvas.bottom - 1, `${key}: ${name} covers globe viewport`);
      assert.equal(layout.hintVisible, false, 'No floating instruction panel over the globe');
      assert(layout.destinations.bottom <= height + 1, 'Destination buttons extend past viewport');
      for (const b of layout.buttons)
        assert(b.width >= 44 && b.height >= 44, b.id + ': touch target too small');
    }
    if (launchOnly) {
      const launch = await page.locator('#globeSelectorStartBtn').evaluate((e) => {
        const r = e.getBoundingClientRect(),
          p = e.closest('.globe-selector-side').getBoundingClientRect();
        return {
          y: r.y,
          bottom: r.bottom,
          parentY: p.y,
          parentBottom: p.bottom,
          hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
        };
      });
      assert(
        launch.y >= launch.parentY && launch.bottom <= launch.parentBottom + 1 && launch.hit,
        'Explore must be visible and unobstructed on initial compact selector'
      );
      await page.screenshot({ path: path.join(output, key + '-launch-actions.png') });
      report.cases.push({ width, height, scale, layout, launch });
      continue;
    }
    if (aux) {
      const before = await selected();
      await page.locator('#globeSelectorMapBasemapBtn').click();
      assert.equal(
        await page.locator('#globeSelectorMapBasemapBtn').getAttribute('aria-pressed'),
        'true'
      );
      assert.match(
        await page.locator('#globeSelectorBasemapAttribution').innerText(),
        /OpenStreetMap/i
      );
      assert.match(
        await page.locator('#globeSelectorBasemapAttribution').getAttribute('href'),
        /openstreetmap/
      );
      await page.screenshot({ path: path.join(output, 'native-map-credit.png') });
      await page.locator('#globeSelectorSatelliteBasemapBtn').click();
      assert.match(await page.locator('#globeSelectorBasemapAttribution').innerText(), /Esri/i);
      assert.deepEqual(
        await selected(),
        before,
        'Basemap and footer controls must not pick another place'
      );
      assert.equal(
        await page.locator('#globeSelectorCanvas').getAttribute('aria-describedby'),
        'globeSelectorGestureHint'
      );
      assert.match(
        await page.locator('#globeSelectorGestureHint').textContent(),
        /Drag.*zoom.*pick/i
      );
      report.cases.push({
        width,
        height,
        scale,
        layout,
        nativeMapSatelliteAttribution: true,
        unchangedSelection: true,
        accessibleGestureHelp: true,
      });
      continue;
    }
    if (touch && scale === '100') {
      assert(
        await page.locator('#globeSelectorStartBtn').evaluate((e) => {
          const r = e.getBoundingClientRect(),
            p = e.closest('.globe-selector-side').getBoundingClientRect();
          return (
            r.y >= p.y &&
            r.bottom <= p.bottom + 1 &&
            e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
          );
        }),
        'Compact Explore action is clipped or covered'
      );
    }
    await page.screenshot({ path: path.join(output, key + '-global.png') });
    const initial = await page.locator('#globeSelectorScaleReadout').innerText();
    for (let n = 0; n < 2; n++) {
      await page.locator('#globeSelectorZoomInBtn').click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(450);
    const zoomed = await page.locator('#globeSelectorScaleReadout').innerText();
    assert.notEqual(initial, zoomed, 'Zoom action must change the actual renderer scale');
    await page.screenshot({ path: path.join(output, key + '-zoom.png') });
    if (!baseline && scale === '100' && (width === 1440 || width === 390)) {
      const prior = await selected(),
        box = await page.locator('#globeSelectorCanvas').boundingBox();
      await page
        .locator('#globeSelectorCanvas')
        .click({ position: { x: box.width * 0.55, y: box.height * 0.55 } });
      const after = await selected();
      assert(Number.isFinite(after.lat) && Number.isFinite(after.lon));
      assert(
        Math.abs(after.lat - prior.lat) + Math.abs(after.lon - prior.lon) > 1e-6,
        'Picking must use the full revised viewport'
      );
    }
    report.cases.push({ width, height, scale, layout, initial, zoomed });
    await fs.writeFile(path.join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(key + ' accepted');
  }
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  await page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
