import { waitForAsyncCondition } from './async-browser-condition.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/destination-mission-proxima-surface');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const cancelledResources = [];

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openSpace(page) {
  await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
}

async function beginProximaBMission(page) {
  await page.evaluate(async () => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan, withExpeditionChanges }, { startExpedition }, { createExpeditionStore }] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=11'),
      import('/app/js/expedition/simulation.js?v=8'),
      import('/app/js/expedition/store.js?v=11')
    ]);
    const planned = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, id: 'first-light-surface-verification', createdAtMs: 91_000 });
    createExpeditionStore().save(withExpeditionChanges(startExpedition(planned, 91_100), {
      state: 'arrived', progress: 1, voyagePhase: 'arrival', arrivalTransferState: 'pending'
    }));
  });
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionArrive').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'proxima-centauri'
      && state.universeNavigation?.transitionDestinationId == null
      && state.interstellarExpedition?.arrivalTransferState === 'complete';
  }, null, { timeout: 30_000 });
  await page.locator('#destinationMissionPanel').waitFor({ state: 'visible' });
  await page.locator('[data-mission-begin]').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'approach');
  await page.locator('[data-mission-course]').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').universeNavigation?.courseDestinationId === 'proxima-centauri-b');
  const planetApproachReady = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const target = ctx.getUniverseHudTarget?.();
    if (!target?.position || !ctx.spaceFlight?.rocket) return false;
    ctx.spaceFlight.rocket.position.set(
      target.position.x,
      target.position.y,
      target.position.z + Math.max(90, Number(target.radius || 6) * 12)
    );
    ctx.spaceFlight.velocity?.set?.(0, 0, 0);
    ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ctx.spaceFlight.speed = 0;
    return true;
  });
  assert.equal(planetApproachReady, true);
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'proxima-centauri'
      && state.universeNavigation?.courseDestinationId === 'proxima-centauri-b'
      && state.destinationMission?.phase === 'fieldwork';
  }, null, { timeout: 30_000 });
}

async function enterPodBay(page) {
  if (!(await snapshot(page)).expeditionShipInterior?.active) {
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  }
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { SHIP_STATIONS } = await import('/app/js/expedition/ship-layout.js');
    const station = SHIP_STATIONS.find(entry => entry.id === 'craft-bay-status');
    ctx.switchSolisReachDeck(station.deckId);
    Object.assign(ctx.Walk.state.walker, { x: station.x, z: station.z, y:1.74, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyE');
  await page.locator('[data-pod-mission]').waitFor({ state: 'visible', timeout:10000 }).catch(async error => {
    const state = await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return {mission:ctx.getDestinationMissionSnapshot(),pod:ctx.getInterstellarExpeditionSnapshot()?.podJourney,frame:ctx.universeRuntime?.current?.id,course:ctx.universeRuntime?.course?.destination?.id,ship:ctx.getShipInteriorSnapshot()?.deckId,panel:document.getElementById('shipStationPanel')?.textContent};});
    throw Error(JSON.stringify(state));
  });
}

async function recordSurfaceActivity(page, activityId, failFirstSave = false) {
  if(failFirstSave) await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');
    const original=ctx.discoveryProfileStore || createIndexedDbDiscoveryProfileStore();let fail=true;
    ctx.discoveryProfileStore={...original,recordObservation:async(...args)=>{if(fail){fail=false;throw Error('injected field save failure');}return original.recordObservation(...args);}};
  });
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const activity = ctx.planetaryFieldActivitySnapshot().activities.find((entry) => entry.activityId === id);
    Object.assign(ctx.Walk.state.walker, { x: activity.x + 2.2, z: activity.z + 0.8, y: activity.y + 1.2, vy: 0, onGround: true });
  }, activityId);
  await page.waitForTimeout(180);
  for (let step = 0; step < 3; step += 1) {
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), !(failFirstSave && step === 2));
    await page.waitForTimeout(120);
  }
  if(failFirstSave){
    const failure=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return {evidence:ctx.getDestinationMissionSnapshot().evidence,procedure:ctx.planetaryFieldActivitySnapshot().activities.find(entry=>entry.activityId==='photograph').procedure};});
    assert.equal(failure.evidence.includes('photograph'),false);assert.equal(failure.procedure.complete,false);
    assert.equal(await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.handlePrimaryContextInteraction();}),true);
    await page.waitForTimeout(200);
  }

}

async function returnSurfaceToShip(page) {
    const pod = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      let result = null;
      ctx.scene.traverse((child) => { if (child.name === 'expedition-return-pod:proxima-centauri-b') result = child; });
      return result ? { x: result.position.x, y: result.position.y, z: result.position.z, rotationY: result.rotation.y } : null;
    });
    assert.ok(pod);
    await page.evaluate(async (pose) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, {
        x: pose.x - Math.sin(pose.rotationY) * 2.7,
        z: pose.z - Math.cos(pose.rotationY) * 2.7,
        y: pose.y + 1.7,
        angle: pose.rotationY,
        yaw: pose.rotationY,
        lookYawOffset: 0,
        pitch: 0,
        vy: 0,
        onGround: true
      });
    }, pod);
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.handlePrimaryContextInteraction();
    }), true);
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.environment === 'PLANETARY'
        && state.interstellarExpedition?.podJourney?.phase === 'surface_launch'
        && state.surfacePodLaunch?.active === true;
    });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true
        && state.interstellarExpedition?.podJourney?.phase === 'rendezvous'
        && state.universeNavigation?.currentFrameId === 'proxima-centauri'
        && state.universeNavigation?.transitionDestinationId == null;
    }, null, { timeout: 35_000 });
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.starField?.userData?.planetarySurfaceOcclusion === false;
    }), true);
    await waitForAsyncCondition(page, async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.getExpeditionPodDockingTarget?.()?.position != null;
    });
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getExpeditionPodDockingTarget?.();
      if (!target?.position) return false;
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + Math.max(2, target.radius * 0.25));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
      ctx.spaceFlight.speed = 0;
      return true;
    }), true);
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.interstellarExpedition?.podJourney?.phase === 'recovered'
        && state.expeditionShipInterior?.active === true;
    });
}

async function deployPodAndLand(page) {
    await page.locator('[data-pod-mission]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'local_flight');
    const landingTargetReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      if (!target?.landable) return false;
      const approachOffset = target.radius + Math.max(9, target.radius * 1.5);
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + approachOffset);
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
      ctx.spaceFlight.speed = 0;
      return true;
    });
    assert.equal(landingTargetReady, true);
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false, null, { timeout: 10_000 });
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.environment === 'PLANETARY' && state.interstellarExpedition?.podJourney?.phase === 'surface';
    }, null, { timeout: 35_000 });
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith(baseUrl)) return;
    if (request.failure()?.errorText === 'net::ERR_ABORTED') cancelledResources.push(request.url());
    else failures.push(`request failed: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    const surfaceCatalogProfiles = await page.evaluate(async () => {
      const { listDestinationMissions } = await import('/app/js/universe/mission-catalog.js?v=2');
      const { resolveUniverseAddress } = await import('/app/js/universe/catalog.js?v=11');
      const { deriveExpeditionWorldProfile, sampleModeledRelief } = await import('/app/js/planetary/solid-world-runtime.js?v=14');
      const stableSeed = (value) => {
        let hash = 2166136261;
        for (const character of String(value || '')) {
          hash ^= character.charCodeAt(0);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };
      return listDestinationMissions()
        .filter((mission) => mission.scope === 'planet' && mission.operation.includes('surface'))
        .map((mission) => {
          const destination = resolveUniverseAddress(mission.destinationId);
          const system = resolveUniverseAddress(mission.systemId);
          const seed = stableSeed(destination.id);
          const profile = deriveExpeditionWorldProfile({
            id: destination.id,
            seed,
            radiusEarth: destination.radiusEarth,
            massEarth: destination.massEarth,
            starMassSolar: system.physical?.hostMassSolar,
            semiMajorAxisAu: destination.semiMajorAxisAu,
            equilibriumTemperatureK: mission.habitability?.equilibriumTemperatureK,
            habitabilityCandidate: mission.habitability?.candidate === true,
            originalGameWorld: mission.truthClass === 'fictional-game-world'
          });
          const pack = {
            reliefKind: profile.reliefKind,
            reliefAmplitude: profile.reliefAmplitude,
            detailSeed: profile.seed || 1,
            spawn: { x: 420, z: -360 }
          };
          let minElevation = Infinity;
          let maxElevation = -Infinity;
          for (let x = -3_600; x <= 3_600; x += 240) {
            for (let z = -3_600; z <= 3_600; z += 240) {
              const elevation = sampleModeledRelief(pack, x, z);
              minElevation = Math.min(minElevation, elevation);
              maxElevation = Math.max(maxElevation, elevation);
            }
          }
          return {
            id: destination.id,
            truthClass: mission.truthClass,
            reliefKind: profile.reliefKind,
            reliefRangeM: maxElevation - minElevation,
            gravityG: profile.gravityRatio,
            temperatureK: profile.temperatureK,
            atmosphereEvidence: profile.atmosphere.atmosphereEvidence,
            weatherModelId: profile.atmosphere.weatherModelId,
            pressurePa: profile.atmosphere.pressurePa
          };
        });
    });
    assert.ok(surfaceCatalogProfiles.length >= 8, JSON.stringify(surfaceCatalogProfiles));
    assert.equal(surfaceCatalogProfiles.every((profile) => profile.reliefRangeM > 300), true, JSON.stringify(surfaceCatalogProfiles));
    assert.equal(surfaceCatalogProfiles.every((profile) => profile.gravityG > 0.05 && profile.gravityG < 4), true, JSON.stringify(surfaceCatalogProfiles));
    assert.ok(new Set(surfaceCatalogProfiles.map((profile) => profile.reliefKind)).size >= 3, JSON.stringify(surfaceCatalogProfiles));
    assert.ok(Math.max(...surfaceCatalogProfiles.map((profile) => profile.gravityG)) - Math.min(...surfaceCatalogProfiles.map((profile) => profile.gravityG)) > 0.5, JSON.stringify(surfaceCatalogProfiles));
    const observedCandidates = surfaceCatalogProfiles.filter((profile) => profile.truthClass !== 'fictional-game-world');
    assert.equal(observedCandidates.every((profile) => profile.atmosphereEvidence === 'unconfirmed' && profile.weatherModelId === 'none'), true, JSON.stringify(observedCandidates));
    const originalWorlds = surfaceCatalogProfiles.filter((profile) => profile.truthClass === 'fictional-game-world');
    assert.ok(originalWorlds.length >= 2, JSON.stringify(surfaceCatalogProfiles));
    assert.equal(originalWorlds.every((profile) => profile.atmosphereEvidence === 'fictional-game-world' && profile.weatherModelId !== 'none' && profile.pressurePa > 0), true, JSON.stringify(originalWorlds));
    await beginProximaBMission(page);
    assert.ok(await page.evaluate(() => localStorage.getItem('world-explorer:interstellar-expedition:v1')));
    await enterPodBay(page);
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-pod-route.png'), fullPage: true });
    await deployPodAndLand(page);
    const worldProfile = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const positions = ctx.activeSolidWorldSurface.geometry.attributes.position;
      let minElevation = Infinity;
      let maxElevation = -Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        minElevation = Math.min(minElevation, positions.getY(index));
        maxElevation = Math.max(maxElevation, positions.getY(index));
      }
      return {
        minElevation,
        maxElevation,
        reliefRange: maxElevation - minElevation,
        gravityMps2: ctx.activePlanetaryEnvironment?.gravityMagnitudeMps2,
        pressurePa: ctx.activePlanetaryEnvironment?.pressurePa,
        atmosphereEvidence: ctx.activePlanetaryEnvironment?.atmosphereEvidence,
        weatherModelId: ctx.activePlanetaryEnvironment?.weatherModelId
      };
    });
    assert.ok(worldProfile.reliefRange > 500, JSON.stringify(worldProfile));
    assert.ok(worldProfile.gravityMps2 > 9 && worldProfile.gravityMps2 < 11, JSON.stringify(worldProfile));
    assert.equal(worldProfile.atmosphereEvidence, 'unconfirmed');
    assert.equal(worldProfile.weatherModelId, 'none');
    const surfaceSky = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const layers = [];
      ctx.starField?.traverse((object) => {
        if (!(object.isPoints || object.isLine || object.isLineSegments) || object.userData?.skyHitbox || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => layers.push({
          name: object.name || '(unnamed)',
          depthTest: material.depthTest,
          depthWrite: material.depthWrite,
          transparent: material.transparent,
          renderOrder: object.renderOrder,
          clippingPlanes: material.clippingPlanes?.length || 0
        }));
      });
      return {
        active: ctx.starField?.userData?.planetarySurfaceOcclusion === true,
        layers
      };
    });
    assert.equal(surfaceSky.active, true, JSON.stringify({active:surfaceSky.active,layers:surfaceSky.layers.length}));
    assert.ok(surfaceSky.layers.length >= 2, JSON.stringify({active:surfaceSky.active,layers:surfaceSky.layers.length}));
    assert.equal(surfaceSky.layers.every((layer) => !layer.depthTest && !layer.depthWrite && !layer.transparent && layer.renderOrder === -1000 && layer.clippingPlanes === 1), true, JSON.stringify({active:surfaceSky.active,layers:surfaceSky.layers.length}));
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-arrival-terrain.png'), fullPage: true });
    assert.equal((await snapshot(page)).destinationMission.phase, 'fieldwork');
    await recordSurfaceActivity(page, 'photograph', true);
    await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text()).destinationMission?.evidence?.includes('photograph'));
    await returnSurfaceToShip(page);
    const partial=await snapshot(page);
    assert.equal(partial.destinationMission.phase,'fieldwork');
    assert.deepEqual(partial.destinationMission.evidence,['photograph']);
    await page.waitForFunction(()=>/SURVEY PAUSED/.test(document.getElementById('currentJourneyCard')?.textContent || ''));
    await page.screenshot({path:path.join(outputDir,'partial-survey-recovered.png')});
    await enterPodBay(page);
    await deployPodAndLand(page);
    for (const id of ['geology-inspect', 'habitat-survey']) await recordSurfaceActivity(page, id);
    await page.waitForFunction(() => {
      const mission = JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission;
      return mission?.phase === 'analysis' && mission.evidence?.length === 3;
    });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-surface-complete.png'), fullPage: true });
    await returnSurfaceToShip(page);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { SHIP_STATIONS } = await import('/app/js/expedition/ship-layout.js');
      const station = SHIP_STATIONS.find(entry => entry.id === 'analysis-review');
      ctx.switchSolisReachDeck(station.deckId);
      Object.assign(ctx.Walk.state.walker, { x: station.x, z: station.z, y:1.74, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-analysis.png'), fullPage: true });
    await page.locator('[data-complete-destination-analysis="cautious-baseline"]').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.destinationMission?.phase === 'complete'
        && state.interstellarExpedition?.state === 'completed';
    });
    const final = await snapshot(page);
    assert.equal(final.interstellarExpedition.state, 'completed');
    assert.equal(final.interstellarExpedition.campaignResult.totalPoints, 130);
    if (await page.locator('#shipStationPanel').isVisible()) await page.locator('#shipStationPanel [data-close-station]').click();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(()=>/Field Link II installed/.test(document.getElementById('shipStationPanel')?.textContent || ''));
    await page.screenshot({path:path.join(outputDir,'completed-report.png')});
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(outputDir,'completed-report-phone.png')});
    const reportFits=await page.locator('#shipStationPanel .ship-station-card').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
    assert.equal(reportFits,true);
    await page.locator('#shipStationPanel [data-close-station]').click();
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#shipExitButton').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    await page.locator('.expeditionVictory').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'desktop-first-light-mission-success.png'), fullPage: true });
    await page.locator('#expeditionClose').click();
    const fictionalWorldProfile = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { resolveUniverseAddress } = await import('/app/js/universe/catalog.js?v=11');
      const { arriveAtSolidWorld, registerExpeditionSolidWorld } = await import('/app/js/planetary/solid-world-runtime.js?v=14');
      const destination = resolveUniverseAddress('andromeda-explorer-a-b');
      const system = resolveUniverseAddress(destination.parentFrameId);
      let seed = 2166136261;
      for (const character of destination.id) {
        seed ^= character.charCodeAt(0);
        seed = Math.imul(seed, 16777619);
      }
      registerExpeditionSolidWorld({
        id: destination.id,
        name: destination.name,
        seed: seed >>> 0,
        parentSystemId: system.id,
        radiusEarth: destination.radiusEarth,
        massEarth: destination.massEarth,
        starMassSolar: system.physical?.hostMassSolar,
        semiMajorAxisAu: destination.semiMajorAxisAu,
        originalGameWorld: true,
        context: 'Copper Dawn · original game-world field survey',
        representation: 'Original World Explorer terrain, atmosphere, and weather model'
      });
      const arrived = await arriveAtSolidWorld(destination.id);
      const positions = ctx.activeSolidWorldSurface.geometry.attributes.position;
      let minElevation = Infinity;
      let maxElevation = -Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        minElevation = Math.min(minElevation, positions.getY(index));
        maxElevation = Math.max(maxElevation, positions.getY(index));
      }
      return {
        arrived,
        reliefRange: maxElevation - minElevation,
        gravityMps2: ctx.activePlanetaryEnvironment?.gravityMagnitudeMps2,
        pressurePa: ctx.activePlanetaryEnvironment?.pressurePa,
        atmosphereEvidence: ctx.activePlanetaryEnvironment?.atmosphereEvidence,
        weatherModelId: ctx.activePlanetaryEnvironment?.weatherModelId
      };
    });
    assert.equal(fictionalWorldProfile.arrived, true, JSON.stringify(fictionalWorldProfile));
    assert.ok(fictionalWorldProfile.reliefRange > 300, JSON.stringify(fictionalWorldProfile));
    assert.equal(fictionalWorldProfile.atmosphereEvidence, 'fictional-game-world');
    assert.notEqual(fictionalWorldProfile.weatherModelId, 'none');
    assert.ok(fictionalWorldProfile.pressurePa > 0, JSON.stringify(fictionalWorldProfile));
    const nextWorldEquipment = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { createDestinationMissionStore } = await import('/app/js/universe/mission-authority.js?v=3');
      const { planetarySurveyEquipment } = await import('/app/js/universe/mission-progression.js?v=1');
      const restored = planetarySurveyEquipment(createDestinationMissionStore().load());
      const photo = ctx.planetaryFieldActivitySnapshot().activities.find(entry => entry.activityId === 'photograph');
      Object.assign(ctx.Walk.state.walker, { x:photo.x+24, z:photo.z, y:photo.y+1.7, vy:0, onGround:true });
      const state=ctx.planetaryFieldActivitySnapshot();
      return { equipment:state.equipment, restored, nearest:state.nearest?.activityId, distance:state.nearest?.distance };
    });
    assert.equal(nextWorldEquipment.equipment.remoteRangeM,30);
    assert.equal(nextWorldEquipment.restored.remoteRangeM,30);
    assert.equal(nextWorldEquipment.nearest,'photograph');
    assert.equal(nextWorldEquipment.distance,24);
    for(let step=0;step<3;step++) {
      assert.equal(await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.handlePrimaryContextInteraction();}),true);
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outputDir, 'desktop-andromeda-copper-dawn-weather.png'), fullPage: true });
    await openSpace(page);
    const restoredMission=await page.evaluate(async()=>{
      const {ctx}=await import('/app/js/shared-context.js?v=55');
      const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');
      const events=await createIndexedDbDiscoveryProfileStore().getEventsById(['event:destination-mission:proxima-centauri-b']);
      return {phase:ctx.getDestinationMissionSnapshot()?.phase,equipment:ctx.getPlanetarySurveyEquipment?.(),reportCount:events.length};
    });
    assert.equal(restoredMission.phase,'complete');assert.equal(restoredMission.equipment.remoteRangeM,30);assert.equal(restoredMission.reportCount,1);
    return {
      restoredMission,
      partialRecovery:true,
      reportFits,
      missionPhase: final.destinationMission.phase,
      campaignState: final.interstellarExpedition.state,
      campaignPoints: final.interstellarExpedition.campaignResult.totalPoints,
      evidence: final.destinationMission.evidence,
      podPhase: final.interstellarExpedition.podJourney.phase,
      frameId: final.universeNavigation.currentFrameId,
      worldProfile,
      fictionalWorldProfile,
      nextWorldEquipment,
      cancelledResources,
      surfaceCatalogProfiles
    };
  } finally {
    await context.close();
  }
}

let result = null;
try {
  result = await run();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
