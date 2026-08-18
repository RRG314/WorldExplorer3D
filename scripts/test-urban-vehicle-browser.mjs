import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'urban-vehicle');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4330, 4331, 4332] });
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

try {
  const url = `http://127.0.0.1:${server.port}/app/?urban-vehicle-browser=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('load', { timeout: 120000 });
  await page.waitForTimeout(2200);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.runtimeReady === true && typeof ctx.ensureEarthRuntimeReady === 'function' && !!ctx.LOCS?.baltimore;
  }, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.ensureEarthRuntimeReady();
    ctx.selLoc = 'baltimore';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.setTravelMode?.('walk', { source: 'urban-vehicle-browser', force: true, emitTutorial: false });
  });
  await page.waitForFunction(() => {
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.urbanSandbox?.active === true && snapshot.urbanSandbox.vehicleCount > 0;
  }, null, { timeout: 180000 });

  const prepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=1');
    const vehicle = ctx.urbanSandboxRuntime.vehicles[0];
    const door = vehicleDoorPosition(vehicle);
    const walker = ctx.Walk.state.walker;
    walker.x = door.x;
    walker.z = door.z;
    walker.y = vehicle.y + 0.5;
    walker.angle = vehicle.yaw;
    walker.yaw = vehicle.yaw;
    ctx.Walk.state.characterMesh?.position.set(door.x, vehicle.y - 1.2, door.z);
    ctx.Walk.state.characterMesh?.rotation.set(0, vehicle.yaw, 0);
    ctx.advanceRuntimeTime?.(220);
    return {
      id: vehicle.id,
      style: vehicle.variant.bodyStyle,
      color: vehicle.color,
      worldLoadSequence: Number(ctx._worldLoadSequence || 0),
      state: JSON.parse(globalThis.render_game_to_text())
    };
  });
  assert.equal(prepared.state.urbanSandbox.nearbyVehicleId, prepared.id);
  await page.screenshot({ path: path.join(outputDir, '01-approach-vehicle.png') });

  await page.keyboard.press('KeyE');
  await page.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'driving' && state.activeVehicleId === vehicleId;
  }, prepared.id, { timeout: 10000 });
  const entered = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text()).urbanSandbox);
  assert.equal(entered.worldLoadSequence, prepared.worldLoadSequence, 'entering a car reloaded the world');
  const enteredVehicle = entered.vehicles.find((vehicle) => vehicle.id === prepared.id);
  assert.equal(enteredVehicle.attachedToPlayer, true);
  assert.equal(enteredVehicle.style, prepared.style);
  assert.equal(enteredVehicle.color, prepared.color);
  await page.screenshot({ path: path.join(outputDir, '02-driving-selected-vehicle.png') });

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(850);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.interaction?.action === 'exit_vehicle';
  }, null, { timeout: 10000 });
  const beforeExit = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text()).urbanSandbox);
  const beforeExitVehicle = beforeExit.vehicles.find((vehicle) => vehicle.id === prepared.id);
  const movedDistance = Math.hypot(beforeExitVehicle.x - enteredVehicle.x, beforeExitVehicle.z - enteredVehicle.z);
  assert.ok(movedDistance > 0.5, `selected vehicle did not drive: ${movedDistance}`);

  await page.keyboard.press('KeyE');
  await page.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    const vehicle = state?.vehicles?.find((entry) => entry.id === vehicleId);
    return state?.phase === 'walking' && state.activeVehicleId === '' && vehicle?.attachedToPlayer === false;
  }, prepared.id, { timeout: 10000 });
  const exited = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text()).urbanSandbox);
  const retained = exited.vehicles.find((vehicle) => vehicle.id === prepared.id);
  assert.equal(exited.worldLoadSequence, prepared.worldLoadSequence, 'exiting a car reloaded the world');
  assert.equal(retained.style, prepared.style);
  assert.equal(retained.color, prepared.color);
  assert.ok(Math.hypot(retained.x - beforeExitVehicle.x, retained.z - beforeExitVehicle.z) < 0.15, 'the exited vehicle did not retain its exact pose');
  await page.screenshot({ path: path.join(outputDir, '03-exited-retained-vehicle.png') });

  const trafficPrepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=1');
    const allowed = new Set(['compact', 'sedan', 'suv', 'pickup', 'taxi']);
    const parked = ctx.urbanSandboxRuntime.vehicles;
    const snapshots = ctx.livingWorldRuntime.population.vehicleSnapshots();
    const traffic = snapshots.find((candidate) => allowed.has(candidate.variant?.bodyStyle) &&
      parked.every((vehicle) => Math.hypot(vehicle.x - candidate.x, vehicle.z - candidate.z) > 9));
    if (!traffic) throw new Error('No promotable traffic vehicle was available');
    const placeAtCurrentDoor = () => {
      const current = ctx.livingWorldRuntime.population.vehicleSnapshots().find((entry) => entry.id === traffic.id);
      const vehicle = {
        ...current,
        y: current.y + 1.2,
        driverSide: -1
      };
      const door = vehicleDoorPosition(vehicle);
      Object.assign(ctx.Walk.state.walker, { x: door.x, z: door.z, y: vehicle.y + .5, angle: vehicle.yaw, yaw: vehicle.yaw });
      ctx.Walk.state.characterMesh?.position.set(door.x, vehicle.y - 1.2, door.z);
      ctx.Walk.state.characterMesh?.rotation.set(0, vehicle.yaw, 0);
      return current;
    };
    let settled = null;
    for (let index = 0; index < 12; index += 1) {
      settled = placeAtCurrentDoor();
      ctx.advanceRuntimeTime?.(160);
    }
    settled = placeAtCurrentDoor();
    ctx.advanceRuntimeTime?.(60);
    const nearby = ctx.livingWorldRuntime.population.nearbyVehicles(ctx.Walk.state.walker, 6);
    return {
      sourceAgentId: traffic.id,
      expectedVehicleId: `traffic:${ctx.urbanSandboxRuntime.worldIdentity}:${traffic.id}`,
      style: traffic.variant.bodyStyle,
      color: traffic.color,
      settledSpeed: settled.speed,
      nearby: nearby.map((entry) => ({ id: entry.id, speed: entry.speed, visible: entry.visible })),
      worldLoadSequence: Number(ctx._worldLoadSequence || 0),
      state: JSON.parse(globalThis.render_game_to_text())
    };
  });
  assert.ok(trafficPrepared.nearby.some((vehicle) => vehicle.id === trafficPrepared.sourceAgentId && vehicle.speed <= 2.5),
    `traffic vehicle did not yield for interaction: ${JSON.stringify(trafficPrepared)}`);
  assert.equal(trafficPrepared.state.urbanSandbox.nearbyVehicleId, trafficPrepared.expectedVehicleId);
  await page.keyboard.press('KeyE');
  await page.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'driving' && state.activeVehicleId === vehicleId;
  }, trafficPrepared.expectedVehicleId, { timeout: 10000 });
  const promotedTraffic = await page.evaluate(() => {
    const state = JSON.parse(globalThis.render_game_to_text());
    return { urban: state.urbanSandbox, living: state.livingWorld };
  });
  const promotedVehicle = promotedTraffic.urban.vehicles.find((vehicle) => vehicle.id === trafficPrepared.expectedVehicleId);
  assert.equal(promotedVehicle.source, 'living-world-promoted-traffic');
  assert.equal(promotedVehicle.trafficAgentId, trafficPrepared.sourceAgentId);
  assert.equal(promotedVehicle.style, trafficPrepared.style);
  assert.equal(promotedVehicle.color, trafficPrepared.color);
  assert.equal(promotedTraffic.living.activePopulation.promotedVehicles, 1);
  assert.equal(promotedTraffic.urban.worldLoadSequence, trafficPrepared.worldLoadSequence, 'traffic promotion reloaded the world');
  await page.screenshot({ path: path.join(outputDir, '04-entered-promoted-traffic.png') });
  await page.keyboard.press('KeyE');
  await page.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'walking' && state.activeVehicleId === '' &&
      state.vehicles.some((vehicle) => vehicle.id === vehicleId && vehicle.attachedToPlayer === false);
  }, trafficPrepared.expectedVehicleId, { timeout: 10000 });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobilePage = await mobileContext.newPage();
  mobilePage.on('pageerror', (error) => fatalErrors.push(`mobile: ${String(error?.stack || error)}`));
  mobilePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (recoverable(message.text())) providerWarnings.push(`mobile: ${message.text()}`);
    else fatalErrors.push(`mobile: ${message.text()}`);
  });
  await mobilePage.goto(url.replace('urban-vehicle-browser=1', 'urban-vehicle-mobile=1'), { waitUntil: 'load', timeout: 120000 });
  await mobilePage.waitForTimeout(2200);
  await mobilePage.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.ensureEarthRuntimeReady();
    ctx.selLoc = 'baltimore';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.setTravelMode?.('walk', { source: 'urban-vehicle-mobile', force: true, emitTutorial: false });
  });
  await mobilePage.waitForFunction(() => {
    const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return snapshot.worldLoading === false && snapshot.urbanSandbox?.vehicleCount > 0;
  }, null, { timeout: 180000 });
  const mobilePrepared = await mobilePage.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=1');
    const vehicle = ctx.urbanSandboxRuntime.vehicles[0];
    const door = vehicleDoorPosition(vehicle);
    Object.assign(ctx.Walk.state.walker, { x: door.x, z: door.z, y: vehicle.y + 0.5, angle: vehicle.yaw, yaw: vehicle.yaw });
    ctx.Walk.state.characterMesh?.position.set(door.x, vehicle.y - 1.2, door.z);
    ctx.advanceRuntimeTime?.(220);
    return { id: vehicle.id, sequence: Number(ctx._worldLoadSequence || 0) };
  });
  await mobilePage.locator('#urbanVehiclePrompt.show').waitFor({ state: 'visible', timeout: 10000 });
  const mobilePrompt = await mobilePage.locator('#urbanVehiclePrompt').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    buttonDisplay: getComputedStyle(document.getElementById('urbanVehiclePromptButton')).display,
    keyDisplay: getComputedStyle(document.getElementById('urbanVehiclePromptKey')).display
  }));
  assert.ok(mobilePrompt.left >= 0 && mobilePrompt.right <= 390 && mobilePrompt.width <= 370, `mobile prompt exceeds viewport: ${JSON.stringify(mobilePrompt)}`);
  assert.notEqual(mobilePrompt.buttonDisplay, 'none', 'touch interaction button is hidden');
  assert.equal(mobilePrompt.keyDisplay, 'none', 'keyboard hint remained visible on touch');
  await mobilePage.locator('#urbanVehiclePromptButton').tap();
  await mobilePage.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'driving' && state.activeVehicleId === vehicleId;
  }, mobilePrepared.id, { timeout: 10000 });
  await mobilePage.screenshot({ path: path.join(outputDir, '05-mobile-entered-vehicle.png') });
  await mobilePage.locator('#urbanVehiclePromptButton').tap();
  await mobilePage.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'walking' && state.activeVehicleId === '' &&
      state.vehicles.some((vehicle) => vehicle.id === vehicleId && vehicle.attachedToPlayer === false);
  }, mobilePrepared.id, { timeout: 10000 });
  const mobileExited = await mobilePage.evaluate(() => JSON.parse(globalThis.render_game_to_text()).urbanSandbox);
  assert.equal(mobileExited.worldLoadSequence, mobilePrepared.sequence, 'mobile enter/exit reloaded the world');
  await mobileContext.close();
  assert.deepEqual(fatalErrors, [], `fatal browser errors: ${fatalErrors.join('\n')}`);

  const report = {
    ok: true,
    browser: 'Google Chrome',
    url,
    vehicle: { id: prepared.id, style: prepared.style, color: prepared.color },
    worldLoadSequence: prepared.worldLoadSequence,
    movedDistance,
    entered: entered.interaction,
    exited: exited.interaction,
    retained,
    promotedTraffic: {
      id: trafficPrepared.expectedVehicleId,
      sourceAgentId: trafficPrepared.sourceAgentId,
      style: trafficPrepared.style,
      color: trafficPrepared.color,
      promotedCount: promotedTraffic.living.activePopulation.promotedVehicles
    },
    mobile: { prompt: mobilePrompt, enteredAndExited: true, worldLoadSequence: mobileExited.worldLoadSequence },
    providerWarnings: providerWarnings.slice(0, 20),
    fatalErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
