import { vehicleApproachWaypoints } from './vehicle-approach-waypoints.mjs';
import { installRecordedOverpassFixture } from './recorded-overpass-fixture.mjs';
import { softwareCompositorArgs } from './software-compositor.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { advanceGameplay, stepGameplayKeys, enterNearbyVehicle, exitActiveVehicle } from './gameplay-simulation.mjs';
import { selectLowRenderQuality } from './render-quality-ui.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const requestedScope = String(process.argv.find(arg => arg.startsWith('--scope='))?.slice(8) || process.env.WE3D_URBAN_SCOPE || 'all').trim().toLowerCase();
assert.ok(['all', 'arrest', 'medical', 'vehicle'].includes(requestedScope),
  `Unsupported WE3D_URBAN_SCOPE: ${requestedScope}`);
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4410, 4411, 4412] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'urban-sandbox',
  requestedScope === 'all' ? 'report.json' : `report-${requestedScope}.json`);
const browserErrors = [];
const localFailures = [];

async function createJourneyBrowser({ recordedVehicles = false } = {}) {
  const browser = await chromium.launch({
    headless: true, channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024', ...softwareCompositorArgs()]
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: process.env.CI ? 0.5 : 1 });
    const providerFixture = recordedVehicles ? await installRecordedOverpassFixture(context, 'desktop') : null;
    const page = await context.newPage();
    await configureStagingAppCheck(page, baseUrl);
    return { browser, context, page, providerFixture };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function saveJourneyFailure(page, journey, error) {
  const directory = path.join(root, 'output', 'release-evidence', 'current', 'urban-sandbox');
  await mkdir(directory, { recursive: true });
  const state = await diagnostics(page).catch(() => null);
  await writeFile(path.join(directory, `${journey}-failure.json`), JSON.stringify({
    ok: false, journey, error: String(error?.stack || error), state, browserErrors, localFailures
  }, null, 2));
  await page.screenshot({ path: path.join(directory, `${journey}-failure.png`), timeout: 10000 }).catch(() => {});
}

function bindEvidence(page) {
  collectBrowserGraphicsErrors(page, browserErrors);
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
  try {
    return await stepGameplayKeys(page, key, milliseconds);
  } catch (error) {
    // Contact can open custody between the navigation observation and input.
    // Stop at that real outcome; never blur or drive through the custody UI.
    const state = await actorState(page);
    if (state.custody?.active && /focused UI control|Navigation simulation did not advance/.test(String(error))) {
      return { interruptedBy: 'custody', custody: state.custody };
    }
    throw error;
  }
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

async function turnToward(page, target, tolerance = 0.16, maxSteps = 160, options = {}) {
  for (let step = 0; step < maxSteps; step += 1) {
    if (Date.now() >= (options.deadline || Infinity)) break;
    const state = await actorState(page, target);
    if (state.custody?.active) return state;
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) <= tolerance) return state;
    // Bound turns by the remaining angle. Every fixed physics step runs;
    // fewer final-frame readbacks keep software CI navigation practical.
    const turnDurationMs = Math.max(16, Math.min(600, Math.abs(delta) / 2.6 * 800));
    const turnKey = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
    await inputStep(page, options.keepMoving === true ? ['ArrowUp', turnKey] : turnKey, turnDurationMs);
  }
  const final = await actorState(page, target);
  const desired = Math.atan2(Number(target.x) - final.x, Number(target.z) - final.z);
  throw new Error(`Could not face target ${JSON.stringify(target)} with normal walking input: ${JSON.stringify({ final, desired, delta: wrapYaw(desired - final.yaw) })}`);
}

async function turnCameraToward(page, target, tolerance = 0.16, maxSteps = 160) {
  for (let step = 0; step < maxSteps; step += 1) {
    const state = await actorState(page, target);
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.cameraYaw);
    if (Math.abs(delta) <= tolerance) return state;
    // A/D are conventional strafing bindings on foot. Arrow keys are the
    // supported keyboard-only turn control and rotate the camera with the
    // explorer when no independent mouse-look offset is active.
    const turnDurationMs = Math.max(16, Math.min(600, Math.abs(delta) / 2.6 * 800));
    await inputStep(page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', turnDurationMs);
  }
  const final = await actorState(page, target);
  const desired = Math.atan2(Number(target.x) - final.x, Number(target.z) - final.z);
  throw new Error(`Could not aim the camera reticle at ${JSON.stringify(target)} with normal look input: ${JSON.stringify({ final, desired, delta: wrapYaw(desired - final.cameraYaw) })}`);
}

// Collision evidence is attempted inward translation at the parked side.
// The shipped resolver permits tangential sliding; only its inward component
// must stay blocked. Step-budget exhaustion can never establish contact.
async function probeVehicleCollision(page, target) {
  await turnToward(page, target, .04);
  const start = await actorState(page, target);
  let previous = start, stagnantMs = 0;
  const width = Number(target.dimensionsMeters?.width || 1.8);
  const length = Number(target.dimensionsMeters?.length || 4.5);
  const yaw = Number(target.yaw || 0);
  const local = actor => ({
    side: (actor.x - target.x) * Math.cos(yaw) - (actor.z - target.z) * Math.sin(yaw),
    along: (actor.x - target.x) * Math.sin(yaw) + (actor.z - target.z) * Math.cos(yaw)
  });
  const trace = [];
  for (let step = 0; step < 12; step += 1) {
    const timing = await inputStep(page, 'ArrowUp', 1000);
    const current = await actorState(page, target);
    const translated = Math.hypot(current.x - previous.x, current.z - previous.z);
    const currentLocal = local(current), previousLocal = local(previous);
    const normalTranslation = Math.abs(currentLocal.side - previousLocal.side);
    const atVehicleSide = Math.abs(currentLocal.side) >= width * .42 &&
      Math.abs(currentLocal.side) <= width / 2 + .5 && Math.abs(currentLocal.along) <= length / 2;
    stagnantMs = normalTranslation < .008 && atVehicleSide ? stagnantMs + 1000 : 0;
    trace.push({ step, translated, normalTranslation, atVehicleSide, local: currentLocal, stagnantMs, actor: current, timing });
    if (current.distance <= .15) return { reached: true, blocked: false, start, final: current, trace };
    if (stagnantMs >= 7000) return { reached: false, blocked: true, stagnantMs, start, final: current, trace };
    previous = current;
  }
  return { reached: false, blocked: false, budgetExhausted: true, start, final: previous, trace };
}

async function useEquipmentSimulation(page, milliseconds) {
  const result = await page.evaluate(async duration => {
    const target = document.activeElement || document.body;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName)) {
      throw new Error('Equipment input is blocked by a focused UI control.');
    }
    try {
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v', bubbles: true, cancelable: true }));
      const receipt = await globalThis.advanceTime?.(duration, { renderIntermediateFrames: false });
      return { receipt, state: globalThis.getWorldExplorerRuntimeDiagnostics?.() };
    } finally {
      target.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v', bubbles: true, cancelable: true }));
    }
  }, milliseconds);
  assert.ok(result.receipt?.simulatedMs === milliseconds && result.receipt.frames > 0 && result.receipt.suspendedFrames === 0,
    `Equipment simulation did not advance: ${JSON.stringify(result.receipt)}`);
  return result;
}

async function walkTo(page, target, options = {}) {
  const stopDistance = Number(options.stopDistance ?? 0.75);
  const maxSteps = Number(options.maxSteps ?? 1_200);
  const interactionVehicleId = String(options.interactionVehicleId || '');
  let previousPosition = null;
  let stagnant = 0;
  let start = null;
  let detourCount = 0;
  let completedSteps = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    if (Date.now() >= (options.deadline || Infinity)) break;
    completedSteps = step + 1;
    if (options.resolveTarget) {
      target = await options.resolveTarget();
      if (!target) return { reached: false, blocked: false, targetMissing: true, start, steps: step };
    }
    const state = await actorState(page, target);
    if (options.trace && step % 10 === 0) console.log(JSON.stringify({ event: 'urban-approach', step, target, actor: state }));
    start ||= state;
    if (state.custody?.active) return { reached: false, interruptedBy: 'custody', start, final: state, steps: step };
    if (interactionVehicleId && state.interaction?.action === 'enter_vehicle') {
      const current = await diagnostics(page);
      if (current.urbanSandbox?.nearbyVehicleId === interactionVehicleId) {
        const arrival = options.onVehicleArrival ? await options.onVehicleArrival() : true;
        if (arrival) return { reached: true, byInteraction: true, arrival, start, final: state, steps: step };
      }
    }
    if (!interactionVehicleId && state.distance <= stopDistance) return { reached: true, byInteraction: false, start, final: state, steps: step };
    const desired = Math.atan2(Number(target.x) - state.x, Number(target.z) - state.z);
    const delta = wrapYaw(desired - state.yaw);
    if (Math.abs(delta) > 0.13) {
      const pulseMs = Math.max(16, Math.min(600, Math.abs(delta) / 2.6 * 800));
      await inputStep(page, delta > 0 ? 'ArrowLeft' : 'ArrowRight', pulseMs);
      // Facing a target cannot reduce its distance. Counting these turns as
      // blocked movement sent the verifier on a detour before it even walked.
      continue;
    } else {
      const movementPulseMs = Math.max(40, Math.min(600, Math.max(0, state.distance - (interactionVehicleId ? 1 : stopDistance)) / (state.distance > 20 ? 5.6 : 2.8) * 800));
      await inputStep(page, state.distance > 20 ? ['ShiftLeft', 'ArrowUp'] : 'ArrowUp', movementPulseMs);
    }
    // A moving target must not hide a blocked player or falsely block one
    // who is walking. Only actor translation establishes navigation progress.
    stagnant = previousPosition && Math.hypot(state.x - previousPosition.x, state.z - previousPosition.z) < .008 ? stagnant + 1 : 0;
    previousPosition = { x: state.x, z: state.z };
    if (stagnant > Number(options.stagnantLimit ?? 85) && options.detour === true && detourCount < 8) {
      const side = detourCount % 2 === 0 ? 1 : -1;
      detourCount += 1;
      const tangent = {
        x: state.x + Math.sin(desired + side * Math.PI / 2) * 9,
        z: state.z + Math.cos(desired + side * Math.PI / 2) * 9
      };
      const turned = await turnToward(page, tangent, .16, 160, { deadline: options.deadline }).then(() => true, () => false);
      if (!turned) {
        stagnant = 0;
        previousPosition = null;
        continue;
      }
      await inputStep(page, state.distance > 20 ? ['ShiftLeft', 'ArrowUp'] : 'ArrowUp', Math.max(900, Math.min(5_200, state.distance * 125)));
      stagnant = 0;
      previousPosition = null;
      continue;
    }
    if (stagnant > Number(options.stagnantLimit ?? 85)) {
      return { reached: false, blocked: true, start, final: state, steps: step };
    }
  }
  return { reached: false, blocked: false, start, final: await actorState(page, target), steps: completedSteps, stepBudget: maxSteps };
}

async function launchEarth(page, location = { lat: 39.2904, lon: -76.6122, name: 'Baltimore Inner Harbor' }) {
  const params = new URLSearchParams({
    loc: 'custom', lat: String(location.lat), lon: String(location.lon), lname: location.name,
    launch: 'earth', gm: 'free', mode: 'walk'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  if (process.env.CI) await selectLowRenderQuality(page);
  await page.locator('#globeCustomLat').fill(String(location.lat));
  await page.locator('#globeCustomLon').fill(String(location.lon));
  await page.locator('#globeCustomLon').press('Enter');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    if (document.getElementById('loading')?.classList.contains('show')) return false;
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.livingWorld?.active === true && state.urbanSandbox?.active === true &&
      Number(state.urbanSandbox?.vehicleCount || 0) > 0;
  }, null, { timeout: 360_000, polling: 500 });
  await page.waitForTimeout(2_000);
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  const ready = await diagnostics(page);
  assert.ok(Math.abs(ready.earthOrigin?.lat - location.lat) < 1e-6 && Math.abs(ready.earthOrigin?.lon - location.lon) < 1e-6,
    `Loaded urban fixture differs from selected coordinates: ${JSON.stringify({ location, origin: ready.earthOrigin })}`);
  return ready;
}

async function reachableVehicleCandidates(page) {
  return page.evaluate(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const actor = state.activeActor?.position || {};
    return (state.urbanSandbox?.vehicles || [])
      .filter((vehicle) => ['deterministic-parked-vehicle', 'living-world-detailed-traffic'].includes(vehicle.source) &&
        !vehicle.attachedToPlayer && !vehicle.occupied && vehicle.driverDoor)
      .map((vehicle) => ({ ...vehicle, distance: Math.hypot(vehicle.driverDoor.x - actor.x, vehicle.driverDoor.z - actor.z) }))
      .sort((left, right) => Number(right.source === 'deterministic-parked-vehicle') - Number(left.source === 'deterministic-parked-vehicle') || left.distance - right.distance);
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
  const timing = await useEquipmentSimulation(page, 1800);
  const action = timing.state.urbanSandbox?.projectileRuntime?.lastPlayerProjectileAction;
  assert.ok(action?.equipmentId === id && action?.phase === 'impact',
    `Projectile did not impact within simulation budget: ${JSON.stringify(action)}`);
  const after = await equipmentItem(page, id);
  return { before, after, state: timing.state, timing: timing.receipt };
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
      .sort((left, right) =>
        Number(left.distance ?? Infinity) - Number(right.distance ?? Infinity) ||
        Number(right.detailed) - Number(left.detailed));
    return targetId
      ? candidates.find((entry) => String(entry.id) === String(targetId)) || null
      : candidates[0] || null;
  }, { targetId: preferredId, excluded: excludedIds });
  let witness = await selectWitness();
  assert.ok(witness, 'The loaded Baltimore world did not publish a simulated pedestrian witness.');
  let witnessId = String(witness.id || '');
  const excludedWitnessIds = new Set();
  const deadline = Date.now() + (process.env.CI ? 300_000 : 70_000);
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
      deadline,
      resolveTarget: () => selectWitness(witnessId),
      trace: true,
      stagnantLimit: 18,
      detour: true
    });
    if (approach.reached) {
      const current = await selectWitness(witnessId);
      if (current && (await actorState(page, current)).distance <= stopDistance) return { witness: current, approach };
    }
    trace.push({ witnessId, detailed: witness.detailed, actor, approach });
    const materiallyCloser = Number(approach.final?.distance ?? Infinity) < actor.distance - .5;
    if (!approach.blocked && materiallyCloser) continue;
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

async function waitForResponderDispatch(page) {
  const receipts = [];
  for (let simulatedMs = 0; simulatedMs <= 8000; simulatedMs += 500) {
    const state = await diagnostics(page);
    if (Number(state.urbanSandbox?.responders?.activeCount || 0) > 0) {
      return { simulatedMs, receipts, state };
    }
    assert.ok(simulatedMs < 8000,
      `Witnessed incident did not dispatch within 8 simulated seconds: ${JSON.stringify(state.urbanSandbox?.civicResponse)}`);
    receipts.push(await advanceGameplay(page, 500));
  }
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
    await advanceGameplay(page, 240);
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
      await advanceGameplay(page, 420);
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

async function verifyCustodyIncidentEnded(page) {
  const before = await diagnostics(page);
  const start = before.activeActor?.position || {};
  for (let index = 0; index < 4; index += 1) {
    await advanceGameplay(page, 1600);
    await inputStep(page, 'ArrowUp', 180);
  }
  await page.waitForTimeout(300);
  const after = await diagnostics(page);
  const end = after.activeActor?.position || {};
  return {
    after,
    moved: Math.hypot(Number(end.x) - Number(start.x), Number(end.z) - Number(start.z)),
    caughtVisible: await page.locator('#caughtScreen.show').isVisible().catch(() => false)
  };
}

async function runVehicleEquipmentJourney() {
  const { browser, context, page, providerFixture } = await createJourneyBrowser({ recordedVehicles: true });
  bindEvidence(page);
  try {
    // This actual road point has demonstrated normal entry and two-client
    // handoff. Baltimore's selected point can supply only one departing car.
    const ready = await launchEarth(page, { lat: 41.735329, lon: -111.834912, name: 'Logan Main Street' });
    assert.ok(providerFixture.hits > 0, 'Vehicle journey must consume the exact recorded road query.');
    const vehicleDeadline = Date.now() + (process.env.CI ? 180_000 : 70_000);
    const attempted = new Set();
    let vehicle = null;
    let approach = null;
    const approachEvidence = [];
    while (Date.now() < vehicleDeadline) {
      const candidates = await reachableVehicleCandidates(page);
      const candidate = candidates.find(entry => !attempted.has(entry.id));
      if (!candidate) { await page.waitForTimeout(500); continue; }
      attempted.add(candidate.id);
      const result = await walkTo(page, candidate.driverDoor, {
        interactionVehicleId: candidate.id,
        onVehicleArrival: () => enterNearbyVehicle(page, candidate.id),
        // Traffic keeps moving until the normal player interaction claims it.
        resolveTarget: async () => (await diagnostics(page)).urbanSandbox?.vehicles?.find(entry => entry.id === candidate.id)?.driverDoor || null,
        maxSteps: 420,
        deadline: vehicleDeadline,
        stagnantLimit: 24,
        detour: true
      });
      approachEvidence.push({ vehicleId: candidate.id, result });
      if (result.reached) {
        vehicle = candidate;
        approach = result;
        break;
      }
    }
    if (!vehicle) console.error('CP5 vehicle approach evidence', JSON.stringify(approachEvidence, null, 2));
    assert.equal(approach?.reached, true, 'Normal walking input could not reach the vehicle door prompt.');
    const entering = approach.arrival.state;
    const entryTiming = await advanceGameplay(page, 650);
    // The fixed-step burst exceeds the 560ms door transition. Read its result
    // directly: an injected polling task can miss its wall deadline while the
    // software compositor is busy even though entry has already completed.
    const entered = await diagnostics(page);
    assert.equal(entered.urbanSandbox?.phase, 'driving', 'Entry transition did not finish after 800ms of simulation.');
    assert.equal(entered.urbanSandbox?.activeVehicleId, vehicle.id, 'Entry selected the wrong vehicle.');
    // Preserve trusted keyboard input while measuring actual simulation time.
    // A slow cloud renderer can consume the entire wall wait in one frame.
    const driveReceipts = [];
    await page.keyboard.down('ArrowUp');
    try { driveReceipts.push(await advanceGameplay(page, 1_250)); }
    finally { await page.keyboard.up('ArrowUp'); }
    await page.keyboard.down('Space');
    try { driveReceipts.push(await advanceGameplay(page, 900)); }
    finally { await page.keyboard.up('Space'); }
    const driven = await diagnostics(page);
    const enteredVehicle = entered.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);
    const drivenVehicle = driven.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);
    const drivenMeters = Math.hypot(drivenVehicle.x - enteredVehicle.x, drivenVehicle.z - enteredVehicle.z);
    const braking = { simulatedMs: 0, receipts: [] };
    // Keep the brake held through fixed simulation, as in the passing two-player
    // handoff journey. Waiting on RAF after releasing it did not finish braking
    // on the software renderer. The normal exit eligibility rule remains intact.
    for (;;) {
      const state = await diagnostics(page);
      assert.equal(state.urbanSandbox?.phase, 'driving', 'Vehicle authority ended before normal exit.');
      const urban = state.urbanSandbox;
      if (urban?.interaction?.action === 'exit_vehicle' &&
          Number.isFinite(urban.playerVehicle?.worldVelocityMps) && urban.playerVehicle.worldVelocityMps <= 1.4) break;
      assert.ok(braking.simulatedMs < 12000, `Braking did not enable exit: ${JSON.stringify(urban?.playerVehicle)}`);
      await page.keyboard.down('Space');
      try { braking.receipts.push(await advanceGameplay(page, 250)); }
      finally { await page.keyboard.up('Space'); }
      braking.simulatedMs += 250;
    }
    const exitInteraction = await exitActiveVehicle(page, vehicle.id);
    const exiting = exitInteraction.state;
    const exitTiming = await advanceGameplay(page, 650);
    const exited = await diagnostics(page);
    const released = exited.urbanSandbox?.vehicles?.find(entry => entry.id === vehicle.id);
    assert.ok(exited.urbanSandbox?.phase === 'walking' && !exited.urbanSandbox?.activeVehicleId && released?.attachedToPlayer === false,
      'Exit transition did not release the vehicle after 800ms of simulation.');
    const retainedVehicle = exited.urbanSandbox.vehicles.find((entry) => entry.id === vehicle.id);

    const collisionProbe = await probeVehicleCollision(page, retainedVehicle);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(path.join(path.dirname(reportPath), 'vehicle-collision-probe.json'), JSON.stringify(collisionProbe, null, 2));
    const minimumVehicleRadius = Math.max(0.8, Number(retainedVehicle.dimensionsMeters?.width || 1.8) * 0.42);
    assert.equal(collisionProbe.reached, false, 'Walking collision allowed the player into the parked vehicle center.');
    assert.equal(collisionProbe.blocked, true, 'Vehicle collision must be demonstrated by blocked translation, not navigation budget exhaustion.');
    assert.ok(collisionProbe.final.distance >= minimumVehicleRadius, 'Parked vehicle collision stopped inside the visual body.');
    await turnToward(page, retainedVehicle);

    return {
      ready,
      providerFixture,
      vehicle,
      approach,
      entering,
      entered,
      transitionTiming: { mode: 'runtime-fixed-step', entry: entryTiming, exit: exitTiming },
      driven,
      drivenMeters,
      braking,
      driveTiming: { mode: 'trusted-keyboard-runtime-fixed-step', receipts: driveReceipts },
      exiting,
      exited,
      retainedVehicle,
      collisionProbe
    };
  } catch (error) {
    await saveJourneyFailure(page, 'vehicle', error);
    throw error;
  } finally {
    try { await context.close(); } finally { await browser.close(); }
  }
}

// Equipment actions intentionally trigger civic consequences. Give each weapon
// a fresh real world so a prior theft/discharge cannot interrupt an unrelated
// inventory assertion. Arrest and hospital recovery remain separate full journeys.
async function runEquipmentJourney(ids) {
  const { browser, context, page, providerFixture } = await createJourneyBrowser({ recordedVehicles: true });
  bindEvidence(page);
  try {
    await launchEarth(page, { lat: 41.735329, lon: -111.834912, name: 'Logan Main Street' });
    assert.ok(providerFixture.hits > 0, 'Equipment journey must consume recorded map input.');
    const vehicle = (await reachableVehicleCandidates(page)).find(entry => entry.source === 'deterministic-parked-vehicle');
    assert.ok(vehicle, 'Equipment journey needs a published parked vehicle.');
    const approach = [];
    for (const target of vehicleApproachWaypoints(await actorState(page), vehicle)) {
      const leg = await walkTo(page, target, {
        stopDistance: .25, maxSteps: 420, detour: true, stagnantLimit: 24, deadline: Date.now() + 180000
      });
      approach.push({ target, ...leg });
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(path.join(path.dirname(reportPath), `equipment-${ids[0]}-approach.json`), JSON.stringify({ vehicle, approach }, null, 2));
      assert.equal(leg.reached, true, 'Equipment journey could not walk around the parked vehicle normally.');
    }
    await turnToward(page, vehicle);
    const equipmentResults = {};
    let parachuteBefore, parachuteGroundRecovery;
    for (const id of ids) {
      await equip(page, id);
      const beforeState = await diagnostics(page);
      const beforeItem = await equipmentItem(page, id);
      const timing = await useEquipmentSimulation(page, id === 'concussion-charge' ? 4000 : 1800);
      const afterState = timing.state;
      const afterItem = await equipmentItem(page, id);
      if (['hands', 'baton'].includes(id)) {
        equipmentResults[id] = {
          before: beforeState.urbanSandbox.vehicles.find(entry => entry.id === vehicle.id)?.condition,
          after: afterState.urbanSandbox.vehicles.find(entry => entry.id === vehicle.id)?.condition,
          vehicleId: vehicle.id, timing: timing.receipt
        };
      } else if (id === 'flashlight') {
        assert.equal(afterState.urbanSandbox.equipment.flashlightEnabled, true);
        equipmentResults[id] = afterItem;
      } else if (id === 'parachute') {
        parachuteBefore = beforeState.urbanSandbox.parachute;
        parachuteGroundRecovery = afterState.urbanSandbox.parachute;
      } else {
        const action = afterState.urbanSandbox.projectileRuntime?.lastPlayerProjectileAction;
        assert.ok(action?.equipmentId === id && action?.phase === 'impact',
          `Equipment did not impact within simulation budget: ${JSON.stringify(action)}`);
        equipmentResults[id] = { before: beforeItem, after: afterItem, state: afterState, timing: timing.receipt };
      }
    }
    return { equipmentResults, parachuteBefore, parachuteGroundRecovery, providerFixture, approach };
  } catch (error) {
    await saveJourneyFailure(page, `equipment-${ids[0]}`, error);
    throw error;
  } finally {
    try { await context.close(); } finally { await browser.close(); }
  }
}

async function withIndependentEquipmentJourneys(primary) {
  primary.equipmentResults = {};
  primary.equipmentJourneys = [];
  for (const ids of [['flashlight', 'parachute', 'hands', 'baton'], ['pulse-sidearm'], ['laser-gun'], ['paintball-gun'], ['concussion-charge']]) {
    console.log(`[urban-sandbox] START equipment ${ids.join(',')}`);
    const result = await runEquipmentJourney(ids);
    Object.assign(primary.equipmentResults, result.equipmentResults);
    if (result.parachuteBefore) {
      primary.parachuteBefore = result.parachuteBefore;
      primary.parachuteGroundRecovery = result.parachuteGroundRecovery;
    }
    primary.equipmentJourneys.push({ ids, providerFixture: result.providerFixture, approach: result.approach });
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(path.join(path.dirname(reportPath), 'equipment-progress.json'), JSON.stringify({
      complete: false, aggregateAssertionsRun: false, completedEquipment: Object.keys(primary.equipmentResults), journeys: primary.equipmentJourneys
    }, null, 2));
  }
  return primary;
}

async function runArrestRecoveryJourney() {
  const { browser, context, page } = await createJourneyBrowser();
  bindEvidence(page);
  try {
    await launchEarth(page);
    const witnessedResponse = await triggerWitnessedAssaultResponse(page);
    const dispatchTiming = await waitForResponderDispatch(page);
    const responderArrived = await meetResponderUntilOfficer(page);
    if (!responderArrived.urbanSandbox?.responders?.responders?.some((entry) => !!entry.officer)) {
      console.error('CP5 arrest responder arrival evidence', JSON.stringify({
        activeActor: responderArrived.activeActor,
        civicResponse: responderArrived.urbanSandbox?.civicResponse,
        responders: responderArrived.urbanSandbox?.responders,
        trace: responderArrived.__responderMeetTrace
      }, null, 2));
    }
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
    const ended = await verifyCustodyIncidentEnded(page);
    assert.equal(ended.caughtVisible, false, 'The completed custody incident reopened the caught screen.');
    assert.equal(ended.after.urbanSandbox?.custody || null, null, 'The completed custody incident arrested the player again.');
    assert.equal(ended.after.urbanSandbox?.civicResponse?.phase, 'clear', 'Civic attention remained active after custody release.');
    assert.equal(Number(ended.after.urbanSandbox?.responders?.activeCount || 0), 0, 'Responders from the completed custody incident remained active.');
    assert.ok(ended.moved > .2, 'Normal walking control did not recover after custody release.');
    return { witnessedResponse, dispatchTiming, responderArrived, custody, recovered, ended };
  } catch (error) {
    await saveJourneyFailure(page, 'arrest', error);
    throw error;
  } finally {
    try { await context.close(); } finally { await browser.close(); }
  }
}

async function runMedicalRecoveryJourney() {
  const { browser, context, page } = await createJourneyBrowser();
  bindEvidence(page);
  try {
    await launchEarth(page);
    const witnessedResponse = await triggerWitnessedWeaponResponse(page);
    const dispatchTiming = await waitForResponderDispatch(page);
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
    return { witnessedResponse, dispatchTiming, before, custody, recovered };
  } catch (error) {
    await saveJourneyFailure(page, 'medical', error);
    throw error;
  } finally {
    try { await context.close(); } finally { await browser.close(); }
  }
}

let report;
const verificationMode = {
  evidenceScope: 'urban functional input; deterministic DOM keyboard navigation and transitions; not rendering performance',
  vehicleMapInput: 'exact recorded Logan road query; not live map-provider availability',
  deviceScaleFactor: process.env.CI ? .5 : 1,
  renderQuality: process.env.CI ? 'low (selected through Settings)' : 'default'
};
console.log(JSON.stringify(verificationMode));
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
      completedIncidentCannotReplay:
        !arrest.ended.caughtVisible && !arrest.ended.after.urbanSandbox?.custody &&
        arrest.ended.after.urbanSandbox?.civicResponse?.phase === 'clear' &&
        Number(arrest.ended.after.urbanSandbox?.responders?.activeCount || 0) === 0 &&
        arrest.ended.moved > .2,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    report = { ok: Object.values(checks).every(Boolean), contract: 'urban-sandbox-arrest-scope-v1', servedRoot, checks, browserErrors, localFailures };
    console.log('[urban-sandbox] CAPTURED arrest recovery');
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
    console.log('[urban-sandbox] CAPTURED medical recovery');
  } else if (requestedScope === 'vehicle') {
    console.log('[urban-sandbox] START vehicle and equipment');
    const primary = await withIndependentEquipmentJourneys(await runVehicleEquipmentJourney());
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
      segmentCollisionContainsPlayer: primary.collisionProbe.reached === false && primary.collisionProbe.blocked === true,
      handsAndStaffAffectSameVehicle:
        primary.equipmentResults.hands.vehicleId === primary.equipmentResults.baton.vehicleId &&
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
    report = { ok: Object.values(checks).every(Boolean), contract: 'urban-sandbox-vehicle-scope-v1', servedRoot, checks, evidence: { transitionTiming: primary.transitionTiming, collisionProbe: primary.collisionProbe, providerFixture: primary.providerFixture, equipmentJourneys: primary.equipmentJourneys }, browserErrors, localFailures };
    console.log('[urban-sandbox] CAPTURED vehicle and equipment');
  } else {
  console.log('[urban-sandbox] START vehicle and equipment');
  const primary = await withIndependentEquipmentJourneys(await runVehicleEquipmentJourney());
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(path.join(path.dirname(reportPath), 'progress.json'), JSON.stringify({ complete: false, aggregateAssertionsRun: false, completedJourneys: ['vehicle'], evidence: { vehicleId: primary.vehicle.id, drivenMeters: primary.drivenMeters, providerFixture: primary.providerFixture } }, null, 2));
  console.log('[urban-sandbox] CAPTURED vehicle and equipment');
  console.log('[urban-sandbox] START arrest recovery');
  const arrest = await runArrestRecoveryJourney();
  await writeFile(path.join(path.dirname(reportPath), 'progress.json'), JSON.stringify({ complete: false, aggregateAssertionsRun: false, completedJourneys: ['vehicle', 'arrest'], evidence: { vehicleId: primary.vehicle.id, drivenMeters: primary.drivenMeters, policeFacility: arrest.custody.urbanSandbox.custody?.facility } }, null, 2));
  console.log('[urban-sandbox] CAPTURED arrest recovery');
  console.log('[urban-sandbox] START medical recovery');
  const medical = await runMedicalRecoveryJourney();
  console.log('[urban-sandbox] CAPTURED medical recovery');
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
    segmentCollisionContainsPlayer: primary.collisionProbe.reached === false && primary.collisionProbe.blocked === true,
    handsAndStaffAffectSameVehicle:
      primary.equipmentResults.hands.vehicleId === primary.equipmentResults.baton.vehicleId &&
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
      providerFixture: primary.providerFixture,
      braking: primary.braking,
      driveTiming: primary.driveTiming,
      vehicleLocation: primary.ready.earthOrigin,
      vehicleId: primary.vehicle.id,
      drivenMeters: primary.drivenMeters,
      transitionTiming: primary.transitionTiming,
      collisionStopDistance: primary.collisionProbe.final.distance,
      collisionProbe: primary.collisionProbe,
      equipmentJourneys: primary.equipmentJourneys,
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
  report.scope = requestedScope;
  report.verificationMode = verificationMode;
  report.complete = requestedScope === 'all';
  report.browserBudget = { maxOldSpaceMiB: 1024, freshBrowserPerJourney: true };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, `Urban Sandbox ${requestedScope} normal-input journey failed.`);
} finally {
  await server.close();
}
