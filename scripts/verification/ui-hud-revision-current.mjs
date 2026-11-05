import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const base = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192';
const output = path.resolve(
  process.env.WE3D_UI_OUTPUT || `output/verification/trail-hud-20261104/browser-${Date.now()}`
);
const touch = process.env.WE3D_HUD_TOUCH === '1';
const selected = new Set((process.env.WE3D_HUD_VIEWS || '').split(',').filter(Boolean));
const sections = new Set((process.env.WE3D_HUD_SCOPES || 'selector,hud').split(','));
const report = {
  scope:
    'Affected selector/gameplay presentation and normal input only. No accepted career, race, account or backend procedure replay; no pose/time writes.',
  cases: [],
};
let qa;
const views = [
  [1280, 508, '100'],
  [1440, 960, '100'],
  [390, 844, '100'],
  [844, 390, '100'],
  [390, 844, '200'],
  [844, 390, '200'],
];
try {
  qa = await createFieldworkQaSession({
    rootDir: process.cwd(),
    output,
    careerId: 'explorer',
    maximumDurationMs: 8 * 60 * 1000,
    pageOptions: touch ? { isMobile: true, hasTouch: true } : {},
  });
  const { page } = qa;
  await page.goto(base + '/app/?diagnostics=1');
  await page.locator('#globeSelectorStartBtn').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const settle = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = async (name) => page.screenshot({ path: path.join(output, name + '.png') });
  if (sections.has('selector'))
    for (const [width, height, scale] of views) {
      if (selected.size && !selected.has(`${width}-${scale}`)) continue;
      report.active = { section: 'selector', width, height, scale };
      await page.setViewportSize({ width, height });
      await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
      await settle();
      const shape = await page.locator('#globeSelectorCanvas').evaluate((c) => {
        const s = c.parentElement.getBoundingClientRect(),
          r = c.getBoundingClientRect();
        return {
          frame: { x: s.x, y: s.y, width: s.width, height: s.height },
          canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
          buffer: { width: c.width, height: c.height },
        };
      });
      assert.ok(Math.abs(shape.canvas.y - shape.frame.y) <= 2, 'canvas begins inside its frame');
      assert.ok(
        shape.canvas.height <= shape.frame.height + 1,
        'canvas is not taller than clipped frame'
      );
      assert.ok(
        Math.abs(
          shape.buffer.width / shape.buffer.height - shape.canvas.width / shape.canvas.height
        ) < 0.03,
        'projection matches visible frame'
      );
      const icons = await page
        .locator('.globe-destination-bar .destination-thumb')
        .evaluateAll((es) =>
          es.map((e) => {
            const r = e.getBoundingClientRect(),
              s = getComputedStyle(e);
            return {
              width: r.width,
              height: r.height,
              center: r.y + r.height / 2,
              radius: s.borderRadius,
              image: s.backgroundImage,
            };
          })
        );
      assert.equal(icons.length, 5);
      assert.ok(
        Math.max(...icons.map((x) => x.center)) - Math.min(...icons.map((x) => x.center)) < 4,
        'five round images align'
      );
      for (const icon of icons) {
        assert.ok(Math.abs(icon.width - icon.height) < 0.1);
        assert.equal(icon.radius, '50%');
      }
      assert.match(icons[4].image, /ocean-gameplay-20261104/);
      await shot(`selector-${width}-${scale}`);
      report.cases.push({ ...report.active, shape, icons, ok: true });
    }
  if (sections.has('hud')) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
    await page.locator('#globeSelectorStartBtn').click();
    await page.evaluate(async () => {
      globalThis.hudQA = (await import('/app/js/shared-context.js?v=55')).ctx;
    });
    await page.waitForFunction(
      () => hudQA.gameStarted && !hudQA.worldLoading && !hudQA.titleLaunchPending,
      null,
      { timeout: 240000 }
    );
    await page.locator('#hud.show').waitFor();
    report.poiSummary = await page.evaluate(() => ({
      pois: hudQA.pois?.length,
      buildings: hudQA.buildings?.length,
      lifecycle: hudQA.poiLifecycle?.metrics || hudQA.poiLifecycleSnapshot?.metrics || null,
      examples: hudQA.pois
        ?.slice(0, 6)
        .map((p) => ({ name: p.name, type: p.type, sourceFeatureId: p.sourceFeatureId })),
    }));
    for (const [width, height, scale] of views) {
      if (selected.size && !selected.has(`${width}-${scale}`)) continue;
      report.active = { section: 'hud', width, height, scale };
      await page.setViewportSize({ width, height });
      await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
      await settle();
      const geometry = await page.evaluate(() => {
        const box = (e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
            visible:
              getComputedStyle(e).display !== 'none' &&
              getComputedStyle(e).visibility !== 'hidden' &&
              r.width > 0,
          };
        };
        return {
          hud: box(document.getElementById('hudBox')),
          map: box(document.getElementById('minimap')),
          menu: box(document.getElementById('explorerGameMenuBtn')),
          layout: document.getElementById('hudMap').dataset.hudMapLayout,
          oldMenu: box(document.getElementById('mainMenuBtn')),
        };
      });
      assert.ok(geometry.map.visible, 'a real minimap remains visible');
      assert.equal(geometry.layout, 'full');
      assert.ok(geometry.hud.height < height * 0.36, 'status does not dominate the world');
      assert.equal(geometry.oldMenu.visible, false);
      assert.ok(geometry.menu.visible);
      const footer = await page.locator('#coords').boundingBox();
      assert.ok(footer?.width > 0 && footer.height > 0, 'map attribution remains visible');
      assert.ok(
        footer.x + footer.width <= geometry.map.right + 1 &&
          footer.y + footer.height <= geometry.map.bottom + 1,
        'attribution fits inside the minimap'
      );
      await shot(`play-${width}-${scale}`);
      await page.locator('#explorerGameMenuBtn').click();
      await page.locator('#explorerGameMenu').waitFor({ state: 'visible' });
      assert.equal(
        await page.evaluate(() => hudQA.screenLayout.snapshot().panelLayer),
        'game-menu'
      );
      assert.equal(await page.evaluate(() => hudQA.hasPauseReason('game_menu')), true);
      const before = await page.evaluate(() => hudQA.getCurrentTravelMode?.());
      await page.keyboard.press('f');
      assert.equal(
        await page.evaluate(() => hudQA.getCurrentTravelMode?.()),
        before,
        'menu isolates gameplay keys'
      );
      await shot(`menu-${width}-${scale}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#explorerGameMenu').isVisible(), false);
      assert.equal(await page.evaluate(() => hudQA.hasPauseReason('game_menu')), false);
      report.cases.push({ ...report.active, geometry, ok: true });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
    await settle();
    for (const [target, selector] of [
      ['travelBtn', '#travelChoices'],
      ['backpackBtn', '#backpackChoices'],
      ['fActivities', '#experienceBrowser'],
      ['fExplorerJournal', '#discoveryPanel'],
      ['controlsBarBtn', '#controlsTab'],
    ]) {
      await page.locator('#explorerGameMenuBtn').click();
      await page.locator(`#explorerGameMenu [data-explorer-target="${target}"]`).click();
      await page.locator(selector).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#explorerGameMenu').isVisible(), false);
      await shot('action-' + target);
      await page.keyboard.press('Escape');
    }
    await page.locator('#explorerGameMenuBtn').click();
    await page.locator('#explorerGameMenu .explorer-menu-world summary').click();
    assert.equal(await page.locator('#explorerGameMenu #weatherPanel').isVisible(), true);
    const weatherBefore = await page.evaluate(() => hudQA.weatherMode || 'live');
    await page.locator('#explorerGameMenu [data-explorer-target="quickWeatherMode"]').click();
    assert.notEqual(await page.evaluate(() => hudQA.weatherMode || 'live'), weatherBefore);
    await page.locator('#explorerGameMenuBtn').click();
    if (!(await page.locator('#explorerGameMenu .explorer-menu-world').getAttribute('open')))
      await page.locator('#explorerGameMenu .explorer-menu-world summary').click();
    await page.locator('#explorerGameMenu [data-explorer-target="quickTimeOfDay"]').click();
    assert.equal(await page.evaluate(() => hudQA.hasPauseReason('game_menu')), false);
    report.cases.push({ section: 'menu-actions', ok: true });
  }
  assert.deepEqual(qa.report.errors, []);
  delete report.active;
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
  JSON.stringify({ ok: report.ok, output, cases: report.cases.length, failure: report.failure })
);
if (!report.ok) process.exitCode = 1;
