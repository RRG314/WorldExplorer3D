import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'building-facades');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4350, 4351, 4352] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const fatalErrors = [];
const providerWarnings = [];

function recoverable(message) {
  return /Failed to load resource|net::ERR_|blocked by CORS|Firestore|Overpass|WorldCover|Shortbread|Terrarium|tile|429|500|502|503|504/i.test(message);
}

function watchPage(page) {
  page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (recoverable(message.text())) providerWarnings.push(message.text());
    else fatalErrors.push(message.text());
  });
}

async function launchBaltimore(page, source) {
  watchPage(page);
  await page.goto(`http://127.0.0.1:${server.port}/app/?building-facades=${source}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.waitForLoadState('load', { timeout: 120000 });
  await page.evaluate(async () => {
    let ctx = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (ctx.runtimeReady === true && typeof ctx.loadRoads === 'function' && ctx.LOCS?.baltimore) break;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!ctx || typeof ctx.loadRoads !== 'function') throw new Error('Earth loader did not become ready.');
    ctx.selLoc = 'baltimore';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.setTravelMode?.('walk', { source: 'building-facade-browser', force: true, emitTutorial: false });
    ['tutorialHintCard', 'objectiveHud', 'toastContainer'].forEach((id) => {
      document.getElementById(id)?.style.setProperty('display', 'none', 'important');
    });
  });
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.livingWorld?.active === true && snapshot.worldCounts?.buildings > 0;
  }, null, { timeout: 180000 });
}

async function inspectFacade(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const facade = ctx.earthSceneRoot?.getObjectByName?.('Living World Facade Depth');
    const entrances = Array.isArray(ctx.livingWorldRuntime?.facades?.plan?.doors)
      ? ctx.livingWorldRuntime.facades.plan.doors.map((item) => item.entrance)
      : [];
    const meshNames = facade?.children?.map((child) => child.name) || [];
    return {
      meshNames,
      diagnostics: ctx.livingWorldRuntime?.facades?.diagnostics ||
        JSON.parse(globalThis.render_game_to_text?.() || '{}').livingWorld?.facades || null,
      entranceCount: entrances.length,
      archetypes: [...new Set(entrances.map((entry) => entry.archetype))]
    };
  });
}

async function poseAtEntrance(page, requestedArchetype, screenshotName) {
  const result = await page.evaluate(async (archetype) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const renderedIds = new Set((ctx.livingWorldRuntime?.facades?.plan?.doors || []).map((item) => item.entrance.id));
    const supports = ctx.listEnterableBuildingSupportsNear?.(0, 0, 600, 220, { allowSynthetic: true }) || [];
    const supportedEntrances = supports
      .map((support) => ({ support, entrance: support.exteriorEntrance }))
      .filter((item) => item.entrance && renderedIds.has(item.entrance.id));
    const preferred = supportedEntrances.filter((item) => item.entrance.archetype === archetype);
    const selected = (preferred.length ? preferred : supportedEntrances)
      .slice()
      .sort((a, b) => Math.hypot(a.entrance.x, a.entrance.z) - Math.hypot(b.entrance.x, b.entrance.z))[0];
    const entrance = selected?.entrance;
    if (!entrance) throw new Error('No published entrance was available.');
    const walker = ctx.Walk.state.walker;
    const eyeHeight = ctx.Walk.CFG.eyeHeight || 1.7;
    const yaw = Math.atan2(entrance.x - entrance.approachX, entrance.z - entrance.approachZ);
    Object.assign(walker, {
      x: entrance.approachX,
      z: entrance.approachZ,
      y: entrance.y + eyeHeight,
      vy: 0,
      angle: yaw,
      yaw,
      lookYawOffset: 0,
      pitch: 0
    });
    ctx.car.x = walker.x;
    ctx.car.z = walker.z;
    ctx.paused = false;
    ctx.updateInteriorInteraction?.();
    await new Promise((resolve) => setTimeout(resolve, 180));
    ctx.updateInteriorInteraction?.();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const support = selected.support;
    const cameraDistance = 5.4;
    ctx.camera.position.set(
      entrance.x + entrance.normalX * cameraDistance + entrance.tangentX * 0.45,
      entrance.y + 2.25,
      entrance.z + entrance.normalZ * cameraDistance + entrance.tangentZ * 0.45
    );
    ctx.camera.lookAt(entrance.x, entrance.y + 1.3, entrance.z);
    ctx.camera.updateMatrixWorld(true);
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = true;
    ctx.renderer.render(ctx.scene, ctx.camera);
    return {
      id: entrance.id,
      buildingSourceId: entrance.buildingSourceId,
      archetype: entrance.archetype,
      doorStyle: entrance.doorStyle,
      prompt: document.getElementById('interiorPrompt')?.textContent || '',
      walkMode: ctx.Walk?.state?.mode || '',
      paused: ctx.paused,
      entranceMapSize: Number(ctx.livingWorldEntranceByBuilding?.size || 0),
      interiorApiLoaded: !String(ctx.updateInteriorInteraction || '').includes('_interiorsModulePromise'),
      groundY: Number(ctx.GroundHeight?.walkSurfaceY?.(entrance.approachX, entrance.approachZ)),
      supportKey: support?.key || '',
      entrance: {
        x: entrance.x,
        y: entrance.y,
        z: entrance.z,
        approachX: entrance.approachX,
        approachZ: entrance.approachZ,
        normalX: entrance.normalX,
        normalZ: entrance.normalZ
      }
    };
  }, requestedArchetype);
  assert.match(result.prompt, /Enter/i, `${requestedArchetype} entrance did not publish a door prompt: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.groundY - result.entrance.y) <= 0.5,
    `${requestedArchetype} door did not meet the walk surface: ${JSON.stringify(result)}`);
  await page.screenshot({ path: path.join(outputDir, screenshotName) });
  return result;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await launchBaltimore(desktop, 'desktop');
  const facade = await inspectFacade(desktop);
  const expectedMeshes = [
    'Living World Entrance Structure',
    'Living World Architectural Glass',
    'Living World Door Hardware'
  ];
  expectedMeshes.forEach((name) => assert.ok(facade.meshNames.includes(name), `missing facade layer: ${name}`));
  assert.ok(facade.entranceCount > 0, 'Baltimore did not publish entrances');
  assert.ok(facade.archetypes.length >= 3, `expected at least three facade archetypes, saw ${facade.archetypes.join(', ')}`);
  assert.ok(Number(facade.diagnostics?.drawCalls || 0) <= 3, `facade draw-call budget exceeded: ${facade.diagnostics?.drawCalls}`);
  assert.ok(Number(facade.diagnostics?.detailInstances || 0) > facade.entranceCount * 2, 'facades did not publish layered detail');

  const requestedArchetypes = ['storefront', 'residential', 'office'];
  const captured = [];
  for (let index = 0; index < requestedArchetypes.length; index += 1) {
    captured.push(await poseAtEntrance(desktop, requestedArchetypes[index], `0${index + 1}-${requestedArchetypes[index]}-entrance.png`));
  }

  const target = captured[0];
  const wrongSide = await desktop.evaluate(async ({ buildingSourceId, supportKey }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const building = ctx.buildings.find((entry) => ctx.buildingKey?.(entry) === buildingSourceId);
    const support = ctx.resolveBuildingEntrySupport?.(building, { allowSynthetic: true });
    const center = support?.center;
    const footprint = support?.footprint || [];
    let best = null;
    for (let index = 0; index < footprint.length; index += 1) {
      const start = footprint[index];
      const end = footprint[(index + 1) % footprint.length];
      const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
      const distance = Math.hypot(midpoint.x - support.exteriorEntrance.x, midpoint.z - support.exteriorEntrance.z);
      if (!best || distance > best.distance) best = { midpoint, distance };
    }
    const dx = best.midpoint.x - center.x;
    const dz = best.midpoint.z - center.z;
    const length = Math.hypot(dx, dz) || 1;
    const x = best.midpoint.x + dx / length * 1.8;
    const z = best.midpoint.z + dz / length * 1.8;
    const candidate = ctx.pickNearbyEnterableBuildingSupport?.(x, z, {
      radius: 8.5,
      allowSynthetic: true,
      actorBaseY: Number(building.baseY || building.minY || 0),
      actorHeight: 1.65
    });
    return { candidateKey: candidate?.support?.key || '', supportKey };
  }, target);
  assert.notEqual(wrongSide.candidateKey, wrongSide.supportKey, 'the same building remained enterable from a wall without its door');

  await poseAtEntrance(desktop, target.archetype, '04-desktop-interaction-ready.png');
  await desktop.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
  });
  await desktop.keyboard.press('KeyE');
  await desktop.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interior?.active === true, null, { timeout: 10000 });
  await desktop.screenshot({ path: path.join(outputDir, '05-desktop-entered-interior.png') });
  const desktopSequence = await desktop.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return Number(ctx._worldLoadSequence || 0);
  });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await launchBaltimore(mobile, 'mobile');
  const mobileReady = await poseAtEntrance(mobile, 'storefront', '06-mobile-touch-prompt.png');
  assert.match(mobileReady.prompt, /^Tap · Enter/i, 'mobile prompt did not expose a touch action');
  await mobile.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
    ctx.updateInteriorInteraction?.();
  });
  await mobile.locator('#interiorPrompt.show').waitFor({ state: 'visible', timeout: 10000 });
  await mobile.evaluate(() => document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important'));
  await mobile.screenshot({ path: path.join(outputDir, '06-mobile-touch-prompt.png') });
  const promptBox = await mobile.locator('#interiorPrompt.show').boundingBox();
  assert.ok(promptBox && promptBox.height >= 40 && promptBox.x >= 0 && promptBox.x + promptBox.width <= 390,
    `mobile door prompt did not fit its viewport: ${JSON.stringify(promptBox)}`);
  await mobile.locator('#interiorPrompt.show').click();
  await mobile.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interior?.active === true, null, { timeout: 10000 });
  await mobile.screenshot({ path: path.join(outputDir, '07-mobile-entered-interior.png') });
  const mobileState = await mobile.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      worldSequence: Number(ctx._worldLoadSequence || 0),
      active: !!ctx.activeInterior,
      facadeDrawCalls: Number(ctx.livingWorldRuntime?.facades?.diagnostics?.drawCalls || 0)
    };
  });
  assert.equal(mobileState.active, true);
  assert.ok(mobileState.facadeDrawCalls <= 3);
  await mobileContext.close();

  assert.deepEqual(fatalErrors, [], `fatal browser errors:\n${fatalErrors.join('\n')}`);
  console.log(JSON.stringify({
    facade,
    captured: captured.map(({ archetype, doorStyle, prompt }) => ({ archetype, doorStyle, prompt })),
    desktopSequence,
    mobileState,
    providerWarnings: providerWarnings.length,
    screenshots: outputDir
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
