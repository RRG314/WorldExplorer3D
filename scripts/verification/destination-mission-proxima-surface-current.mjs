import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/destination-mission-proxima-surface');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

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
  await page.locator('#universeToggle').click();
  await page.locator('#universeDestinationSelect').selectOption('proxima-centauri-b');
  await page.locator('#universeMissionBtn').click();
  await page.locator('[data-mission-begin]').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'approach');
  await page.locator('[data-mission-course]').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.universeNavigation?.currentFrameId === 'proxima-centauri'
      && state.universeNavigation?.courseDestinationId === 'proxima-centauri-b'
      && state.destinationMission?.phase === 'fieldwork';
  }, null, { timeout: 30_000 });
}

async function enterPodBay(page) {
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0 });
  });
  await page.keyboard.press('KeyE');
  await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    Object.assign(ctx.Walk.state.walker, { x: 5.4, z: -29, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
  });
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyE');
  await page.locator('[data-pod-mission]').waitFor({ state: 'visible' });
}

async function recordSurfaceActivity(page, activityId) {
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
    }), true);
    await page.waitForTimeout(120);
  }
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  page.on('response', (response) => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  try {
    await openSpace(page);
    const surfaceCatalogProfiles = await page.evaluate(async () => {
      const { listDestinationMissions } = await import('/app/js/universe/mission-catalog.js?v=2');
      const { resolveUniverseAddress } = await import('/app/js/universe/catalog.js?v=11');
      const { deriveExpeditionWorldProfile, sampleModeledRelief } = await import('/app/js/planetary/solid-world-runtime.js?v=12');
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
    await page.locator('[data-pod-mission]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.podJourney?.phase === 'local_flight');
    const landingTargetReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      if (!target?.landable) return false;
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
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
        if (!(object.isPoints || object.isLine || object.isLineSegments) || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => layers.push({
          name: object.name || '(unnamed)',
          depthTest: material.depthTest,
          depthWrite: material.depthWrite,
          transparent: material.transparent,
          renderOrder: object.renderOrder
        }));
      });
      return {
        active: ctx.starField?.userData?.planetarySurfaceOcclusion === true,
        layers
      };
    });
    assert.equal(surfaceSky.active, true, JSON.stringify(surfaceSky));
    assert.ok(surfaceSky.layers.length >= 2, JSON.stringify(surfaceSky));
    assert.equal(surfaceSky.layers.every((layer) => layer.depthTest && !layer.depthWrite && layer.transparent && layer.renderOrder === 1000), true, JSON.stringify(surfaceSky));
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-arrival-terrain.png'), fullPage: true });
    assert.equal((await snapshot(page)).destinationMission.phase, 'fieldwork');
    for (const id of ['photograph', 'geology-inspect', 'habitat-survey']) await recordSurfaceActivity(page, id);
    await page.waitForFunction(() => {
      const mission = JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission;
      return mission?.phase === 'analysis' && mission.evidence?.length === 3;
    });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-surface-complete.png'), fullPage: true });
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
      return state.modes?.space === true && state.interstellarExpedition?.podJourney?.phase === 'recovered';
    }, null, { timeout: 35_000 });
    assert.equal(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.starField?.userData?.planetarySurfaceOcclusion === false;
    }), true);

    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: -5.1, z: -14.5, angle: Math.PI / 2, yaw: Math.PI / 2, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(220);
    await page.keyboard.press('KeyE');
    await page.locator('[data-complete-destination-analysis]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'desktop-proxima-b-analysis.png'), fullPage: true });
    await page.locator('[data-complete-destination-analysis]').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').destinationMission?.phase === 'complete');
    const final = await snapshot(page);
    const fictionalWorldProfile = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const { resolveUniverseAddress } = await import('/app/js/universe/catalog.js?v=11');
      const { arriveAtSolidWorld, registerExpeditionSolidWorld } = await import('/app/js/planetary/solid-world-runtime.js?v=12');
      ctx.exitExpeditionShipInterior?.();
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
    await page.screenshot({ path: path.join(outputDir, 'desktop-andromeda-copper-dawn-weather.png'), fullPage: true });
    return {
      missionPhase: final.destinationMission.phase,
      evidence: final.destinationMission.evidence,
      podPhase: final.interstellarExpedition.podJourney.phase,
      frameId: final.universeNavigation.currentFrameId,
      worldProfile,
      fictionalWorldProfile,
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
