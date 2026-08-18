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
    const traffic = snapshots.find((candidate) => candidate.visible && allowed.has(candidate.variant?.bodyStyle) &&
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
    for (let index = 0; index < 4; index += 1) {
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
  const civicEvidence = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.urbanSandboxRuntime.civic.clear();
    ctx.advanceRuntimeTime?.(140);
    const ignored = ctx.urbanSandboxRuntime.reportCivicEvent({
      kind: 'vehicle_taken',
      position: { x: 100000, z: 100000 },
      severity: 1,
      radius: 8,
      audibleRadius: 2
    });
    const pedestrians = ctx.livingWorldRuntime.population.pedestrianSnapshots();
    const target = pedestrians.find((entry) => !entry.reaction) || pedestrians[0];
    if (!target) throw new Error('No Living World pedestrian was available for civic response');
    Object.assign(ctx.Walk.state.walker, {
      x: target.x,
      z: target.z,
      y: target.y + 1.7,
      angle: target.yaw,
      yaw: target.yaw
    });
    ctx.Walk.state.characterMesh?.position.set(target.x, target.y, target.z);
    for (let index = 0; index < 10; index += 1) ctx.advanceRuntimeTime?.(160);
    const current = ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.id === target.id);
    const eventPosition = {
      x: current.x + Math.sin(current.yaw) * 3,
      y: current.y,
      z: current.z + Math.cos(current.yaw) * 3
    };
    const witnessed = ctx.urbanSandboxRuntime.reportCivicEvent({
      kind: 'reckless_driving',
      vehicleId: '',
      position: eventPosition,
      severity: 1,
      radius: 24,
      audibleRadius: 8,
      maximumWitnesses: 3
    });
    ctx.advanceRuntimeTime?.(120);
    return {
      ignored: { accepted: ignored.accepted, phase: ignored.snapshot.phase },
      witnessed: { accepted: witnessed.accepted, witnessCount: witnessed.event?.witnessCount || 0 },
      urban: JSON.parse(globalThis.render_game_to_text()).urbanSandbox,
      pedestrian: ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.id === target.id),
      status: (() => {
        const element = document.getElementById('urbanCivicStatus');
        const rect = element.getBoundingClientRect();
        return {
          visible: getComputedStyle(element).display !== 'none',
          width: rect.width,
          right: rect.right,
          title: document.getElementById('urbanCivicStatusTitle')?.textContent || '',
          detail: document.getElementById('urbanCivicStatusDetail')?.textContent || ''
        };
      })()
    };
  });
  assert.equal(civicEvidence.ignored.accepted, false, 'an unwitnessed event created civic attention');
  assert.equal(civicEvidence.ignored.phase, 'clear');
  assert.equal(civicEvidence.witnessed.accepted, true, 'a visible nearby pedestrian did not witness the event');
  assert.ok(civicEvidence.witnessed.witnessCount >= 1);
  assert.equal(civicEvidence.urban.civicResponse.phase, 'observed');
  assert.equal(civicEvidence.urban.civicResponse.level, 1);
  assert.equal(civicEvidence.pedestrian.reaction, 'reporting');
  assert.equal(civicEvidence.urban.interactiveNpcs.length, 1, 'the reporting witness was not promoted to a close-range NPC');
  assert.equal(civicEvidence.urban.interactiveNpcs[0].sourceAgentId, civicEvidence.pedestrian.id);
  assert.equal(civicEvidence.urban.interactiveNpcs[0].reaction, 'reporting');
  assert.equal(civicEvidence.status.visible, true);
  assert.ok(civicEvidence.status.right <= 1440 && civicEvidence.status.width <= 320);
  await page.screenshot({ path: path.join(outputDir, '05-witnessed-civic-response.png') });
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
  assert.equal(promotedTraffic.living.activePopulation.promotedPedestrians, 1);
  assert.ok(promotedTraffic.living.population.drawCalls <= 22,
    `Living World reaction presentation exceeded its shared draw-call budget: ${promotedTraffic.living.population.drawCalls}`);
  assert.equal(promotedTraffic.urban.worldLoadSequence, trafficPrepared.worldLoadSequence, 'traffic promotion reloaded the world');
  await page.screenshot({ path: path.join(outputDir, '04-entered-promoted-traffic.png') });
  await page.keyboard.press('KeyE');
  await page.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'walking' && state.activeVehicleId === '' &&
      state.vehicles.some((vehicle) => vehicle.id === vehicleId && vehicle.attachedToPlayer === false);
  }, trafficPrepared.expectedVehicleId, { timeout: 10000 });
  const witnessView = await page.evaluate((pedestrianId) => {
    return import('/app/js/shared-context.js?v=55').then(({ ctx }) => {
      const pedestrian = ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.id === pedestrianId);
      if (!pedestrian) throw new Error(`Witness ${pedestrianId} disappeared before rendered review`);
      const distance = 5.5;
      const x = pedestrian.x - Math.sin(pedestrian.yaw) * distance;
      const z = pedestrian.z - Math.cos(pedestrian.yaw) * distance;
      const angle = Math.atan2(pedestrian.x - x, pedestrian.z - z);
      Object.assign(ctx.Walk.state.walker, { x, z, y: pedestrian.y + 1.7, angle, yaw: angle });
      ctx.Walk.state.characterMesh?.position.set(x, pedestrian.y, z);
      ctx.Walk.state.characterMesh?.rotation.set(0, angle, 0);
      ctx.advanceRuntimeTime?.(180);
      return {
        pedestrian: ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.id === pedestrianId),
        phase: JSON.parse(globalThis.render_game_to_text()).urbanSandbox.civicResponse.phase
      };
    });
  }, civicEvidence.pedestrian.id);
  assert.ok(['reporting', 'watching'].includes(witnessView.pedestrian.reaction));
  assert.notEqual(witnessView.phase, 'clear');
  await page.screenshot({ path: path.join(outputDir, '05-witnessed-civic-response.png') });

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
  await mobilePage.screenshot({ path: path.join(outputDir, '06-mobile-entered-vehicle.png') });
  await mobilePage.locator('#urbanVehiclePromptButton').tap();
  await mobilePage.waitForFunction((vehicleId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.phase === 'walking' && state.activeVehicleId === '' &&
      state.vehicles.some((vehicle) => vehicle.id === vehicleId && vehicle.attachedToPlayer === false);
  }, mobilePrepared.id, { timeout: 10000 });
  const mobileExited = await mobilePage.evaluate(() => JSON.parse(globalThis.render_game_to_text()).urbanSandbox);
  assert.equal(mobileExited.worldLoadSequence, mobilePrepared.sequence, 'mobile enter/exit reloaded the world');
  const mobileCivic = await mobilePage.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.urbanSandboxRuntime.civic.clear();
    const pedestrian = ctx.livingWorldRuntime.population.pedestrianSnapshots()[0];
    if (!pedestrian) throw new Error('No mobile civic witness was available');
    Object.assign(ctx.Walk.state.walker, { x: pedestrian.x, z: pedestrian.z, y: pedestrian.y + 1.7 });
    ctx.Walk.state.characterMesh?.position.set(pedestrian.x, pedestrian.y, pedestrian.z);
    for (let index = 0; index < 8; index += 1) ctx.advanceRuntimeTime?.(160);
    const current = ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => entry.id === pedestrian.id);
    const result = ctx.urbanSandboxRuntime.reportCivicEvent({
      kind: 'vehicle_taken',
      position: { x: current.x + 2, y: current.y, z: current.z },
      radius: 20,
      audibleRadius: 8
    });
    ctx.advanceRuntimeTime?.(120);
    const element = document.getElementById('urbanCivicStatus');
    const rect = element.getBoundingClientRect();
    return {
      accepted: result.accepted,
      phase: JSON.parse(globalThis.render_game_to_text()).urbanSandbox.civicResponse.phase,
      visible: getComputedStyle(element).display !== 'none',
      left: rect.left,
      right: rect.right,
      width: rect.width
    };
  });
  assert.equal(mobileCivic.accepted, true);
  assert.equal(mobileCivic.visible, true);
  assert.ok(mobileCivic.left >= 0 && mobileCivic.right <= 390 && mobileCivic.width <= 370,
    `mobile civic status exceeds viewport: ${JSON.stringify(mobileCivic)}`);
  await mobilePage.screenshot({ path: path.join(outputDir, '07-mobile-civic-response.png') });
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
    civicResponse: civicEvidence,
    witnessView,
    mobile: { prompt: mobilePrompt, civic: mobileCivic, enteredAndExited: true, worldLoadSequence: mobileExited.worldLoadSequence },
    providerWarnings: providerWarnings.slice(0, 20),
    fatalErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
