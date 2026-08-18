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
  assert.equal(await page.locator('[data-mode="police"]').count(), 0, 'retired standalone Police Chase remains in the game selector');
  assert.equal(await page.locator('#fPolice').count(), 0, 'retired Police float toggle remains in play UI');

  const prepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=2');
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

  await page.keyboard.press('KeyI');
  await page.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 5000 });
  const equipmentPanel = await page.locator('#urbanEquipment').evaluate((element) => ({
    slotCount: element.querySelectorAll('[data-equipment-id]').length,
    width: element.getBoundingClientRect().width,
    right: element.getBoundingClientRect().right
  }));
  assert.equal(equipmentPanel.slotCount, 5, 'equipment inventory did not render its five quick slots');
  assert.ok(equipmentPanel.right <= 1440 && equipmentPanel.width <= 620, `equipment panel exceeds desktop viewport: ${JSON.stringify(equipmentPanel)}`);
  await page.screenshot({ path: path.join(outputDir, '04-equipment-inventory.png') });
  await page.keyboard.press('KeyI');

  const npcPrepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const candidates = ctx.livingWorldRuntime.population.pedestrianSnapshots();
    const possessionAvailable = (id) => [...String(`urban-npc:${ctx.urbanSandboxRuntime.worldIdentity}:${id}`)]
      .reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381) % 5 !== 0;
    const pedestrian = candidates.find((entry) => possessionAvailable(entry.id)) || candidates[0];
    if (!pedestrian) throw new Error('No NPC was available for interaction');
    const distance = 1.55;
    const x = pedestrian.x - Math.sin(pedestrian.yaw) * distance;
    const z = pedestrian.z - Math.cos(pedestrian.yaw) * distance;
    const angle = Math.atan2(pedestrian.x - x, pedestrian.z - z);
    Object.assign(ctx.Walk.state.walker, { x, z, y: pedestrian.y + 1.7, angle, yaw: angle, lookYawOffset: 0 });
    ctx.Walk.state.characterMesh?.position.set(x, pedestrian.y, z);
    ctx.Walk.state.characterMesh?.rotation.set(0, angle, 0);
    ctx.camera.position.set(x, pedestrian.y + 1.6, z);
    ctx.camera.lookAt(pedestrian.x, pedestrian.y + 1.1, pedestrian.z);
    ctx.camera.updateMatrixWorld(true);
    ctx.advanceRuntimeTime?.(160);
    return { id: pedestrian.id };
  });
  await page.waitForFunction((pedestrianId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.interaction?.action === 'talk_npc' && state.interactiveNpcs.every((npc) => npc.sourceAgentId !== pedestrianId);
  }, npcPrepared.id, { timeout: 10000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction((pedestrianId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    return state?.lastNpcAction?.type === 'talked' && state.interactiveNpcs.some((npc) => npc.sourceAgentId === pedestrianId);
  }, npcPrepared.id, { timeout: 10000 });
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox?.equipment?.sandboxItems === 1, null, { timeout: 10000 });
  await page.keyboard.press('Digit3');
  await page.evaluate(async (pedestrianId) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const npc = ctx.urbanSandboxRuntime.npcs.find((entry) => entry.sourceAgentId === pedestrianId);
    const walker = ctx.Walk.state.walker;
    ctx.camera.position.set(walker.x, walker.y - .1, walker.z);
    ctx.camera.lookAt(npc.visual.root.position.x, npc.visual.root.position.y + 1.1, npc.visual.root.position.z);
    ctx.camera.updateMatrixWorld(true);
  }, npcPrepared.id);
  await page.keyboard.press('KeyV');
  const npcInteraction = await page.waitForFunction((pedestrianId) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}').urbanSandbox;
    const npc = state?.interactiveNpcs?.find((entry) => entry.sourceAgentId === pedestrianId);
    return state?.lastImpactAction?.equipmentId === 'baton' && npc ? state : null;
  }, npcPrepared.id, { timeout: 10000 }).then((handle) => handle.jsonValue());
  assert.equal(npcInteraction.lastNpcAction.type, 'took_item');
  assert.equal(npcInteraction.equipment.equippedId, 'baton');
  assert.ok(npcInteraction.interactiveNpcs.find((npc) => npc.sourceAgentId === npcPrepared.id).condition < 1,
    'baton impact did not change the NPC condition');

  const furnitureImpact = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const furniture = ctx.streetFurnitureMeshes.find((entry) => entry.userData?.interactiveWorldObject);
    if (!furniture) throw new Error('No interactive street furniture was generated');
    const x = furniture.position.x;
    const z = furniture.position.z - 3;
    const angle = Math.atan2(furniture.position.x - x, furniture.position.z - z);
    Object.assign(ctx.Walk.state.walker, { x, z, y: furniture.position.y + 1.7, angle, yaw: angle, lookYawOffset: 0 });
    ctx.Walk.state.characterMesh?.position.set(x, furniture.position.y, z);
    ctx.camera.position.set(x, furniture.position.y + 1.6, z);
    ctx.camera.lookAt(furniture.position.x, furniture.position.y + 1, furniture.position.z);
    ctx.camera.updateMatrixWorld(true);
    ctx.equipUrbanEquipmentSlot(5);
    await new Promise((resolve) => setTimeout(resolve, 1150));
    const handled = ctx.handleUrbanEquipmentUse();
    ctx.advanceRuntimeTime?.(80);
    return {
      handled,
      kind: furniture.userData.furnitureKind,
      condition: furniture.userData.condition,
      state: JSON.parse(globalThis.render_game_to_text()).urbanSandbox,
      furnitureKinds: [...new Set(ctx.streetFurnitureMeshes.map((entry) => entry.userData?.furnitureKind).filter(Boolean))]
    };
  });
  assert.equal(furnitureImpact.handled, true);
  assert.ok(furnitureImpact.condition < 1, `equipped charge did not affect street furniture: ${JSON.stringify(furnitureImpact)}`);
  assert.equal(furnitureImpact.state.lastImpactAction.equipmentId, 'concussion-charge');
  assert.ok(furnitureImpact.furnitureKinds.includes('street_name_sign'));
  await page.screenshot({ path: path.join(outputDir, '05-living-world-interactions.png') });

  const trafficPrepared = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=2');
    const allowed = new Set(['compact', 'sedan', 'suv', 'pickup', 'taxi', 'van', 'box-truck', 'bus']);
    const parked = ctx.urbanSandboxRuntime.vehicles;
    const actor = ctx.Walk.state.walker;
    ctx.timeOfDay = 'day';
    ctx.advanceRuntimeTime?.(240);
    const snapshots = ctx.livingWorldRuntime.population.vehicleSnapshots();
    const traffic = snapshots.filter((candidate) => !candidate.promoted && allowed.has(candidate.variant?.bodyStyle) &&
      parked.every((vehicle) => Math.hypot(vehicle.x - candidate.x, vehicle.z - candidate.z) > 9))
      .sort((a, b) => Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z))[0];
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
    // Crossing the population relocation boundary intentionally hides actors
    // for 1.25 s. Follow the selected car through that bounded hide window so
    // this verifies interaction yield rather than depending on prior visibility.
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
    const target = pedestrians.find((entry) => !entry.promoted && !entry.reaction) || pedestrians.find((entry) => !entry.promoted);
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
  const promotedWitness = civicEvidence.urban.interactiveNpcs.find((npc) => npc.sourceAgentId === civicEvidence.pedestrian.id);
  assert.ok(promotedWitness, 'the reporting witness was not promoted to a close-range NPC');
  assert.equal(promotedWitness.reaction, 'reporting');
  assert.equal(civicEvidence.status.visible, true);
  assert.ok(civicEvidence.status.right <= 1440 && civicEvidence.status.width <= 320);
  await page.screenshot({ path: path.join(outputDir, '05-witnessed-civic-response.png') });
  const responderEvidence = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    for (let index = 0; index < 46; index += 1) ctx.advanceRuntimeTime?.(160);
    const state = JSON.parse(globalThis.render_game_to_text()).urbanSandbox;
    const responder = state.responders?.responders?.[0];
    if (!responder) throw new Error(`No responder was rendered after dispatch: ${JSON.stringify(state.responders)}`);
    const visual = ctx.urbanSandboxRuntime.group.children.find((entry) => String(entry?.userData?.vehicleId || '').startsWith('urban-responder:'));
    if (!visual) throw new Error('Responder state existed without its close-range vehicle visual');
    const forwardX = Math.sin(responder.yaw);
    const forwardZ = Math.cos(responder.yaw);
    ctx.camera.position.set(responder.x - forwardX * 10 + 5, responder.y + 4.5, responder.z - forwardZ * 10 + 5);
    ctx.camera.lookAt(responder.x, responder.y, responder.z);
    ctx.camera.updateMatrixWorld(true);
    let meshCount = 0;
    let lightbarParts = 0;
    visual.traverse((entry) => {
      if (entry?.isMesh) meshCount += 1;
      if (/Responder (red|blue) light/.test(String(entry?.name || ''))) lightbarParts += 1;
    });
    const status = document.getElementById('urbanCivicStatus');
    const rect = status.getBoundingClientRect();
    return {
      phase: state.civicResponse.phase,
      worldLoadSequence: state.worldLoadSequence,
      response: state.responders,
      visual: {
        meshCount,
        lightbarParts,
        vehicleId: visual.userData.vehicleId
      },
      status: {
        visible: getComputedStyle(status).display !== 'none',
        title: document.getElementById('urbanCivicStatusTitle')?.textContent || '',
        detail: document.getElementById('urbanCivicStatusDetail')?.textContent || '',
        right: rect.right,
        width: rect.width
      }
    };
  });
  assert.equal(responderEvidence.phase, 'searching');
  assert.ok(responderEvidence.response.activeCount >= 1 && responderEvidence.response.activeCount <= 2,
    `desktop responder budget invalid: ${JSON.stringify(responderEvidence.response)}`);
  assert.equal(responderEvidence.response.responders[0].agencyType, 'civic');
  assert.ok(['dispatched', 'pursuit', 'searching'].includes(responderEvidence.response.phase));
  assert.ok(responderEvidence.visual.meshCount >= 38, 'responder vehicle fell back to a low-detail shell');
  assert.equal(responderEvidence.visual.lightbarParts, 2, 'responder vehicle has no working two-color lightbar');
  assert.equal(responderEvidence.worldLoadSequence, trafficPrepared.worldLoadSequence, 'responder dispatch reloaded the world');
  assert.equal(responderEvidence.status.visible, true);
  assert.ok(responderEvidence.status.right <= 1440 && responderEvidence.status.width <= 320);
  await page.screenshot({ path: path.join(outputDir, '06-responder-dispatch.png') });
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
  assert.ok(promotedTraffic.living.activePopulation.promotedPedestrians >= 1 && promotedTraffic.living.activePopulation.promotedPedestrians <= 3);
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

  const responderOutcome = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const before = JSON.parse(globalThis.render_game_to_text()).urbanSandbox;
    const responder = before.responders?.responders?.[0];
    if (!responder) throw new Error('Responder disappeared before contact outcome verification');
    Object.assign(ctx.Walk.state.walker, {
      x: responder.x + 2,
      z: responder.z + 2,
      y: responder.y + .5,
      vx: 0,
      vz: 0,
      vy: 0
    });
    ctx.Walk.state.characterMesh?.position.set(responder.x + 2, responder.y - 1.2, responder.z + 2);
    if (ctx.car) {
      ctx.car.x = responder.x + 2;
      ctx.car.z = responder.z + 2;
      ctx.car.speed = 0;
      ctx.car.vFwd = 0;
      ctx.car.vLat = 0;
    }
    for (let index = 0; index < 16; index += 1) ctx.advanceRuntimeTime?.(250);
    return JSON.parse(globalThis.render_game_to_text()).urbanSandbox;
  });
  assert.equal(responderOutcome.lastCivicOutcome?.type, 'warning');
  assert.equal(responderOutcome.civicResponse.phase, 'clear');
  assert.equal(responderOutcome.responders.phase, 'returning');
  assert.equal(responderOutcome.worldLoadSequence, trafficPrepared.worldLoadSequence, 'responder contact reloaded the world');
  await page.screenshot({ path: path.join(outputDir, '07-responder-contact-outcome.png') });

  const disposal = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const disposed = ctx.disposeUrbanSandboxRuntime?.('browser-lifecycle-check') === true;
    return {
      disposed,
      active: JSON.parse(globalThis.render_game_to_text()).urbanSandbox.active,
      equippedRoots: ctx.Walk.state.characterMesh?.getObjectsByProperty?.('name', 'Urban equipped item')?.length || 0,
      promptVisible: document.getElementById('urbanVehiclePrompt')?.classList.contains('show') || false,
      equipmentVisible: document.getElementById('urbanEquipment')?.classList.contains('show') || false
    };
  });
  assert.deepEqual(disposal, { disposed: true, active: false, equippedRoots: 0, promptVisible: false, equipmentVisible: false });

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
    const { vehicleDoorPosition } = await import('/app/js/urban-sandbox/vehicle-model.js?v=2');
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
  await mobilePage.locator('#urbanEquipmentToggle').waitFor({ state: 'visible', timeout: 5000 });
  await mobilePage.locator('#urbanEquipmentToggle').tap();
  await mobilePage.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 5000 });
  const mobileEquipment = await mobilePage.locator('#urbanEquipment').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, slots: element.querySelectorAll('[data-equipment-id]').length };
  });
  assert.equal(mobileEquipment.slots, 5);
  assert.ok(mobileEquipment.left >= 0 && mobileEquipment.right <= 390 && mobileEquipment.width <= 370,
    `mobile equipment exceeds viewport: ${JSON.stringify(mobileEquipment)}`);
  await mobilePage.locator('#urbanEquipmentToggle').tap();
  const mobileCivic = await mobilePage.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.urbanSandboxRuntime.civic.clear();
    const pedestrian = ctx.livingWorldRuntime.population.pedestrianSnapshots().find((entry) => !entry.promoted);
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
    equipmentPanel,
    npcInteraction: {
      npcId: npcPrepared.id,
      lastNpcAction: npcInteraction.lastNpcAction,
      equipment: npcInteraction.equipment.equippedId
    },
    furnitureImpact,
    civicResponse: civicEvidence,
    responderDispatch: responderEvidence,
    responderOutcome: {
      outcome: responderOutcome.lastCivicOutcome,
      civicPhase: responderOutcome.civicResponse.phase,
      responderPhase: responderOutcome.responders.phase,
      worldLoadSequence: responderOutcome.worldLoadSequence
    },
    witnessView,
    disposal,
    mobile: { prompt: mobilePrompt, equipment: mobileEquipment, civic: mobileCivic, enteredAndExited: true, worldLoadSequence: mobileExited.worldLoadSequence },
    providerWarnings: providerWarnings.slice(0, 20),
    fatalErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
