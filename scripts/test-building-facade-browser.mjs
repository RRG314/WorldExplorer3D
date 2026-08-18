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
  await page.waitForFunction(async () => {
    const { buildingExteriorMaterialPoolSnapshot } = await import('/app/js/engine/building-facade-materials.js?v=13');
    return buildingExteriorMaterialPoolSnapshot().entranceAtlas?.status === 'ready';
  }, null, { timeout: 30000 });
}

async function inspectFacade(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const entrances = Array.isArray(ctx.buildingFacadeEntrances?.renderedEntrances)
      ? ctx.buildingFacadeEntrances.renderedEntrances
      : [];
    const facadeMeshes = (ctx.buildingMeshes || []).filter((mesh) => mesh?.material?.userData?.buildingExterior === true);
    const attributedMeshes = facadeMeshes.filter((mesh) => !!mesh.geometry?.attributes?.facadeEntrance);
    return {
      diagnostics: ctx.buildingFacadeEntrances?.diagnostics ||
        JSON.parse(globalThis.render_game_to_text?.() || '{}').livingWorld?.facades || null,
      entranceCount: entrances.length,
      archetypes: [...new Set(entrances.map((entry) => entry.archetype))],
      attributedMeshes: attributedMeshes.length,
      shaderOwners: [...new Set(facadeMeshes.map((mesh) => mesh.material?.userData?.facadeEntranceOwner).filter(Boolean))],
      integratedClaims: facadeMeshes.filter((mesh) => mesh.material?.userData?.facadeEntrancesShaderIntegrated === true).length
    };
  });
}

async function poseAtEntrance(page, requestedArchetype, screenshotName) {
  const result = await page.evaluate(async (archetype) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const renderedIds = new Set((ctx.buildingFacadeEntrances?.renderedEntrances || []).map((item) => item.id));
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
    const rayDirection = new globalThis.THREE.Vector3(
      entrance.x - ctx.camera.position.x,
      entrance.y + 1.3 - ctx.camera.position.y,
      entrance.z - ctx.camera.position.z
    ).normalize();
    const facadeRay = new globalThis.THREE.Raycaster(ctx.camera.position.clone(), rayDirection, 0.1, 12);
    const firstFacadeHit = facadeRay.intersectObjects(ctx.buildingMeshes || [], false)[0] || null;
    let firstHitSourceId = String(firstFacadeHit?.object?.userData?.sourceBuildingId || '');
    if (!firstHitSourceId && firstFacadeHit?.object?.userData?.editableBuildingIndexRanges) {
      const indexCursor = Number(firstFacadeHit.faceIndex || 0) * 3;
      firstHitSourceId = String(firstFacadeHit.object.userData.editableBuildingIndexRanges.find((range) =>
        indexCursor >= range.start && indexCursor < range.start + range.count
      )?.sourceBuildingId || '');
    }
    let interpolatedEntrance = null;
    if (firstFacadeHit?.face && firstFacadeHit.object?.geometry?.attributes?.facadeEntrance) {
      const object = firstFacadeHit.object;
      const positions = object.geometry.attributes.position;
      const entranceAttribute = object.geometry.attributes.facadeEntrance;
      const localPoint = object.worldToLocal(firstFacadeHit.point.clone());
      const triangle = new globalThis.THREE.Triangle(
        new globalThis.THREE.Vector3().fromBufferAttribute(positions, firstFacadeHit.face.a),
        new globalThis.THREE.Vector3().fromBufferAttribute(positions, firstFacadeHit.face.b),
        new globalThis.THREE.Vector3().fromBufferAttribute(positions, firstFacadeHit.face.c)
      );
      const barycentric = triangle.getBarycoord(localPoint, new globalThis.THREE.Vector3());
      const interpolate = (component) =>
        entranceAttribute[component](firstFacadeHit.face.a) * barycentric.x +
        entranceAttribute[component](firstFacadeHit.face.b) * barycentric.y +
        entranceAttribute[component](firstFacadeHit.face.c) * barycentric.z;
      interpolatedEntrance = {
        tangentX: interpolate('getX'),
        active: interpolate('getY'),
        bottomY: interpolate('getZ'),
        style: interpolate('getW'),
        localY: localPoint.y
      };
    }
    document.getElementById('tutorialHintCard')?.style.setProperty('display', 'none', 'important');
    ctx.paused = true;
    ctx.renderer.render(ctx.scene, ctx.camera);
    const facadeBinding = {
      meshes: 0,
      activeVertices: 0,
      minimumBottomY: Infinity,
      maximumBottomY: -Infinity,
      styleValues: [],
      normalX: 0,
      normalZ: 0
    };
    for (const mesh of ctx.buildingMeshes || []) {
      const ranges = Array.isArray(mesh?.userData?.editableBuildingIndexRanges)
        ? mesh.userData.editableBuildingIndexRanges.filter((range) => range.sourceBuildingId === entrance.buildingSourceId)
        : [];
      const direct = String(mesh?.userData?.sourceBuildingId || '') === entrance.buildingSourceId;
      if (!direct && ranges.length === 0) continue;
      const attribute = mesh.geometry?.attributes?.facadeEntrance;
      const normals = mesh.geometry?.attributes?.normal;
      const index = mesh.geometry?.index;
      if (!attribute) continue;
      facadeBinding.meshes += 1;
      const vertexIndices = new Set();
      if (direct) {
        for (let vertex = 0; vertex < attribute.count; vertex += 1) vertexIndices.add(vertex);
      } else {
        ranges.forEach((range) => {
          for (let cursor = range.start; cursor < range.start + range.count; cursor += 1) {
            vertexIndices.add(index ? index.getX(cursor) : cursor);
          }
        });
      }
      vertexIndices.forEach((vertex) => {
        if (attribute.getY(vertex) < 0.5) return;
        facadeBinding.activeVertices += 1;
        facadeBinding.minimumBottomY = Math.min(facadeBinding.minimumBottomY, attribute.getZ(vertex));
        facadeBinding.maximumBottomY = Math.max(facadeBinding.maximumBottomY, attribute.getZ(vertex));
        facadeBinding.styleValues.push(Number(attribute.getW(vertex).toFixed(4)));
        facadeBinding.normalX += Number(normals?.getX(vertex) || 0);
        facadeBinding.normalZ += Number(normals?.getZ(vertex) || 0);
      });
    }
    facadeBinding.styleValues = [...new Set(facadeBinding.styleValues)];
    const normalLength = Math.hypot(facadeBinding.normalX, facadeBinding.normalZ) || 1;
    facadeBinding.normalX /= normalLength;
    facadeBinding.normalZ /= normalLength;
    facadeBinding.normalDotEntrance = facadeBinding.normalX * entrance.normalX + facadeBinding.normalZ * entrance.normalZ;
    facadeBinding.approachInside = !!ctx.pointInPolygon?.(entrance.approachX, entrance.approachZ, support.footprint);
    return {
      id: entrance.id,
      buildingSourceId: entrance.buildingSourceId,
      archetype: entrance.archetype,
      doorStyle: entrance.doorStyle,
      prompt: document.getElementById('interiorPrompt')?.textContent || '',
      walkMode: ctx.Walk?.state?.mode || '',
      paused: ctx.paused,
      entranceMapSize: Number(ctx.buildingEntranceByBuilding?.size || 0),
      interiorApiLoaded: !String(ctx.updateInteriorInteraction || '').includes('_interiorsModulePromise'),
      groundY: Number(ctx.GroundHeight?.walkSurfaceY?.(entrance.approachX, entrance.approachZ)),
      supportKey: support?.key || '',
      facadeRay: {
        firstHitSourceId,
        targetSourceId: entrance.buildingSourceId,
        distance: Number(firstFacadeHit?.distance || 0),
        interpolatedEntrance
      },
      facadeBinding,
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
  assert.ok(result.facadeBinding.activeVertices >= 4,
    `${requestedArchetype} interaction was not bound to its rendered facade vertices: ${JSON.stringify(result)}`);
  assert.equal(result.facadeBinding.approachInside, false,
    `${requestedArchetype} approach was published inside the building: ${JSON.stringify(result)}`);
  assert.ok(result.facadeBinding.normalDotEntrance > 0.68,
    `${requestedArchetype} facade normal faces away from its approach: ${JSON.stringify(result)}`);
  assert.equal(result.facadeRay.firstHitSourceId, result.facadeRay.targetSourceId,
    `${requestedArchetype} entrance facade was occluded by a different building shell: ${JSON.stringify(result)}`);
  assert.ok(Number(result.facadeRay.interpolatedEntrance?.active || 0) > 0.9,
    `${requestedArchetype} center ray did not intersect an active entrance mask: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(Number(result.facadeRay.interpolatedEntrance?.tangentX || 0)) < 0.12,
    `${requestedArchetype} center ray missed the entrance atlas center: ${JSON.stringify(result)}`);
  await page.screenshot({ path: path.join(outputDir, screenshotName) });
  return result;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await launchBaltimore(desktop, 'desktop');
  const facade = await inspectFacade(desktop);
  assert.ok(facade.entranceCount > 0, 'Baltimore did not publish entrances');
  assert.ok(facade.archetypes.length >= 3, `expected at least three facade archetypes, saw ${facade.archetypes.join(', ')}`);
  assert.ok(facade.attributedMeshes > 0, 'batched building facades did not retain entrance attributes');
  assert.ok(facade.integratedClaims > 0, 'building materials do not claim integrated entrances');
  assert.deepEqual(facade.shaderOwners, ['engine/building-facade-materials']);
  assert.equal(facade.diagnostics?.addedDrawCalls, 0, 'entrances added a parallel draw layer');
  assert.equal(facade.diagnostics?.retainedDecorativeMeshes, 0, 'decorative door meshes were retained');
  assert.ok(Number(facade.diagnostics?.attributedVertices || 0) > 0, 'no wall vertices were attributed to entrances');
  assert.ok(Number(facade.diagnostics?.estimatedBatchedAttributeBytes || Infinity) < 2_000_000,
    `facade entrance attributes exceeded 2 MB: ${facade.diagnostics?.estimatedBatchedAttributeBytes}`);
  assert.equal(facade.diagnostics?.facadeIntegration, 'shader-integrated-wall-face');

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
    ctx.updateInteriorInteraction?.();
  });
  await desktop.keyboard.press('KeyE');
  await desktop.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interior?.active === true, null, { timeout: 30000 });
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
  await mobile.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interior?.active === true, null, { timeout: 30000 });
  await mobile.screenshot({ path: path.join(outputDir, '07-mobile-entered-interior.png') });
  const mobileState = await mobile.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      worldSequence: Number(ctx._worldLoadSequence || 0),
      active: !!ctx.activeInterior,
      facadeDrawCalls: Number(ctx.buildingFacadeEntrances?.diagnostics?.addedDrawCalls || 0)
    };
  });
  assert.equal(mobileState.active, true);
  assert.equal(mobileState.facadeDrawCalls, 0);
  await mobileContext.close();

  assert.deepEqual(fatalErrors, [], `fatal browser errors:\n${fatalErrors.join('\n')}`);
  console.log(JSON.stringify({
    facade,
    captured: captured.map(({ archetype, doorStyle, prompt, facadeBinding, entrance }) => ({ archetype, doorStyle, prompt, facadeBinding, entrance })),
    desktopSequence,
    mobileState,
    providerWarnings: providerWarnings.length,
    screenshots: outputDir
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
