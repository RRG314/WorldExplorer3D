import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'living-editable-world');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4324, 4325, 4326] });
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--enable-precise-memory-info']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fatalErrors = [];
const providerWarnings = [];

function recoverable(message) {
  return /Failed to load resource|net::ERR_|blocked by CORS|Firestore|Overpass|WorldCover|Shortbread|Terrarium|tile|429|500|502|503|504/i.test(message);
}

page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (recoverable(message.text())) providerWarnings.push(message.text());
  else fatalErrors.push(message.text());
});

async function collectGarbage() {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.detach();
  await page.waitForTimeout(500);
}

try {
  const url = `http://127.0.0.1:${server.port}/app/?living-editable-world-browser=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('load', { timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && typeof ctx.loadRoads === 'function' && !!ctx.LOCS?.baltimore;
  }, null, { timeout: 90000 });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.selLoc = 'baltimore';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.spawnOnRoad?.();
    ctx.setTravelMode?.('walk', { source: 'living-editable-browser', force: true, emitTutorial: false });
  });

  await page.waitForFunction(() => {
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.livingWorld?.active === true;
  }, null, { timeout: 180000 });

  const before = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const population = ctx.earthSceneRoot?.getObjectByName?.('Living World Population');
    const traffic = population?.getObjectByName?.('Living World Traffic Bodies');
    const matrix = new globalThis.THREE.Matrix4();
    const position = new globalThis.THREE.Vector3();
    traffic?.getMatrixAt?.(0, matrix);
    position.setFromMatrixPosition(matrix);
    return {
      diagnostics: JSON.parse(globalThis.render_game_to_text()),
      facadeAttached: !!ctx.earthSceneRoot?.getObjectByName?.('Living World Facade Depth'),
      populationAttached: !!population,
      trafficPosition: { x: position.x, y: position.y, z: position.z },
      providerInFlight: Object.values(ctx.worldLoadRuntimeState?.session?.providers || {}).map((provider) => Number(provider.inFlight || 0)),
      renderer: {
        calls: Number(ctx.renderer?.info?.render?.calls || 0),
        triangles: Number(ctx.renderer?.info?.render?.triangles || 0),
        geometries: Number(ctx.renderer?.info?.memory?.geometries || 0),
        textures: Number(ctx.renderer?.info?.memory?.textures || 0)
      },
      heapBytes: Number(performance.memory?.usedJSHeapSize || 0)
    };
  });
  assert.equal(before.facadeAttached, true, 'facade presentation was not attached to the Earth scene owner');
  assert.equal(before.populationAttached, true, 'population presentation was not attached to the Earth scene owner');
  assert.ok(before.diagnostics.livingWorld.entrances.published > 0, 'Baltimore published no building entrances');
  assert.ok(before.diagnostics.livingWorld.pedestrianGraph.edges > 0, 'Baltimore published no pedestrian graph');
  assert.ok(before.diagnostics.livingWorld.trafficGraph.edges > 0, 'Baltimore published no traffic graph');
  assert.ok(before.diagnostics.livingWorld.population.vehicles > 0, 'Baltimore published no simulated traffic');
  assert.ok(before.providerInFlight.every((count) => count === 0), 'provider work remained in flight after publication');

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.advanceRuntimeTime?.(2200);
  });
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const traffic = ctx.earthSceneRoot?.getObjectByName?.('Living World Traffic Bodies');
    const matrix = new globalThis.THREE.Matrix4();
    const position = new globalThis.THREE.Vector3();
    traffic?.getMatrixAt?.(0, matrix);
    position.setFromMatrixPosition(matrix);
    return {
      trafficPosition: { x: position.x, y: position.y, z: position.z },
      runtime: ctx.getRuntimeKernelSnapshot?.(),
      diagnostics: JSON.parse(globalThis.render_game_to_text())
    };
  });
  assert.ok(
    Math.hypot(after.trafficPosition.x - before.trafficPosition.x, after.trafficPosition.z - before.trafficPosition.z) > 0.2,
    'simulated traffic did not move after deterministic runtime advancement'
  );
  assert.equal(after.diagnostics.editableWorld.active, true, 'editable-world runtime was not bound to Baltimore');
  assert.equal(after.diagnostics.editableWorld.scope, 'local');
  const livingWorldOverhead = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const groups = [
      ctx.earthSceneRoot?.getObjectByName?.('Living World Facade Depth'),
      ctx.earthSceneRoot?.getObjectByName?.('Living World Population')
    ].filter(Boolean);
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    groups.forEach((group) => { group.visible = false; });
    await settle();
    const base = {
      calls: Number(ctx.renderer.info.render.calls || 0),
      triangles: Number(ctx.renderer.info.render.triangles || 0)
    };
    groups.forEach((group) => { group.visible = true; });
    await settle();
    const full = {
      calls: Number(ctx.renderer.info.render.calls || 0),
      triangles: Number(ctx.renderer.info.render.triangles || 0)
    };
    const snapshot = ctx.livingWorldRuntimeSnapshot?.() || {};
    const logicalDrawCalls = Number(snapshot.facades?.drawCalls || 0) + Number(snapshot.population?.drawCalls || 0);
    return {
      base,
      full,
      addedCalls: full.calls - base.calls,
      addedTriangles: full.triangles - base.triangles,
      logicalDrawCalls,
      renderPassMultiplier: logicalDrawCalls > 0 ? (full.calls - base.calls) / logicalDrawCalls : 0
    };
  });
  assert.ok(
    livingWorldOverhead.logicalDrawCalls >= 0 && livingWorldOverhead.logicalDrawCalls <= 22,
    `Living World owns ${livingWorldOverhead.logicalDrawCalls} logical draw calls; quality population budget is 22`
  );
  assert.ok(
    livingWorldOverhead.addedCalls >= 0 && livingWorldOverhead.addedCalls <= livingWorldOverhead.logicalDrawCalls * 5,
    `Living World render-pass overhead is unbounded: ${JSON.stringify(livingWorldOverhead)}`
  );
  assert.deepEqual(fatalErrors, [], `fatal browser errors: ${fatalErrors.join('\n')}`);
  await page.screenshot({ path: path.join(outputDir, 'baltimore-living-world-desktop.png'), fullPage: false });
  await collectGarbage();
  const preEditHeap = await page.evaluate(() => Number(performance.memory?.usedJSHeapSize || 0));

  const editJourney = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.buildings.find((building) =>
      building?.sourceBuildingId &&
      !String(building.sourceBuildingId).includes('guardrail') &&
      building.collisionKind !== 'barrier' &&
      [building.minX, building.maxX, building.minZ, building.maxZ].every(Number.isFinite)
    );
    if (!target) return { error: 'no-editable-building' };
    ctx.Walk.state.mode = 'walk';
    ctx.Walk.state.walker.x = (target.minX + target.maxX) * 0.5;
    ctx.Walk.state.walker.z = (target.minZ + target.maxZ) * 0.5;
    const selected = ctx.selectNearestEditableBuilding?.(20);
    const sequence = Number(ctx._worldLoadSequence || 0);
    const result = await ctx.suppressSelectedEditableBuilding?.();
    const visual = ctx.lastEditableBuildingRefresh || null;
    return { selected, result, sequence, sequenceAfter: Number(ctx._worldLoadSequence || 0), visual };
  });
  assert.equal(editJourney.error, undefined, editJourney.error);
  assert.equal(editJourney.result?.committed, true, `building suppression failed: ${editJourney.result?.reason || 'unknown'}`);
  assert.equal(editJourney.sequenceAfter, editJourney.sequence, 'building suppression triggered a full world reload');
  const editedSourceId = editJourney.selected.sourceFeatureId;
  await page.waitForFunction(async ({ sequence, sourceFeatureId }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const source = ctx.buildings.find((building) => String(building?.sourceBuildingId || '') === sourceFeatureId);
    const nearby = source ? ctx.getNearbyBuildings?.(source.centerX, source.centerZ, 20) || [] : [];
    return Number(ctx._worldLoadSequence || 0) === sequence && snapshot.worldLoading === false &&
      snapshot.editableWorld?.suppressions === 1 &&
      ctx.isLocalBuildingSuppressed?.(sourceFeatureId) === true &&
      !nearby.some((building) => String(building?.sourceBuildingId || '') === sourceFeatureId);
  }, { sequence: editJourney.sequence, sourceFeatureId: editedSourceId }, { timeout: 180000 });
  await collectGarbage();
  const postEditHeap = await page.evaluate(() => Number(performance.memory?.usedJSHeapSize || 0));
  assert.ok(
    postEditHeap <= preEditHeap * 1.15,
    `targeted building suppression exceeded the 15% heap envelope: ${JSON.stringify({ preEditHeap, postEditHeap })}`
  );

  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && typeof ctx.loadRoads === 'function' && !!ctx.LOCS?.baltimore;
  }, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const deadline = performance.now() + 180000;
    while (ctx.worldLoading && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const resumedBaltimore = ctx.initialEarthWorldReady === true &&
      Math.abs(Number(ctx.LOC?.lat) - 39.2904) < 0.001 &&
      Math.abs(Number(ctx.LOC?.lon) + 76.6122) < 0.001;
    if (!resumedBaltimore) {
      ctx.selLoc = 'baltimore';
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv?.(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      await ctx.loadRoads();
    }
  });
  await page.waitForFunction(async (sourceFeatureId) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.editableWorld?.suppressions === 1 &&
      ctx.isLocalBuildingSuppressed?.(sourceFeatureId) === true;
  }, editedSourceId, { timeout: 180000 });
  const restoreJourney = await page.evaluate(async (sourceFeatureId) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const sequence = Number(ctx._worldLoadSequence || 0);
    const result = await ctx.restoreEditableBuildingById?.(sourceFeatureId);
    return { sequence, result };
  }, editedSourceId);
  assert.equal(restoreJourney.result?.committed, true, `building restore failed: ${restoreJourney.result?.reason || 'unknown'}`);
  await page.waitForFunction(async ({ sequence, sourceFeatureId }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const source = ctx.buildings.find((building) => String(building?.sourceBuildingId || '') === sourceFeatureId);
    const nearby = source ? ctx.getNearbyBuildings?.(source.centerX, source.centerZ, 20) || [] : [];
    return Number(ctx._worldLoadSequence || 0) === sequence && snapshot.worldLoading === false &&
      snapshot.editableWorld?.suppressions === 0 &&
      ctx.isLocalBuildingSuppressed?.(sourceFeatureId) === false &&
      nearby.some((building) => String(building?.sourceBuildingId || '') === sourceFeatureId);
  }, { sequence: restoreJourney.sequence, sourceFeatureId: editedSourceId }, { timeout: 180000 });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.openBlockBuilder?.();
  });
  await page.locator('#blockBuilderPanel.show').waitFor({ state: 'visible', timeout: 30000 });
  const mobilePanel = await page.locator('#blockBuilderPanel').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    viewportHeight: innerHeight,
    overflowY: getComputedStyle(element).overflowY,
    truthNote: document.querySelector('.blockBuilderTruthNote')?.textContent || '',
    shapes: document.querySelectorAll('[data-block-shape]').length
  }));
  assert.ok(mobilePanel.width <= 370 && mobilePanel.height <= mobilePanel.viewportHeight - 60, 'mobile editor exceeds the viewport');
  assert.equal(mobilePanel.overflowY, 'auto');
  assert.match(mobilePanel.truthNote, /never changes OpenStreetMap/i);
  assert.equal(mobilePanel.shapes, 14);
  await page.screenshot({ path: path.join(outputDir, 'baltimore-edit-world-mobile.png'), fullPage: false });

  const report = {
    ok: true,
    browser: 'Google Chrome',
    url,
    livingWorld: after.diagnostics.livingWorld,
    editableWorld: after.diagnostics.editableWorld,
    livingWorldOverhead,
    editJourney: {
      sourceFeatureId: editedSourceId,
      persistedAcrossReload: true,
      restored: true,
      fullWorldReloads: 0,
      preEditHeap,
      postEditHeap
    },
    renderer: before.renderer,
    heapBytes: before.heapBytes,
    mobilePanel,
    providerWarnings: providerWarnings.slice(0, 20),
    fatalErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
