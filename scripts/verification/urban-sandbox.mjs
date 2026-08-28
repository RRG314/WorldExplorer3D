import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const requestedScope = String(process.env.WE3D_URBAN_SCOPE || 'all').trim().toLowerCase();
assert.ok(['all', 'arrest', 'medical', 'vehicle'].includes(requestedScope),
  `Unsupported WE3D_URBAN_SCOPE: ${requestedScope}`);
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4410, 4411, 4412] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'urban-sandbox',
  requestedScope === 'all' ? 'report.json' : `report-${requestedScope}.json`);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

function bindEvidence(page) {
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) {
      localFailures.push({ reason: request.failure()?.errorText || 'failed', url: request.url() });
    }
  });
}

const diagnostics = (page) => page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});

function wrapYaw(value) {
  let result = Number(value) || 0;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

async function inputStep(page, key, milliseconds) {
  await page.keyboard.down(key);
  await page.evaluate((duration) => globalThis.advanceTime?.(duration), milliseconds);
  await page.keyboard.up(key);
}

async function actorState(page, target = null) {
  return page.evaluate((point) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor || {};
    const position = actor.position || {};
    return {
      x: Number(position.x),
      z: Number(position.z),
      yaw: Number(actor.orientation?.yaw),
      cameraYaw: Number(actor.orientation?.yaw) + Number(state.cameraFollow?.signedHeadingOffsetDegrees || 0) * Math.PI / 180,
      mode: actor.mode,
      distance: point ? Math.hypot(Number(point.x) - Number(position.x), Number(point.z) - Number(position.z)) : 0,
      interaction: state.urbanSandbox?.interaction || null,
      custody: state.urbanSandbox?.custody || null
    };
  }, target);
}

async function turnToward(page, target, tolerance = 0.11, maxSteps = 160, options = {}) {
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await actorState(page, target);
    if (state.custody?.active) return state;
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) <= tolerance) return state;
    if (options.keepMoving === true) await page.keyboard.down('ArrowUp');
    await inputStep(page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', 55);
    if (options.keepMoving === true) await page.keyboard.up('ArrowUp');
  }
  const final = await actorState(page, target);
  const desired = Math.atan2(Number(target.x) - final.x, Number(target.z) - final.z);
  throw new Error(`Could not face target ${JSON.stringify(target)} with normal walking input: ${JSON.stringify({ final, desired, delta: wrapYaw(desired - final.yaw) })}`);
}

async function turnCameraToward(page, target, tolerance = 0.11, maxSteps = 160) {
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await actorState(page, target);
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.cameraYaw);
    if (Math.abs(delta) <= tolerance) return state;
    await inputStep(page, delta > 0 ? 'KeyA' : 'KeyD', 55);
  }
  const final = await actorState(page, target);
  const desired = Math.atan2(Number(target.x) - final.x, Number(target.z) - final.z);
  throw new Error(`Could not aim the camera reticle at ${JSON.stringify(target)} with normal look input: ${JSON.stringify({ final, desired, delta: wrapYaw(desired - final.cameraYaw) })}`);
}

async function walkTo(page, target, options = {}) {
  const stopDistance = Number(options.stopDistance ?? 0.75);
  const maxSteps = Number(options.maxSteps ?? 1_200);
  const interactionVehicleId = String(options.interactionVehicleId || '');
  let previousDistance = Infinity;
  let stagnant = 0;
  let start = null;
  let detourCount = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await actorState(page, target);
    start ||= state;
    if (interactionVehicleId && state.interaction?.action === 'enter_vehicle') {
      const current = await diagnostics(page);
      if (current.urbanSandbox?.nearbyVehicleId === interactionVehicleId) {
        return { reached: true, byInteraction: true, start, final: state, steps: step };
      }
    }
    if (state.distance <= stopDistance) return { reached: true, byInteraction: false, start, final: state, steps: step };
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) > 0.13) {
      await inputStep(page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', 55);
    } else {
      if (state.distance > 20) await page.keyboard.down('ShiftLeft');
      await inputStep(page, 'ArrowUp', state.distance > 20 ? 145 : 95);
      if (state.distance > 20) await page.keyboard.up('ShiftLeft');
    }
    stagnant = state.distance >= previousDistance - 0.008 ? stagnant + 1 : 0;
    previousDistance = state.distance;
    if (stagnant > Number(options.stagnantLimit ?? 85) && options.detour === true && detourCount < 8) {
      const side = detourCount % 2 === 0 ? 1 : -1;
      detourCount += 1;
      const tangent = {
        x: state.x + Math.sin(desired + side * Math.PI / 2) * 9,
        z: state.z + Math.cos(desired + side * Math.PI / 2) * 9
      };
      const turned = await turnToward(page, tangent, .16, 160).then(() => true, () => false);
      if (!turned) {
        stagnant = 0;
        previousDistance = Infinity;
        continue;
      }
      if (state.distance > 20) await page.keyboard.down('ShiftLeft');
      await inputStep(page, 'ArrowUp', Math.max(900, Math.min(5_200, state.distance * 125)));
      if (state.distance > 20) await page.keyboard.up('ShiftLeft');
      stagnant = 0;
      previousDistance = Infinity;
      continue;
    }
    if (stagnant > Number(options.stagnantLimit ?? 85)) {
      return { reached: false, blocked: true, start, final: state, steps: step };
    }
  }
  return { reached: false, blocked: false, start, final: await actorState(page, target), steps: maxSteps };
}

async function launchBaltimore(page) {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.livingWorld?.active === true && state.urbanSandbox?.active === true &&
      Number(state.urbanSandbox?.vehicleCount || 0) > 0;
  }, null, { timeout: 360_000 });
  await page.waitForTimeout(2_000);
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return diagnostics(page);
}

async function nearestVehicle(page) {
  return page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    return (state.urbanSandbox?.vehicles || [])
      .filter((vehicle) => vehicle.source === 'deterministic-parked-vehicle' &&
        !vehicle.attachedToPlayer && !vehicle.occupied && vehicle.driverDoor)
      .map((vehicle) => ({ ...vehicle, distance: Math.hypot(vehicle.driverDoor.x - actor.x, vehicle.driverDoor.z - actor.z) }))
      .sort((left, right) => left.distance - right.distance)[0] || null;
  });
}

async function equipmentItem(page, id) {
  const state = await diagnostics(page);
  return state.urbanSandbox?.equipment?.items?.find((entry) => entry.id === id) || null;
}

async function equip(page, id) {
  const item = await equipmentItem(page, id);
  assert.ok(item?.instanceId, `Backpack does not contain ${id}.`);
  await page.keyboard.press('KeyI');
  await page.waitForSelector('#urbanEquipment.show', { timeout: 5_000 });
  await page.locator(`#urbanEquipment [data-equipment-id="${item.instanceId}"]`).first().click();
  const equipAction = page.locator(
    `#urbanBackpackDetail [data-backpack-action="equip"][data-equipment-id="${item.instanceId}"]`
  );
  await equipAction.waitFor({ state: 'visible', timeout: 5_000 });
  await equipAction.click();
  await page.waitForFunction((catalogId) => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.equipment?.equippedId === catalogId, id, { timeout: 5_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('urbanEquipment')?.classList.contains('show'), null, { timeout: 5_000 });
}

async function useProjectile(page, id) {
  const before = await equipmentItem(page, id);
  await page.keyboard.press('KeyV');
  await page.waitForFunction((equipmentId) => {
    const action = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime?.lastProjectileAction;
    return action?.equipmentId === equipmentId && action.phase === 'impact';
  }, id, { timeout: 8_000 });
  const after = await equipmentItem(page, id);
  return { before, after, state: await diagnostics(page) };
}

async function walkNearAmbientWitness(page, stopDistance = 5) {
  try {
    await page.waitForFunction(() => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox || {};
      return Number(urban.ambientPedestrians?.length || 0) + Number(urban.interactiveNpcs?.length || 0) > 0;
    }, null, { timeout: 20_000 });
  } catch (error) {
    const state = await diagnostics(page);
    console.error('CP5 population readiness evidence', JSON.stringify({
      activeActor: state.activeActor,
      livingWorld: state.livingWorld,
      urbanSandbox: state.urbanSandbox,
      paused: state.paused,
      gameStarted: state.gameStarted,
      worldLoading: state.worldLoading
    }, null, 2));
    throw error;
  }
  const selectWitness = (preferredId = '', excludedIds = []) => page.evaluate(({ targetId, excluded }) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    const ambient = (state.urbanSandbox?.ambientPedestrians || []).map((entry) => ({
      ...entry,
      detailed: false
    }));
    const promoted = (state.urbanSandbox?.interactiveNpcs || []).map((entry) => ({
      id: entry.sourceAgentId || entry.id,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      yaw: entry.yaw,
      distance: Math.hypot(Number(entry.x) - Number(actor.x), Number(entry.z) - Number(actor.z)),
      detailed: true
    }));
    const candidates = [...ambient, ...promoted]
      .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.z) && !excluded.includes(String(entry.id)))
      .sort((left, right) => Number(right.detailed) - Number(left.detailed) ||
        Number(left.distance ?? Infinity) - Number(right.distance ?? Infinity));
    return targetId
      ? candidates.find((entry) => String(entry.id) === String(targetId)) || null
      : candidates[0] || null;
  }, { targetId: preferredId, excluded: excludedIds });
  let witness = await selectWitness();
  assert.ok(witness, 'The loaded Baltimore world did not publish a simulated pedestrian witness.');
  let witnessId = String(witness.id || '');
  const excludedWitnessIds = new Set();
  const deadline = Date.now() + 70_000;
  let approach = null;
  const trace = [];
  while (Date.now() < deadline) {
    witness = await selectWitness(witnessId);
    if (!witness) {
      excludedWitnessIds.add(witnessId);
      witness = await selectWitness('', [...excludedWitnessIds]);
      assert.ok(witness, 'Every published simulated pedestrian disappeared before interaction.');
      witnessId = String(witness.id || '');
    }
    const actor = await actorState(page, witness);
    if (actor.distance <= stopDistance) return { witness, approach: { ...approach, reached: true, final: actor } };
    approach = await walkTo(page, witness, {
      stopDistance,
      maxSteps: 90,
      stagnantLimit: 18,
      detour: true
    });
    if (approach.reached) return { witness: await selectWitness(witnessId), approach };
    trace.push({ witnessId, detailed: witness.detailed, actor, approach });
    if (!approach.blocked) continue;
    excludedWitnessIds.add(witnessId);
    const replacement = await selectWitness('', [...excludedWitnessIds]);
    if (replacement) {
      witness = replacement;
      witnessId = String(replacement.id || '');
    }
  }
  assert.fail(`Normal walking input could not reach a simulated pedestrian witness: ${JSON.stringify(trace.slice(-4))}`);
}

async function triggerWitnessedWeaponResponse(page) {
  // A sidearm discharge is audible within 34 m. This journey verifies that
  // witness rule; unlike melee, it must not require face-to-face contact.
  const witnessApproach = await walkNearAmbientWitness(page, 24);
  await equip(page, 'pulse-sidearm');
  const actor = await actorState(page);
  const awayX = actor.x - Number(witnessApproach.witness.x);
  const awayZ = actor.z - Number(witnessApproach.witness.z);
  const awayLength = Math.max(.001, Math.hypot(awayX, awayZ));
  await turnCameraToward(page, {
    x: actor.x + awayX / awayLength * 20,
    z: actor.z + awayZ / awayLength * 20
  });
  const projectile = await useProjectile(page, 'pulse-sidearm');
  await page.waitForFunction(() => {
    const civic = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.civicResponse;
    return Number(civic?.level || 0) >= 2 && Number(civic?.lastEvent?.witnessCount || 0) > 0;
  }, null, { timeout: 8_000 });
  return { witnessApproach, projectile, state: await diagnostics(page) };
}

async function triggerWitnessedAssaultResponse(page) {
  const witnessApproach = await walkNearAmbientWitness(page, 1.7);
  await equip(page, 'hands');
  await turnToward(page, witnessApproach.witness);
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => {
    const civic = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.civicResponse;
    return Number(civic?.level || 0) >= 1 && civic?.lastEvent?.kind === 'assault' && Number(civic?.lastEvent?.witnessCount || 0) > 0;
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(700);
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => {
    const civic = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.civicResponse;
    return Number(civic?.level || 0) >= 2 && civic?.lastEvent?.kind === 'assault' && Number(civic?.lastEvent?.witnessCount || 0) > 0;
  }, null, { timeout: 5_000 });
  return { witnessApproach, state: await diagnostics(page) };
}

async function chaseOfficerUntilCustody(page, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await diagnostics(page);
    if (state.urbanSandbox?.custody?.active) return state;
    const officers = (state.urbanSandbox?.responders?.responders || []).map((entry) => entry.officer).filter(Boolean);
    if (!officers.length) {
      await page.waitForTimeout(250);
      continue;
    }
    const actor = state.activeActor?.position || {};
    const officer = officers.sort((a, b) =>
      Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z))[0];
    await walkTo(page, officer, { stopDistance: 1.35, maxSteps: 60, stagnantLimit: 16, detour: true });
    await page.waitForTimeout(120);
  }
  return diagnostics(page);
}

async function meetResponderUntilOfficer(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  const trace = [];
  while (Date.now() < deadline) {
    const state = await diagnostics(page);
    const responders = state.urbanSandbox?.responders?.responders || [];
    if (responders.some((entry) => !!entry.officer)) return state;
    const responder = responders.slice().sort((left, right) =>
      Number(left.distanceToActor ?? Infinity) - Number(right.distanceToActor ?? Infinity))[0] || null;
    trace.push({
      civicPhase: state.urbanSandbox?.civicResponse?.phase || '',
      civicRemaining: Number(state.urbanSandbox?.civicResponse?.phaseRemaining || 0),
      responsePhase: state.urbanSandbox?.responders?.phase || '',
      responderCount: responders.length,
      distanceToActor: responder?.distanceToActor ?? null,
      speed: responder?.speed ?? null
    });
    // The response vehicle owns this approach. Moving toward it continually
    // changes its destination and does not represent a player holding at the
    // reported incident while a dispatched unit arrives.
    await page.evaluate(() => globalThis.advanceTime?.(240));
    await page.waitForTimeout(60);
  }
  const final = await diagnostics(page);
  final.__responderMeetTrace = trace.slice(-20);
  return final;
}

async function evadeOfficerUntilHospital(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  const trace = [];
  while (Date.now() < deadline) {
    const state = await diagnostics(page);
    const custodyType = state.urbanSandbox?.custody?.type || '';
    if (custodyType === 'hospital') return state;
    assert.notEqual(custodyType, 'police', 'Medical recovery journey entered police custody before incapacitation.');
    const actor = state.activeActor?.position || {};
    const officer = (state.urbanSandbox?.responders?.responders || [])
      .map((entry) => entry.officer).filter(Boolean)
      .sort((left, right) => Math.hypot(left.x - actor.x, left.z - actor.z) - Math.hypot(right.x - actor.x, right.z - actor.z))[0];
    if (!officer) {
      await page.waitForTimeout(100);
      continue;
    }
    const dx = Number(actor.x) - Number(officer.x);
    const dz = Number(actor.z) - Number(officer.z);
    const distance = Math.hypot(dx, dz);
    const radialYaw = Math.atan2(dx, dz);
    trace.push({
      distance: Number(distance.toFixed(2)),
      shotsFired: Number(officer.shotsFired || 0),
      playerCondition: Number(state.urbanSandbox?.playerCondition ?? 1)
    });
    if (distance < 9) {
      const retreat = {
        x: Number(actor.x) + Math.sin(radialYaw) * 14,
        z: Number(actor.z) + Math.cos(radialYaw) * 14
      };
      await turnToward(page, retreat, .18, 45, { keepMoving: true });
      await inputStep(page, 'ArrowUp', 520);
    } else if (distance > 20) {
      const approach = {
        x: Number(actor.x) - Math.sin(radialYaw) * 14,
        z: Number(actor.z) - Math.cos(radialYaw) * 14
      };
      await turnToward(page, approach, .18, 45, { keepMoving: true });
      await inputStep(page, 'ArrowUp', 260);
    } else {
      // Hold briefly in the officer's real firing lane so the projectile path
      // can resolve, then retreat before contact can become an arrest.
      await page.evaluate(() => globalThis.advanceTime?.(420));
      await inputStep(page, 'ArrowUp', 80);
    }
    await page.waitForTimeout(45);
  }
  const final = await diagnostics(page);
  final.__medicalTrace = trace.slice(-16);
  return final;
}

async function continueFromCustody(page) {
  await page.waitForSelector('#caughtScreen.show', { timeout: 5_000 });
  await page.locator('#caughtBtn').click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return !state.urbanSandbox?.custody && state.paused === false && state.activeActor?.mode === 'walk';
  }, null, { timeout: 10_000 });
  return diagnostics(page);
}

async function runVehicleEquipmentJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  bindEvidence(page);
  try {
    const ready = await launchBaltimore(page);
    const vehicle = await nearestVehicle(page);
    assert.ok(vehicle, 'Baltimore did not publish an enterable urban vehicle.');
    const approach = await walkTo(page, vehicle.driverDoor, { interactionVehicleId: vehicle.id });
    assert.equal(approach.reached, true, 'Normal walking input could not reach the vehicle door prompt.');
    await page.keyboard.press('KeyE');
    await page.waitForFunction((vehicleId) => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      const current = urban?.vehicles?.find((entry) => entry.id === vehicleId);
      return urban?.phase === 'enter' && Math.abs(Number(current?.driverDoor?.openRadians || 0)) > 0.05;
    }, vehicle.id, { timeout: 5_000 });
    const entering = await diagnostics(page);
    await page.waitForFunction((vehicleId) => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      return urban?.phase === 'driving' && urban.activeVehicleId === vehicleId;
    }, vehicle.id, { timeout: 8_000 });
    const entered = await diagnostics(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1_250);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    await page.keyboard.up('Space');
    const driven = await diagnostics(page);
    const enteredVehicle = entered.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);
    const drivenVehicle = driven.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);
    const drivenMeters = Math.hypot(drivenVehicle.x - enteredVehicle.x, drivenVehicle.z - enteredVehicle.z);
    await page.keyboard.press('KeyE');
    await page.waitForFunction((vehicleId) => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      const current = urban?.vehicles?.find((entry) => entry.id === vehicleId);
      return urban?.phase === 'exit' && Math.abs(Number(current?.driverDoor?.openRadians || 0)) > 0.05;
    }, vehicle.id, { timeout: 5_000 });
    const exiting = await diagnostics(page);
    await page.waitForFunction((vehicleId) => {
      const urban = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      const current = urban?.vehicles?.find((entry) => entry.id === vehicleId);
      return urban?.phase === 'walking' && !urban.activeVehicleId && current?.attachedToPlayer === false;
    }, vehicle.id, { timeout: 8_000 });
    const exited = await diagnostics(page);
    const retainedVehicle = exited.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);

    const collisionProbe = await walkTo(page, { x: retainedVehicle.x, z: retainedVehicle.z }, {
      stopDistance: 0.15, maxSteps: 260, stagnantLimit: 55
    });
    const minimumVehicleRadius = Math.max(0.8, Number(retainedVehicle.dimensionsMeters?.width || 1.8) * 0.42);
    assert.equal(collisionProbe.reached, false, 'Walking collision allowed the player into the parked vehicle center.');
    assert.ok(collisionProbe.final.distance >= minimumVehicleRadius, 'Parked vehicle collision stopped inside the visual body.');
    await turnToward(page, retainedVehicle);

    const equipmentResults = {};
    await equip(page, 'hands');
    const handsBefore = (await diagnostics(page)).urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id).condition;
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(700);
    const handsAfter = (await diagnostics(page)).urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id).condition;
    equipmentResults.hands = { before: handsBefore, after: handsAfter };

    await equip(page, 'flashlight');
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.equipment?.flashlightEnabled === true, null, { timeout: 3_000 });
    equipmentResults.flashlight = await equipmentItem(page, 'flashlight');

    await equip(page, 'baton');
    await turnToward(page, retainedVehicle);
    const batonBefore = (await diagnostics(page)).urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id).condition;
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(700);
    const batonAfter = (await diagnostics(page)).urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id).condition;
    equipmentResults.baton = { before: batonBefore, after: batonAfter };

    for (const id of ['pulse-sidearm', 'laser-gun', 'paintball-gun']) {
      await equip(page, id);
      await turnToward(page, retainedVehicle);
      equipmentResults[id] = await useProjectile(page, id);
      await page.waitForTimeout(400);
    }

    await equip(page, 'concussion-charge');
    const chargeBefore = await equipmentItem(page, 'concussion-charge');
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime?.lastProjectileAction?.equipmentId === 'concussion-charge' && globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.projectileRuntime?.lastProjectileAction?.phase === 'impact', null, { timeout: 8_000 });
    const chargeAfter = await equipmentItem(page, 'concussion-charge');
    equipmentResults['concussion-charge'] = { before: chargeBefore, after: chargeAfter };

    await equip(page, 'parachute');
    const parachuteBefore = await diagnostics(page);
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(250);
    const parachuteGroundRecovery = await diagnostics(page);

    return {
      ready,
      vehicle,
      approach,
      entering,
      entered,
      driven,
      drivenMeters,
      exiting,
      exited,
      retainedVehicle,
      collisionProbe,
      equipmentResults,
      parachuteBefore: parachuteBefore.urbanSandbox.parachute,
      parachuteGroundRecovery: parachuteGroundRecovery.urbanSandbox.parachute
    };
  } finally {
    await context.close();
  }
}

async function runArrestRecoveryJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  bindEvidence(page);
  try {
    await launchBaltimore(page);
    const witnessedResponse = await triggerWitnessedAssaultResponse(page);
    await page.waitForFunction(() => Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.responders?.activeCount || 0) > 0, null, { timeout: 45_000 });
    const responderArrived = await meetResponderUntilOfficer(page);
    assert.ok(responderArrived.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer), 'Normal walking input could not meet a dispatched responder.');
    const custody = await chaseOfficerUntilCustody(page);
    if (custody.urbanSandbox?.custody?.type !== 'police') {
      console.error('CP5 arrest contact evidence', JSON.stringify({
        activeActor: custody.activeActor,
        civicResponse: custody.urbanSandbox?.civicResponse,
        responders: custody.urbanSandbox?.responders,
        custody: custody.urbanSandbox?.custody,
        lastCivicOutcome: custody.urbanSandbox?.lastCivicOutcome,
        lastImpactAction: custody.urbanSandbox?.lastImpactAction,
        playerCondition: custody.urbanSandbox?.playerCondition
      }, null, 2));
    }
    assert.equal(custody.urbanSandbox?.custody?.type, 'police', 'Responder contact did not resolve to a mapped police custody path.');
    const recovered = await continueFromCustody(page);
    return { witnessedResponse, responderArrived, custody, recovered };
  } finally {
    await context.close();
  }
}

async function runMedicalRecoveryJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  bindEvidence(page);
  try {
    await launchBaltimore(page);
    const witnessedResponse = await triggerWitnessedWeaponResponse(page);
    await page.waitForFunction(() => Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.responders?.activeCount || 0) > 0, null, { timeout: 45_000 });
    const before = await meetResponderUntilOfficer(page, 50_000);
    if (!before.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer)) {
      console.error('CP5 responder arrival evidence', JSON.stringify({
        activeActor: before.activeActor,
        civicResponse: before.urbanSandbox?.civicResponse,
        responders: before.urbanSandbox?.responders,
        trace: before.__responderMeetTrace
      }, null, 2));
    }
    assert.ok(before.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer), 'Normal walking input could not meet the medical recovery responder.');
    const custody = await evadeOfficerUntilHospital(page);
    if (custody.urbanSandbox?.custody?.type !== 'hospital') {
      console.error('CP5 medical contact evidence', JSON.stringify({
        activeActor: custody.activeActor,
        civicResponse: custody.urbanSandbox?.civicResponse,
        responders: custody.urbanSandbox?.responders,
        custody: custody.urbanSandbox?.custody,
        playerCondition: custody.urbanSandbox?.playerCondition,
        projectileRuntime: custody.urbanSandbox?.projectileRuntime,
        trace: custody.__medicalTrace
      }, null, 2));
    }
    assert.equal(custody.urbanSandbox?.custody?.type, 'hospital', 'Normal movement and responder impacts did not resolve to mapped hospital recovery.');
    const recovered = await continueFromCustody(page);
    return { witnessedResponse, before, custody, recovered };
  } finally {
    await context.close();
  }
}

let report;
try {
  if (requestedScope === 'arrest') {
    console.log('[urban-sandbox] START arrest recovery');
    const arrest = await runArrestRecoveryJourney();
    const facility = arrest.custody.urbanSandbox.custody?.facility || {};
    const checks = {
      responderArrivesFromWitnessedCivicLevel:
        Number(arrest.witnessedResponse.state.urbanSandbox.civicResponse?.level || 0) >= 2 &&
        Number(arrest.responderArrived.urbanSandbox.responders?.activeCount || 0) > 0,
      arrestUsesMappedPoliceFacility:
        arrest.custody.urbanSandbox.custody?.type === 'police' && facility.provenance === 'loaded-map-poi',
      recoveryRestoresWalking:
        !arrest.recovered.urbanSandbox.custody && arrest.recovered.activeActor?.mode === 'walk' &&
        arrest.recovered.urbanSandbox.playerCondition === 1,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'urban-sandbox-arrest-scope-v1', servedRoot, checks, browserErrors, localFailures };
    console.log('[urban-sandbox] PASS arrest recovery');
  } else if (requestedScope === 'medical') {
    console.log('[urban-sandbox] START medical recovery');
    const medical = await runMedicalRecoveryJourney();
    const facility = medical.custody.urbanSandbox.custody?.facility || {};
    const civic = medical.witnessedResponse.state.urbanSandbox.civicResponse || {};
    const checks = {
      reticleDirectedDischargeIsWitnessed: Number(civic.level || 0) >= 2 && Number(civic.lastEvent?.witnessCount || 0) > 0,
      responderReachesPlayer: medical.before.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer) === true,
      incapacitationUsesMappedHospital:
        medical.custody.urbanSandbox.custody?.type === 'hospital' && facility.provenance === 'loaded-map-poi',
      recoveryRestoresWalking:
        !medical.recovered.urbanSandbox.custody && medical.recovered.activeActor?.mode === 'walk' &&
        medical.recovered.urbanSandbox.playerCondition === 1,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'urban-sandbox-medical-scope-v1', servedRoot, checks, browserErrors, localFailures };
    console.log('[urban-sandbox] PASS medical recovery');
  } else if (requestedScope === 'vehicle') {
    console.log('[urban-sandbox] START vehicle and equipment');
    const primary = await runVehicleEquipmentJourney();
    const vehicleAfterExit = primary.exited.urbanSandbox.vehicles.filter((entry) => entry.id === primary.vehicle.id);
    const checks = {
      oneVehicleIdentityAcrossDoorDriveExit:
        primary.entered.urbanSandbox.activeVehicleId === primary.vehicle.id &&
        primary.entered.urbanSandbox.vehicles.filter((entry) => entry.id === primary.vehicle.id).length === 1 &&
        vehicleAfterExit.length === 1 && vehicleAfterExit[0].attachedToPlayer === false,
      visualDoorAndActorTransition:
        Math.abs(primary.entering.urbanSandbox.vehicles.find((entry) => entry.id === primary.vehicle.id)?.driverDoor?.openRadians || 0) > 0.05 &&
        Math.abs(primary.exiting.urbanSandbox.vehicles.find((entry) => entry.id === primary.vehicle.id)?.driverDoor?.openRadians || 0) > 0.05 &&
        primary.entered.activeActor?.mode === 'drive' && primary.exited.activeActor?.mode === 'walk',
      realDrivingMovesClaimedVehicle: primary.drivenMeters > 1,
      segmentCollisionContainsPlayer: primary.collisionProbe.reached === false,
      handsAndStaffAffectSameVehicle:
        primary.equipmentResults.hands.after < primary.equipmentResults.hands.before &&
        primary.equipmentResults.baton.after < primary.equipmentResults.baton.before,
      ammunitionAndQuantitiesChangeExactlyOnce:
        ['pulse-sidearm', 'laser-gun', 'paintball-gun'].every((id) => {
          const result = primary.equipmentResults[id];
          return Number(result.after?.magazine) === Number(result.before?.magazine) - 1 && Number(result.after?.reserve) === Number(result.before?.reserve);
        }) && Number(primary.equipmentResults['concussion-charge'].after?.quantity) === Number(primary.equipmentResults['concussion-charge'].before?.quantity) - 1,
      flashlightUsesSharedBackpack: primary.equipmentResults.flashlight && primary.parachuteBefore.deployed === false,
      projectilesResolveThroughOneRuntime:
        ['pulse-sidearm', 'laser-gun', 'paintball-gun'].every((id) => primary.equipmentResults[id].state.urbanSandbox.projectileRuntime?.lastProjectileAction?.equipmentId === id),
      groundParachuteFailsSafely:
        primary.parachuteBefore.deployed === false && primary.parachuteGroundRecovery.deployed === false,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'urban-sandbox-vehicle-scope-v1', servedRoot, checks, browserErrors, localFailures };
    console.log('[urban-sandbox] PASS vehicle and equipment');
  } else {
  console.log('[urban-sandbox] START arrest recovery');
  const arrest = await runArrestRecoveryJourney();
  console.log('[urban-sandbox] PASS arrest recovery');
  console.log('[urban-sandbox] START medical recovery');
  const medical = await runMedicalRecoveryJourney();
  console.log('[urban-sandbox] PASS medical recovery');
  console.log('[urban-sandbox] START vehicle and equipment');
  const primary = await runVehicleEquipmentJourney();
  console.log('[urban-sandbox] PASS vehicle and equipment');
  const vehicleAfterExit = primary.exited.urbanSandbox.vehicles.filter((entry) => entry.id === primary.vehicle.id);
  const custodyFacility = arrest.custody.urbanSandbox.custody?.facility || {};
  const medicalFacility = medical.custody.urbanSandbox.custody?.facility || {};
  const checks = {
    oneVehicleIdentityAcrossDoorDriveExit:
      primary.entered.urbanSandbox.activeVehicleId === primary.vehicle.id &&
      primary.entered.urbanSandbox.vehicles.filter((entry) => entry.id === primary.vehicle.id).length === 1 &&
      vehicleAfterExit.length === 1 && vehicleAfterExit[0].attachedToPlayer === false,
    visualDoorAndActorTransition:
      Math.abs(primary.entering.urbanSandbox.vehicles.find((entry) => entry.id === primary.vehicle.id)?.driverDoor?.openRadians || 0) > 0.05 &&
      Math.abs(primary.exiting.urbanSandbox.vehicles.find((entry) => entry.id === primary.vehicle.id)?.driverDoor?.openRadians || 0) > 0.05 &&
      primary.entered.activeActor?.mode === 'drive' && primary.exited.activeActor?.mode === 'walk',
    realDrivingMovesClaimedVehicle: primary.drivenMeters > 1,
    segmentCollisionContainsPlayer: primary.collisionProbe.reached === false,
    handsAndStaffAffectSameVehicle:
      primary.equipmentResults.hands.after < primary.equipmentResults.hands.before &&
      primary.equipmentResults.baton.after < primary.equipmentResults.baton.before,
    flashlightUsesSharedBackpack: primary.equipmentResults.flashlight && primary.parachuteBefore.deployed === false,
    ammunitionAndQuantitiesChangeExactlyOnce:
      ['pulse-sidearm', 'laser-gun', 'paintball-gun'].every((id) => {
        const result = primary.equipmentResults[id];
        return Number(result.after?.magazine) === Number(result.before?.magazine) - 1 && Number(result.after?.reserve) === Number(result.before?.reserve);
      }) && Number(primary.equipmentResults['concussion-charge'].after?.quantity) === Number(primary.equipmentResults['concussion-charge'].before?.quantity) - 1,
    projectilesResolveThroughOneRuntime:
      ['pulse-sidearm', 'laser-gun', 'paintball-gun'].every((id) => primary.equipmentResults[id].state.urbanSandbox.projectileRuntime?.lastProjectileAction?.equipmentId === id),
    groundParachuteFailsSafely:
      primary.parachuteBefore.deployed === false && primary.parachuteGroundRecovery.deployed === false,
    responderArrivesFromWitnessedCivicLevel:
      Number(arrest.witnessedResponse.state.urbanSandbox.civicResponse?.level || 0) >= 2 &&
      Number(arrest.responderArrived.urbanSandbox.responders?.activeCount || 0) > 0,
    arrestUsesMappedPoliceFacility:
      arrest.custody.urbanSandbox.custody?.type === 'police' &&
      custodyFacility.provenance === 'loaded-map-poi',
    incapacitationUsesMappedHospital:
      medical.custody.urbanSandbox.custody?.type === 'hospital' &&
      medicalFacility.provenance === 'loaded-map-poi',
    recoveryRestoresWalkingWithoutDuplicates:
      !arrest.recovered.urbanSandbox.custody && !medical.recovered.urbanSandbox.custody &&
      arrest.recovered.activeActor?.mode === 'walk' && medical.recovered.activeActor?.mode === 'walk' &&
      arrest.recovered.urbanSandbox.playerCondition === 1 && medical.recovered.urbanSandbox.playerCondition === 1,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'urban-sandbox-normal-input-outcomes-v1',
    servedRoot,
    checks,
    evidence: {
      vehicleId: primary.vehicle.id,
      drivenMeters: primary.drivenMeters,
      collisionStopDistance: primary.collisionProbe.final.distance,
      civicLevel: arrest.witnessedResponse.state.urbanSandbox.civicResponse?.level,
      responderCount: arrest.responderArrived.urbanSandbox.responders?.activeCount,
      policeFacility: custodyFacility,
      hospitalFacility: medicalFacility
    },
    browserErrors,
    localFailures
  };
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, `Urban Sandbox ${requestedScope} normal-input journey failed.`);
} finally {
  await browser.close();
  await server.close();
}
