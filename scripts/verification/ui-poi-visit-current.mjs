import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = path.resolve(`output/verification/trail-hud-20261104/visit-${Date.now()}`),
  report = {
    scope:
      'Actual normal-input source world, native touch/menu/map and one mapped business visit. No time/pose writes; facing is controlled by the existing walk driver.',
    checks: [],
  };
let qa, cdp;
const presentationOnly = process.env.WE3D_POI_PRESENTATION === '1';
try {
  qa = await createFieldworkQaSession({
    rootDir: process.cwd(),
    output,
    careerId: 'explorer',
    maximumDurationMs: 10 * 60 * 1000,
    pageOptions: { isMobile: true, hasTouch: true },
  });
  const { page } = qa;
  const fault = new Promise((_, reject) => page.once('pageerror', reject));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await Promise.race([
    page.locator('#globeSelectorStartBtn').waitFor({ state: 'visible', timeout: 60000 }),
    fault,
  ]);
  await page.locator('#globeSelectorStartBtn').click();
  await page.screenshot({ path: path.join(output, 'loading-controls.png') });
  await page.evaluate(
    async () =>
      (globalThis.visitQA = (
        await import(
          (globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix ||
            document.documentElement.dataset.runtimeModulePrefix ||
            '') + '/app/js/shared-context.js?v=55'
        )
      ).ctx)
  );
  await Promise.race([
    page.waitForFunction(
      () => visitQA.gameStarted && !visitQA.worldLoading && !visitQA.titleLaunchPending,
      null,
      { timeout: 240000 }
    ),
    fault,
  ]);
  await page.locator('#mobileMovePad').waitFor({ state: 'visible' });
  if (!presentationOnly) {
    const before = await qa.snapshot(),
      pad = await page.locator('#mobileMovePad').boundingBox();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 - 40 }],
    });
    await page.waitForFunction(
      (p) => {
        const w = visitQA.Walk.state.walker;
        return Math.hypot(w.x - p.x, w.z - p.z) > 0.35;
      },
      before.walker,
      { timeout: 10000 }
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    report.checks.push('Native touch stick moves the actual walker and releases');
    for (const [width, height, scale] of [
      [390, 844, '100'],
      [390, 844, '200'],
      [844, 390, '200'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
      await page.waitForFunction(() => {
        const b = document.getElementById('explorerOpportunitiesBtn').getBoundingClientRect();
        return (
          b.width > 0 &&
          [
            ...document.querySelectorAll(
              '#mobileTouchControls button,#mobileMovePad,#mobileLookPad'
            ),
          ]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && getComputedStyle(e).display !== 'none';
            })
            .every((e) => {
              const r = e.getBoundingClientRect();
              return (
                b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom
              );
            })
        );
      });
      assert.equal(await page.locator('#hudMap').getAttribute('data-hud-map-layout'), 'full');
      await page.screenshot({ path: path.join(output, `mobile-${width}-${scale}.png`) });
    }
    report.checks.push('Indicator and real minimap stay clear of touch actions at100/200%');
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => (document.documentElement.dataset.we3dTextScale = '100'));
  const candidates = await page.evaluate(async () => {
    const { playablePoiTarget } = await import('/app/js/game/poi-map-visibility.js'),
      w = visitQA.Walk.state.walker;
    return visitQA.pois
      .map((p) => ({
        poi: p,
        target: playablePoiTarget(p, visitQA.poiLifecycle, visitQA.buildingEntranceByBuilding),
      }))
      .filter((p) => p.target)
      .map((p) => ({
        ...p,
        distance:
          Math.hypot(p.target.x - w.x, p.target.z - w.z) * (visitQA.METERS_PER_WORLD_UNIT || 1),
      }))
      .sort((a, b) => a.distance - b.distance);
  });
  report.playable = candidates.map((p) => ({
    name: p.poi.name,
    program: p.target.program,
    distance: p.distance,
    sourceBuildingId: p.target.sourceBuildingId,
  }));
  assert.ok(candidates.length, 'world has qualified playable POIs');
  const choice = candidates[0];
  assert.ok(choice.distance < 140, 'bounded physical visit');
  report.selected = report.playable[0];
  if (!presentationOnly) {
    await page.locator('#explorerGameMenuBtn').click();
    await page.locator('#explorerGameMenu [data-explorer-target="hudMapOpenBtn"]').click();
    await page.locator('#largeMap').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'playable-map.png') });
    await page.keyboard.press('Escape');
  }
  await page.evaluate((p) => visitQA.navigateToPOI(p.x, p.z, p.name), choice.poi); // Original navigation command; no actor movement.
  const route = await page.evaluate(async (target) => {
    const { planFieldworkWalk } = await import('/scripts/verification/fieldwork-walk-plan.mjs');
    return planFieldworkWalk(visitQA, target, {
      spacingMeters: 1,
      maximumCells: 18000,
      paddingMeters: 10,
      stepHeightMeters: 0.4,
    });
  }, choice.target);
  report.waypoints = route.length;
  for (const point of route) await qa.walkTo(point, 0.55);
  await page.keyboard.press('e');
  await page.waitForFunction(() => !!visitQA.activeInterior, null, { timeout: 30000 });
  report.interior = await page.evaluate(() => ({
    key: visitQA.activeInterior.key,
    label: visitQA.activeInterior.label,
    program: visitQA.activeInterior.businessProgram,
    fixtures: visitQA.activeInterior.businessFixturePlan?.length,
    colliders: visitQA.activeInterior.dynamicColliders?.length,
  }));
  assert.equal(report.interior.key, choice.target.sourceBuildingId);
  assert.ok(report.interior.fixtures > 0, 'actual room is furnished');
  await page.waitForFunction(
    () =>
      !visitQA.activeInterior.businessModelPlacements?.length ||
      visitQA.activeInterior.businessAssetAttachment?.status === 'ready',
    null,
    { timeout: 60000 }
  );
  assert.equal(await page.evaluate(() => visitQA.Walk.state.view), 'first');
  for (const view of ['first', 'overhead', 'third']) {
    if (view !== 'first') await page.keyboard.press('c');
    await page.waitForFunction((v) => visitQA.Walk.state.view === v, view);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    );
    const frame = await page.evaluate(() => {
      const a = visitQA.activeInterior,
        c = visitQA.camera,
        r = document.getElementById('interiorPrompt').getBoundingClientRect();
      return {
        view: visitQA.Walk.state.view,
        camera: { x: c.position.x, y: c.position.y, z: c.position.z },
        floor: a.floorPlan,
        activeLevel: a.activeLevel,
        prompt: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
    assert.ok(frame.prompt.height < 100, 'interaction hint is a small target');
    await page.screenshot({ path: path.join(output, 'actual-business-' + view + '.png') });
    report.checks.push('Actual interior ' + view + ' camera and compact touch hint');
  }
  await page.keyboard.press('c');
  for (const [width, height, scale] of [
    [390, 844, '100'],
    [844, 390, '200'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((s) => (document.documentElement.dataset.we3dTextScale = s), scale);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    );
    const shape = await page.evaluate(() => {
      const rect = (id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
          width: r.width,
        };
      };
      return {
        map: rect('hudMap'),
        canvas: rect('minimap'),
        coords: rect('coords'),
        prompt: rect('interiorPrompt'),
      };
    });
    assert.ok(shape.prompt.height < 100);
    assert.ok(
      shape.coords.right <= shape.canvas.right + 1 &&
        shape.coords.bottom <= shape.canvas.bottom + 1,
      'attribution stays within map'
    );
    await page.screenshot({
      path: path.join(output, 'actual-business-' + width + '-' + scale + '.png'),
    });
    report.checks.push({ name: 'Affected mobile interior presentation', width, scale, shape });
  }
  report.checks.push(
    'Physically followed a collision-checked route and entered an actual furnished mapped business'
  );
  await page.keyboard.press('e');
  await page.waitForFunction(() => !visitQA.activeInterior);
  report.checks.push('Original interior exit restores the world');
  await page.locator('#explorerGameMenuBtn').click();
  await page.locator('#explorerGameMenu [data-explorer-target="mainMenuBtn"]').click();
  await page.locator('#globeSelectorScreen').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => visitQA.hasPauseReason('game_menu')), false);
  report.checks.push('Menu returns to globe without a pause leak');
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.failure = e.stack;
  await qa?.fail(e);
} finally {
  await cdp
    ?.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    .catch(() => {});
  await qa?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify({
    ok: report.ok,
    output,
    checks: report.checks,
    selected: report.selected,
    failure: report.failure,
  })
);
if (!report.ok) process.exitCode = 1;
