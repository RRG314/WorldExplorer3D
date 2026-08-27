import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4410, 4411, 4412] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'urban-sandbox', 'report.json');
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
      mode: actor.mode,
      distance: point ? Math.hypot(Number(point.x) - Number(position.x), Number(point.z) - Number(position.z)) : 0,
      interaction: state.urbanSandbox?.interaction || null,
      custody: state.urbanSandbox?.custody || null
    };
  }, target);
}

async function turnToward(page, target, tolerance = 0.11, maxSteps = 160) {
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await actorState(page, target);
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) <= tolerance) return state;
    await inputStep(page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', 55);
  }
  throw new Error(`Could not face target ${JSON.stringify(target)} with normal walking input.`);
}

async function walkTo(page, target, options = {}) {
  const stopDistance = Number(options.stopDistance ?? 0.75);
  const maxSteps = Number(options.maxSteps ?? 1_200);
  const interactionVehicleId = String(options.interactionVehicleId || '');
  let previousDistance = Infinity;
  let stagnant = 0;
  let start = null;
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
  const selectWitness = (preferredId = '') => page.evaluate((targetId) => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    const ambient = state.urbanSandbox?.ambientPedestrians || [];
    const promoted = (state.urbanSandbox?.interactiveNpcs || []).map((entry) => ({
      id: entry.sourceAgentId || entry.id,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      yaw: entry.yaw,
      distance: Math.hypot(Number(entry.x) - Number(actor.x), Number(entry.z) - Number(actor.z))
    }));
    const candidates = [...ambient, ...promoted]
      .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.z))
      .sort((left, right) => Number(left.distance || Infinity) - Number(right.distance || Infinity));
    return targetId
      ? candidates.find((entry) => String(entry.id) === String(targetId)) || null
      : candidates[0] || null;
  }, preferredId);
  let witness = await selectWitness();
  assert.ok(witness, 'The loaded Baltimore world did not publish a simulated pedestrian witness.');
  const witnessId = String(witness.id || '');
  const deadline = Date.now() + 40_000;
  let approach = null;
  while (Date.now() < deadline) {
    witness = await selectWitness(witnessId);
    assert.ok(witness, 'The selected simulated pedestrian disappeared from both LOD representations.');
    const actor = await actorState(page, witness);
    if (actor.distance <= stopDistance) return { witness, approach: { ...approach, reached: true, final: actor } };
    approach = await walkTo(page, witness, { stopDistance, maxSteps: 35, stagnantLimit: 24 });
    if (approach.reached) return { witness: await selectWitness(witnessId), approach };
  }
  assert.fail('Normal walking input could not follow a simulated pedestrian witness.');
}

async function triggerWitnessedWeaponResponse(page) {
  const witnessApproach = await walkNearAmbientWitness(page);
  await equip(page, 'pulse-sidearm');
  await turnToward(page, {
    x: witnessApproach.witness.x + Math.sin(Number(witnessApproach.witness.yaw || 0)) * 20,
    z: witnessApproach.witness.z + Math.cos(Number(witnessApproach.witness.yaw || 0)) * 20
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
    await walkTo(page, officer, { stopDistance: 1.35, maxSteps: 30, stagnantLimit: 20 });
    await page.waitForTimeout(120);
  }
  return diagnostics(page);
}

async function meetResponderUntilOfficer(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await diagnostics(page);
    const responders = state.urbanSandbox?.responders?.responders || [];
    if (responders.some((entry) => !!entry.officer)) return state;
    const actor = state.activeActor?.position || {};
    const responder = responders.slice().sort((left, right) =>
      Math.hypot(left.x - actor.x, left.z - actor.z) - Math.hypot(right.x - actor.x, right.z - actor.z))[0];
    if (!responder) {
      await page.waitForTimeout(200);
      continue;
    }
    await walkTo(page, responder, { stopDistance: 9, maxSteps: 35, stagnantLimit: 20 });
    await page.waitForTimeout(120);
  }
  return diagnostics(page);
}

async function evadeOfficerUntilHospital(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let orbitDirection = 1;
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
    const movementYaw = distance < 7 ? radialYaw : distance > 25 ? radialYaw + Math.PI : radialYaw + orbitDirection * Math.PI * .5;
    const target = { x: Number(actor.x) + Math.sin(movementYaw) * 12, z: Number(actor.z) + Math.cos(movementYaw) * 12 };
    await turnToward(page, target, .18, 35);
    await inputStep(page, 'ArrowUp', 85);
    await page.waitForTimeout(70);
    if (distance < 5 || distance > 29) orbitDirection *= -1;
  }
  return diagnostics(page);
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
    assert.ok(before.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer), 'Normal walking input could not meet the medical recovery responder.');
    const custody = await evadeOfficerUntilHospital(page);
    assert.equal(custody.urbanSandbox?.custody?.type, 'hospital', 'Normal movement and responder impacts did not resolve to mapped hospital recovery.');
    const recovered = await continueFromCustody(page);
    return { witnessedResponse, before, custody, recovered };
  } finally {
    await context.close();
  }
}

let report;
try {
  const arrest = await runArrestRecoveryJourney();
  const medical = await runMedicalRecoveryJourney();
  const primary = await runVehicleEquipmentJourney();
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
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Urban Sandbox normal-input journey failed.');
} finally {
  await browser.close();
  await server.close();
}
