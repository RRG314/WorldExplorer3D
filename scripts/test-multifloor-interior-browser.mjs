import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'multifloor-interior');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4342, 4343, 4344] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
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

async function launchBaltimore() {
  await page.goto(`http://127.0.0.1:${server.port}/app/?multifloor-interior=${Date.now()}`, {
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
    ctx.setTravelMode?.('walk', { source: 'multifloor-interior-browser', force: true, emitTutorial: false });
  });
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.gameStarted === true && snapshot.worldCounts?.buildings > 0;
  }, null, { timeout: 180000 });
}

async function enterLargeBuilding() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { deriveInteriorFloorPlan } = await import('/app/js/interiors/floor-model.js?v=1');
    const area = (points = []) => Math.abs(points.reduce((sum, point, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      return sum + previous.x * point.z - point.x * previous.z;
    }, 0) * 0.5);
    const candidates = (ctx.buildings || []).map((building) => {
      const support = ctx.resolveBuildingEntrySupport?.(building, { allowSynthetic: true });
      const width = Number(building.maxX) - Number(building.minX);
      const depth = Number(building.maxZ) - Number(building.minZ);
      const plan = deriveInteriorFloorPlan({ key: support?.key, building }, { width, depth });
      return { building, support, plan, area: area(support?.footprint || building.pts) };
    }).filter((entry) => entry.support?.enterable && entry.plan.floorCount >= 3 && entry.area >= 180)
      .sort((a, b) => b.area - a.area);
    const selected = candidates[0];
    if (!selected) throw new Error('No connector-eligible Baltimore building with at least three floors was found.');
    const walker = ctx.Walk.state.walker;
    Object.assign(walker, {
      x: selected.support.entryAnchor.x,
      z: selected.support.entryAnchor.z,
      y: Number(selected.building.baseY || selected.building.minY || 0) + 1.7,
      vy: 0
    });
    ctx.car.x = walker.x;
    ctx.car.z = walker.z;
    const worldSequence = Number(ctx._worldLoadSequence || 0);
    const outside = { x: walker.x, y: walker.y, z: walker.z };
    const entered = await ctx.enterInteriorForSupport(selected.support);
    const active = ctx.activeInterior;
    if (!entered || !active?.connector) throw new Error('Selected building did not publish its floor connector core.');
    const viewX = active.connector.start.x - active.connector.axis.x * 2.35;
    const viewZ = active.connector.start.z - active.connector.axis.z * 2.35;
    Object.assign(walker, {
      x: viewX,
      z: viewZ,
      y: active.floorBaseY + 1.75,
      angle: Math.atan2(active.connector.end.x - viewX, active.connector.end.z - viewZ),
      yaw: Math.atan2(active.connector.end.x - viewX, active.connector.end.z - viewZ),
      lookYawOffset: 0,
      pitch: -0.03,
      vy: 0
    });
    ctx.camera.position.set(viewX, active.floorBaseY + 1.65, viewZ);
    ctx.camera.lookAt(
      (active.connector.start.x + active.connector.end.x) * 0.5,
      active.floorBaseY + 1.65,
      (active.connector.start.z + active.connector.end.z) * 0.5
    );
    ctx.camera.updateMatrixWorld(true);
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = true;
    ctx.renderer.render(ctx.scene, ctx.camera);
    return {
      buildingId: selected.building.sourceBuildingId || selected.support.key,
      worldSequence,
      outside,
      floorCount: active.floorPlan.floorCount,
      floorId: active.floorId,
      loadedLevels: [...active.loadedLevels],
      connector: {
        start: { ...active.connector.start },
        end: { ...active.connector.end },
        elevator: { ...active.connector.elevator }
      }
    };
  });
}

try {
  await launchBaltimore();
  const entered = await enterLargeBuilding();
  assert.equal(entered.floorId.endsWith(':floor:0'), true);
  assert.deepEqual(entered.loadedLevels, [0, 1]);
  await page.screenshot({ path: path.join(outputDir, '01-lobby-stairs-elevator.png') });

  const climbed = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
    const active = ctx.activeInterior;
    const stair = active.stairs.find((entry) => entry.floorLevel === 0);
    if (!stair) throw new Error('Lobby stair surface is missing.');
    const walker = ctx.Walk.state.walker;
    const dx = stair.end.x - stair.start.x;
    const dz = stair.end.z - stair.start.z;
    const length = Math.hypot(dx, dz);
    Object.assign(walker, {
      x: stair.start.x + dx / length * 0.12,
      z: stair.start.z + dz / length * 0.12,
      y: stair.yStart + 1.7,
      angle: Math.atan2(dx, dz),
      yaw: Math.atan2(dx, dz),
      lookYawOffset: 0,
      pitch: -0.04,
      vy: 0
    });
    ctx.keys.ArrowUp = true;
    for (let index = 0; index < 190; index += 1) {
      ctx.Walk.update(1 / 60);
      ctx.updateInteriorInteraction?.();
      if (ctx.activeInterior?.activeLevel === 1) break;
    }
    ctx.keys.ArrowUp = false;
    const current = ctx.activeInterior;
    ctx.camera.position.set(walker.x - Math.sin(walker.angle) * 2.2, walker.y + 0.45, walker.z - Math.cos(walker.angle) * 2.2);
    ctx.camera.lookAt(walker.x, walker.y - 0.4, walker.z);
    ctx.camera.updateMatrixWorld(true);
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = true;
    ctx.renderer.render(ctx.scene, ctx.camera);
    return {
      activeLevel: current.activeLevel,
      floorId: current.floorId,
      floorY: walker.y - 1.7,
      expectedFloorY: current.floorBaseY + current.activeLevel * current.floorPlan.storyHeight,
      loadedLevels: [...current.loadedLevels],
      position: { x: walker.x, z: walker.z },
      stair: { start: stair.start, end: stair.end },
      worldSequence: Number(ctx._worldLoadSequence || 0)
    };
  });
  assert.equal(climbed.activeLevel, 1, `physical stair climb did not reach Floor 2: ${JSON.stringify(climbed)}`);
  assert.ok(Math.abs(climbed.floorY - climbed.expectedFloorY) < 0.5);
  assert.ok(climbed.loadedLevels.includes(2), 'adjacent upper floor was not published after stair arrival');
  assert.equal(climbed.worldSequence, entered.worldSequence, 'stairs reloaded the world');
  await page.screenshot({ path: path.join(outputDir, '02-floor-two-stair-arrival.png') });

  const elevatorPrepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
    const active = ctx.activeInterior;
    const interaction = active.interactions.find((entry) => entry.kind === 'elevator');
    const walker = ctx.Walk.state.walker;
    const approachX = interaction.x + active.connector.axis.x * 2.25;
    const approachZ = interaction.z + active.connector.axis.z * 2.25;
    const approachAngle = Math.atan2(interaction.x - approachX, interaction.z - approachZ);
    Object.assign(walker, {
      x: approachX,
      z: approachZ,
      y: active.floorBaseY + active.activeLevel * active.floorPlan.storyHeight + 1.7,
      angle: approachAngle,
      yaw: approachAngle,
      lookYawOffset: 0,
      pitch: 0,
      vy: 0
    });
    ctx.updateInteriorInteraction();
    const cabin = active.group.getObjectByName(`interior-elevator:floor:${active.activeLevel}`);
    if (!cabin) throw new Error('Active-floor elevator visual is missing.');
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    const prompt = document.getElementById('interiorPrompt');
    return {
      fromLevel: active.activeLevel,
      targetLevel: interaction.targetLevel,
      prompt: prompt?.textContent || '',
      elevatorMeshes: cabin.children.length
    };
  });
  assert.match(elevatorPrepared.prompt, /elevator/i);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(outputDir, '03-elevator-prompt.png') });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction((targetLevel) => JSON.parse(globalThis.render_game_to_text?.() || '{}').interior?.activeLevel === targetLevel,
    elevatorPrepared.targetLevel, { timeout: 8000 });
  const elevatorArrival = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text())).interior;
  assert.equal(elevatorArrival.floorId.endsWith(`:floor:${elevatorPrepared.targetLevel}`), true);
  assert.equal(elevatorArrival.loadedLevels.includes(elevatorPrepared.targetLevel), true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const active = ctx.activeInterior;
    const walker = ctx.Walk.state.walker;
    const target = active.connector.elevator;
    const approachX = target.x + active.connector.axis.x * 2.25;
    const approachZ = target.z + active.connector.axis.z * 2.25;
    const approachAngle = Math.atan2(target.x - approachX, target.z - approachZ);
    Object.assign(walker, {
      x: approachX,
      z: approachZ,
      y: active.floorBaseY + active.activeLevel * active.floorPlan.storyHeight + 1.7,
      angle: approachAngle,
      yaw: approachAngle,
      lookYawOffset: 0,
      pitch: 0,
      vy: 0
    });
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = false;
  });
  // Let the walking solver settle onto the rebuilt floor before judging the
  // arrival frame; the camera follows the same player controller.
  await page.waitForTimeout(650);
  const elevatorArrivalView = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk.state.walker;
    const surface = ctx.sampleInteriorWalkSurface?.(
      walker.x,
      walker.z,
      walker.y - (ctx.Walk.CFG.eyeHeight || 1.7)
    );
    return {
      camera: { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z },
      walker: { x: walker.x, y: walker.y, z: walker.z },
      surface: surface ? { y: surface.y, source: surface.source, floorLevel: surface.feature?.floorLevel } : null,
      activeLevel: ctx.activeInterior.activeLevel,
      loadedLevels: [...ctx.activeInterior.loadedLevels],
      expectedEyeY: ctx.activeInterior.floorBaseY
        + ctx.activeInterior.activeLevel * ctx.activeInterior.floorPlan.storyHeight
        + (ctx.Walk.CFG.eyeHeight || 1.7)
    };
  });
  assert.ok(Math.abs(elevatorArrivalView.camera.y - elevatorArrivalView.expectedEyeY) < 0.15,
    `elevator arrival camera did not follow the active floor: ${JSON.stringify(elevatorArrivalView)}`);
  await page.screenshot({ path: path.join(outputDir, '04-elevator-arrival.png') });

  const exited = await page.evaluate(async (outside) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
    let guard = 0;
    while (ctx.activeInterior?.activeLevel !== 0 && guard < 10) {
      const active = ctx.activeInterior;
      const interaction = active.interactions.find((entry) => entry.kind === 'elevator');
      const walker = ctx.Walk.state.walker;
      Object.assign(walker, {
        x: interaction.x,
        z: interaction.z,
        y: active.floorBaseY + active.activeLevel * active.floorPlan.storyHeight + 1.7,
        vy: 0
      });
      await ctx.handleInteriorAction();
      guard += 1;
    }
    const active = ctx.activeInterior;
    const exit = active.interactions.find((entry) => entry.kind === 'exit');
    Object.assign(ctx.Walk.state.walker, {
      x: exit.x,
      z: exit.z,
      y: active.floorBaseY + 1.7,
      vy: 0
    });
    await ctx.handleInteriorAction();
    return {
      active: !!ctx.activeInterior,
      colliderCount: ctx.dynamicBuildingColliders?.length || 0,
      x: ctx.Walk.state.walker.x,
      y: ctx.Walk.state.walker.y,
      z: ctx.Walk.state.walker.z,
      outside,
      worldSequence: Number(ctx._worldLoadSequence || 0)
    };
  }, entered.outside);
  assert.equal(exited.active, false);
  assert.equal(exited.colliderCount, 0);
  assert.ok(Math.hypot(exited.x - exited.outside.x, exited.z - exited.outside.z) < 0.02, 'lobby exit did not restore the exact doorway position');
  assert.equal(exited.worldSequence, entered.worldSequence, 'interior lifecycle reloaded the world');

  await page.setViewportSize({ width: 390, height: 844 });
  await enterLargeBuilding();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const active = ctx.activeInterior;
    const interaction = active.interactions.find((entry) => entry.kind === 'elevator');
    const walker = ctx.Walk.state.walker;
    const approachX = interaction.x + active.connector.axis.x * 2.25;
    const approachZ = interaction.z + active.connector.axis.z * 2.25;
    const approachAngle = Math.atan2(interaction.x - approachX, interaction.z - approachZ);
    Object.assign(walker, {
      x: approachX,
      z: approachZ,
      y: active.floorBaseY + 1.7,
      angle: approachAngle,
      yaw: approachAngle,
      lookYawOffset: 0,
      pitch: 0,
      vy: 0
    });
    ctx.updateInteriorInteraction();
    const cabin = active.group.getObjectByName(`interior-elevator:floor:${active.activeLevel}`);
    if (!cabin) throw new Error('Mobile elevator visual is missing.');
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = false;
  });
  await page.waitForTimeout(220);
  const promptBounds = await page.locator('#interiorPrompt.show').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width };
  });
  assert.ok(promptBounds.left >= 0 && promptBounds.right <= 390 && promptBounds.bottom <= 844,
    `mobile interior prompt exceeds viewport: ${JSON.stringify(promptBounds)}`);
  await page.screenshot({ path: path.join(outputDir, '05-mobile-elevator-prompt.png') });

  assert.deepEqual(fatalErrors, [], `fatal browser errors: ${fatalErrors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    browser: 'Google Chrome',
    buildingId: entered.buildingId,
    floorCount: entered.floorCount,
    stairArrival: climbed,
    elevatorArrival,
    elevatorArrivalView,
    elevatorMeshes: elevatorPrepared.elevatorMeshes,
    exactExit: exited,
    mobilePrompt: promptBounds,
    screenshots: outputDir,
    providerWarnings: providerWarnings.length
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
