import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'world-discovery-browser');
await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({ rootDir, host: '127.0.0.1', candidatePorts: [4337, 4338, 4339] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fatalErrors = [];

function recoverable(message) {
  return /Failed to load resource|net::ERR_|blocked by CORS|Firestore|Overpass|WorldCover|Shortbread|Terrarium|tile|429|500|502|503|504/i.test(message);
}

page.on('pageerror', (error) => fatalErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !recoverable(message.text())) fatalErrors.push(message.text());
});

async function launchBaltimore() {
  await page.goto(`http://127.0.0.1:${server.port}/app/?world-discovery-browser=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.selLoc = 'baltimore';
    ctx.customLocTransient = false;
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.ensureEarthRuntimeReady?.();
    await ctx.loadRoads();
    ctx.spawnOnRoad?.();
    ctx.setTravelMode?.('walk', { source: 'world-discovery-browser', force: true, emitTutorial: false });
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.worldLoading === false && state.worldDiscovery?.active === true && state.worldDiscovery.logicalEncounterSlots > 0;
  }, null, { timeout: 180000 });
}

try {
  await launchBaltimore();
  const target = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const slot = ctx.worldDiscoveryRuntime.publication.encounters.slots.find((entry) => entry.rarityBand === 'common' && ['surface', 'shallow'].includes(entry.depthBand));
    ctx.Walk.state.mode = 'walk';
    ctx.Walk.state.walker.x = slot.position.x;
    ctx.Walk.state.walker.z = slot.position.z;
    const walkSurface = Number(ctx.SurfaceQuery?.walkAt?.(slot.position.x, slot.position.z)?.position?.y);
    const surface = Number.isFinite(walkSurface) ? walkSurface : Number(ctx.terrainYAtWorld?.(slot.position.x, slot.position.z));
    if (Number.isFinite(surface)) ctx.Walk.state.walker.y = surface + 1.7;
    ctx.advanceRuntimeTime?.(500);
    return { id: slot.id, catalogId: slot.catalogId, depthBand: slot.depthBand };
  });

  assert.equal(await page.locator('#exploreMenu #fWorldDiscovery').count(), 1, 'Exploration menu lost the Field Journal entry');
  await page.evaluate(() => document.getElementById('fWorldDiscovery')?.click());
  await page.locator('#discoveryPanel.show').waitFor({ state: 'visible' });
  await page.locator('#discoverySectionTutorial:not([hidden])').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('tutorialHintCard')?.hidden !== false);
  await page.screenshot({ path: path.join(outputDir, 'detector-tutorial-desktop.png'), fullPage: false });
  await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.locator('#discoveryHelpBtn').click();
  await page.locator('#discoveryTutorial:not([hidden])').waitFor({ state: 'visible' });
  assert.match(await page.locator('#discoveryTutorial').innerText(), /signal grows stronger/i);
  await page.locator('#discoveryTutorialDoneBtn').click();
  assert.match(await page.locator('#discoveryGoal').innerText(), /first discovery/i);
  await page.locator('#discoveryPrimaryBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const targetId = ctx.worldDiscoveryRuntime?.session?.snapshot?.(ctx.Walk.state.walker)?.targetId;
    const slot = ctx.worldDiscoveryRuntime?.publication?.encounters?.slots?.find((entry) => entry.id === targetId);
    if (slot) {
      ctx.Walk.state.walker.x = slot.position.x;
      ctx.Walk.state.walker.z = slot.position.z;
      const walkSurface = Number(ctx.SurfaceQuery?.walkAt?.(slot.position.x, slot.position.z)?.position?.y);
      const surface = Number.isFinite(walkSurface) ? walkSurface : Number(ctx.terrainYAtWorld?.(slot.position.x, slot.position.z));
      if (Number.isFinite(surface)) ctx.Walk.state.walker.y = surface + 1.7;
      const collision = ctx.checkBuildingCollision?.(slot.position.x, slot.position.z, 1.8, { actorBaseY: surface, actorHeight: 2.1 });
      if (collision?.collision) throw new Error('detector target published inside obstructing building geometry');
    }
    await ctx.advanceRuntimeTime?.(150);
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.interaction?.phase === 'signal');
  await page.locator('#discoveryQuickToolBtn.show').click();
  await page.screenshot({ path: path.join(outputDir, 'detector-signal-desktop.png'), fullPage: false });

  await page.locator('#discoveryPrimaryBtn').click();
  let state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.worldDiscovery.interaction.phase, 'classified');
  assert.equal(state.worldDiscovery.interaction.depthBand, target.depthBand);

  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.interaction?.phase === 'excavating');
  const excavationPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const presentation = ctx.worldDiscoveryRuntime?.presentation;
    const activeToolId = ctx.worldDiscoveryRuntime?.session?.snapshot?.(ctx.Walk.state.walker)?.activeToolId;
    return {
      visible: presentation?.excavation?.visible === true,
      activeToolId,
      activeHeldTool: presentation?.holder?.children?.find((entry) => entry.visible)?.name || ''
    };
  });
  assert.equal(excavationPresentation.visible, true, 'excavation must create ground feedback');
  assert.equal(['hand-trowel', 'field-shovel'].includes(excavationPresentation.activeToolId), true, 'detector must switch to a real excavation tool');
  await page.screenshot({ path: path.join(outputDir, 'detector-excavation-desktop.png'), fullPage: false });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    await ctx.advanceRuntimeTime?.(1500);
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.interaction?.phase === 'revealed');
  const revealPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const reveal = ctx.worldDiscoveryRuntime?.presentation?.reveal;
    const world = new THREE.Vector3();
    reveal?.getWorldPosition?.(world);
    const ndc = world.clone().project(ctx.camera);
    return {
      visible: reveal?.visible === true,
      parentVisible: reveal?.parent?.visible === true,
      world: { x: world.x, y: world.y, z: world.z },
      ndc: { x: ndc.x, y: ndc.y, z: ndc.z }
    };
  });
  assert.equal(revealPresentation.visible, true);
  assert.equal(revealPresentation.parentVisible, true);
  await page.screenshot({ path: path.join(outputDir, 'detector-reveal-desktop.png'), fullPage: false });

  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.interaction?.phase === 'collected');
  await page.locator('#discoveryResultCard:not([hidden])').waitFor({ state: 'visible' });
  assert.match(await page.locator('#discoveryResultCard').innerText(), /Journal updated.*Field Guide evidence.*Collection/i);
  state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.worldDiscovery.interaction.claimState, 'claimed');
  assert.equal(state.worldDiscovery.interaction.collectionResult.collected, true);
  const collectedName = state.worldDiscovery.interaction.targetName;
  const collectedCatalogId = state.worldDiscovery.interaction.targetCatalogId;
  assert.ok(collectedName, 'collected detector result must expose its revealed name');
  await page.locator('[data-discovery-tab="collection"]').click();
  await page.locator('#discoverySectionTutorial:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction((name) => document.getElementById('discoveryCollectionList')?.textContent?.includes(name), collectedName);
  await page.screenshot({ path: path.join(outputDir, 'collection-desktop.png'), fullPage: false });

  await page.locator('[data-discovery-tab="today"]').click();
  await page.locator('[data-discovery-action="photograph"]').click();
  await page.waitForFunction(() => {
    const discovery = JSON.parse(globalThis.render_game_to_text()).worldDiscovery;
    return discovery?.activeActivityId === 'photograph' && discovery?.interaction?.phase === 'idle';
  });
  const photographTutorial = page.locator('#discoveryTutorial:not([hidden])');
  if (await photographTutorial.isVisible().catch(() => false)) await page.locator('#discoveryTutorialDoneBtn').click();
  await page.locator('#discoveryPrimaryBtn').click();
  await page.locator('#discoveryPanel').waitFor({ state: 'hidden' });
  await page.locator('#discoveryQuickToolBtn.show').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(outputDir, 'field-activity-collapsed-desktop.png'), fullPage: false });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const targetId = ctx.worldDiscoveryRuntime?.fieldSession?.snapshot?.()?.targetId;
    const slot = ctx.worldDiscoveryRuntime?.publication?.fieldActivities?.slots?.find((entry) => entry.id === targetId);
    if (slot) {
      ctx.Walk.state.walker.x = slot.position.x;
      ctx.Walk.state.walker.z = slot.position.z;
      const walkSurface = Number(ctx.SurfaceQuery?.walkAt?.(slot.position.x, slot.position.z)?.position?.y);
      const surface = Number.isFinite(walkSurface) ? walkSurface : Number(ctx.terrainYAtWorld?.(slot.position.x, slot.position.z));
      if (Number.isFinite(surface)) ctx.Walk.state.walker.y = surface + 1.7;
      const collision = ctx.checkBuildingCollision?.(slot.position.x, slot.position.z, 1.8, { actorBaseY: surface, actorHeight: 2.1 });
      if (collision?.collision) throw new Error('field target published inside obstructing building geometry');
    }
    await ctx.advanceRuntimeTime?.(2000);
  });
  await page.waitForFunction(() => {
    const discovery = JSON.parse(globalThis.render_game_to_text()).worldDiscovery;
    return discovery?.activeActivityId === 'photograph' && discovery?.interaction?.phase === 'revealed';
  });
  const fieldAnimalPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const subject = ctx.worldDiscoveryRuntime?.presentation?.fieldReveal;
    const world = new THREE.Vector3();
    subject?.getWorldPosition?.(world);
    const ndc = world.clone().project(ctx.camera);
    return {
      visible: subject?.visible === true,
      speciesId: subject?.userData?.worldDiscoveryNaturalHistory?.speciesId || null,
      ndc: { x: ndc.x, y: ndc.y, z: ndc.z }
    };
  });
  assert.equal(fieldAnimalPresentation.visible, true, 'wildlife field subject must be rendered in the world');
  assert.ok(fieldAnimalPresentation.speciesId, 'wildlife field subject must use a species-specific model');
  assert.equal(Math.abs(fieldAnimalPresentation.ndc.x) <= 1 && Math.abs(fieldAnimalPresentation.ndc.y) <= 1, true, 'wildlife field subject must remain on screen');
  await page.screenshot({ path: path.join(outputDir, 'field-animal-world-desktop.png'), fullPage: false });
  await page.locator('#discoveryQuickToolBtn.show').click();
  await page.locator('#discoveryInspection:not([hidden]) img').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#discoveryInspection img').evaluate((image) => image.complete && image.naturalWidth > 400), true);
  await page.locator('#discoveryPrimaryBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.interaction?.phase === 'recorded');
  await page.locator('#discoveryResultCard:not([hidden])').waitFor({ state: 'visible' });
  assert.match(await page.locator('#discoveryResultCard').innerText(), /No owned item created/i);
  await page.screenshot({ path: path.join(outputDir, 'field-record-desktop.png'), fullPage: false });

  await page.locator('[data-discovery-tab="guide"]').click();
  await page.locator('#discoverySectionTutorial:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#discoverySectionTutorialDoneBtn').click();
  await page.waitForFunction(() => document.getElementById('discoveryFieldGuideList')?.textContent?.includes('observation'));
  await page.screenshot({ path: path.join(outputDir, 'field-guide-desktop.png'), fullPage: false });
  await page.locator('[data-discovery-tab="progress"]').click();
  await page.locator('#discoverySectionTutorial:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#discoverySectionTutorialDoneBtn').click();
  assert.match(await page.locator('#discoveryProgress').innerText(), /CURRENT REGION.*Wildlife & Nature.*Geology & Fossils/s);
  await page.screenshot({ path: path.join(outputDir, 'progress-desktop.png'), fullPage: false });

  await page.locator('[data-discovery-tab="gear"]').click();
  await page.locator('#discoverySectionTutorial:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#discoverySectionTutorialDoneBtn').click();
  assert.equal(await page.locator('.discoveryGearItem.locked').filter({ hasText: 'Virtual Rock Hammer' }).count(), 1, 'Pathfinder geology gear should be visibly locked before 8 points');
  const locateCompanion = page.locator('[data-companion-action="locate"]').first();
  await locateCompanion.waitFor({ state: 'visible', timeout: 10000 });
  await locateCompanion.click();
  await page.locator('#discoveryPanel').waitFor({ state: 'hidden' });
  const worldCompanion = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const state = ctx.worldDiscoveryRuntime;
    const actor = state.publication.wildlife.actors.find((entry) => entry.companionPolicy === 'trust-sequence-required') ||
      state.publication.wildlife.actors.find((entry) => ['rock-pigeon', 'mallard'].includes(entry.speciesId));
    if (!actor) throw new Error('No world companion encounter was published');
    const companionId = actor.companionPolicy === 'trust-sequence-required'
      ? actor.speciesId
      : actor.speciesId === 'mallard' ? 'marsh-mallard' : 'city-pigeon';
    const interactions = [];
    Object.assign(ctx.Walk.state.walker, {
      x: actor.home.x + 2,
      z: actor.home.z + 2,
      y: Number(ctx.SurfaceQuery?.walkAt?.(actor.home.x, actor.home.z)?.position?.y || 0) + 1.7,
      vy: 0,
      onGround: true
    });
    ctx.advanceRuntimeTime?.(520);
    for (let step = 0; step < 3; step += 1) {
      const group = ctx.scene.getObjectByProperty('name', `World Discovery ${actor.label}`);
      if (!group) throw new Error(`World actor ${actor.id} has no visible model`);
      const interactionOffset = actor.companionPolicy === 'trust-sequence-required' ? .8 : 3.8;
      Object.assign(ctx.Walk.state.walker, {
        x: group.position.x + interactionOffset,
        z: group.position.z,
        y: group.position.y + 1.7,
        vy: 0,
        onGround: true
      });
      ctx.Walk.state.characterMesh?.position.set(group.position.x + interactionOffset, group.position.y, group.position.z);
      ctx.advanceRuntimeTime?.(320);
      const context = ctx.contextInteractionSnapshot?.();
      interactions.push(context?.active || null);
      if (context?.active?.id !== 'world_discovery_wildlife') throw new Error(`Animal did not own Action prompt: ${JSON.stringify(context)}`);
      await ctx.handlePrimaryContextInteraction();
      ctx.advanceRuntimeTime?.(1350);
    }
    ctx.advanceRuntimeTime?.(800);
    return { actorId: actor.id, speciesId: actor.speciesId, companionId, interactions, snapshot: state.companionRuntime.snapshot() };
  });
  assert.equal(worldCompanion.snapshot.activeCatalogId, worldCompanion.companionId);
  assert.equal(worldCompanion.interactions.length, 3);
  assert.ok(worldCompanion.interactions.every((interaction) => interaction?.id === 'world_discovery_wildlife'));
  const worldCompanionPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk.state.walker;
    ctx.worldDiscoveryRuntime?.companionRuntime?.update?.(walker, .25, 'walk', 'EARTH');
    await ctx.advanceRuntimeTime?.(520);
    return ctx.worldDiscoveryRuntime?.companionRuntime?.snapshot?.().presentation || null;
  });
  assert.equal(worldCompanionPresentation?.visible, true, 'adopted world companion must remain visibly embodied beside the player');
  assert.ok(Math.hypot(
    worldCompanionPresentation.position.x - (await page.evaluate(async () => (await import('/app/js/shared-context.js?v=55')).ctx.Walk.state.walker.x)),
    worldCompanionPresentation.position.z - (await page.evaluate(async () => (await import('/app/js/shared-context.js?v=55')).ctx.Walk.state.walker.z))
  ) < 6, 'adopted world companion must follow within the visible player neighborhood');
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.worldDiscoveryRuntime?.ui?.setOpen?.(true);
    await ctx.worldDiscoveryRuntime?.ui?.refreshData?.();
  });
  await page.locator('[data-discovery-tab="gear"]').click();
  await page.locator('[data-companion-action="feed"]').first().click();
  await page.locator('[data-companion-action="train"]').first().click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.companions?.companions?.[0]?.training?.find >= 1);
  await page.waitForFunction(() => document.getElementById('discoveryCompanionList')?.textContent?.includes('Find training 1/5'));
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.worldDiscoveryRuntime?.ui?.setOpen?.(false);
    await ctx.advanceRuntimeTime?.(800);
  });
  await page.locator('#discoveryPanel').waitFor({ state: 'hidden' });
  const companionFrame = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const companion = ctx.scene.getObjectByProperty('name', `World Discovery Active Companion ${ctx.worldDiscoveryRuntime?.companionRuntime?.snapshot?.().activeCatalogId}`);
    const character = ctx.Walk.state.characterMesh;
    const project = (object) => {
      const world = new THREE.Vector3();
      object?.getWorldPosition?.(world);
      const ndc = world.clone().project(ctx.camera);
      return {
        visible: object?.visible === true,
        world: { x: world.x, y: world.y, z: world.z },
        ndc: { x: ndc.x, y: ndc.y, z: ndc.z }
      };
    };
    const cameraSurfaceY = Number(ctx.SurfaceQuery?.walkAt?.(ctx.camera.position.x, ctx.camera.position.z)?.position?.y);
    return {
      camera: { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z, surfaceY: cameraSurfaceY },
      walker: { ...ctx.Walk.state.walker },
      cameraCollision: ctx.checkBuildingCollision?.(ctx.camera.position.x, ctx.camera.position.z, .28, {
        actorBaseY: ctx.camera.position.y - .28,
        actorHeight: .56
      }),
      walkerCollision: ctx.checkBuildingCollision?.(ctx.Walk.state.walker.x, ctx.Walk.state.walker.z, 1.5, {
        actorBaseY: ctx.Walk.state.walker.y - 1.7,
        actorHeight: 2.1
      }),
      character: project(character),
      companion: project(companion)
    };
  });
  assert.equal(companionFrame.cameraCollision?.collision, false, `companion camera remained inside facade geometry: ${JSON.stringify(companionFrame)}`);
  assert.equal(companionFrame.walkerCollision?.collision, false, `companion journey left the player inside facade geometry: ${JSON.stringify(companionFrame)}`);
  for (const [label, presentation] of [['player', companionFrame.character], ['companion', companionFrame.companion]]) {
    assert.equal(presentation?.visible, true, `${label} must be visible in the companion frame: ${JSON.stringify(companionFrame)}`);
    assert.equal(Math.abs(presentation.ndc.x) < .96 && Math.abs(presentation.ndc.y) < .96 && presentation.ndc.z >= -1 && presentation.ndc.z <= 1,
      true, `${label} must remain inside the companion frame: ${JSON.stringify(companionFrame)}`);
  }
  await page.screenshot({ path: path.join(outputDir, 'companion-desktop.png'), fullPage: false });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.worldDiscoveryRuntime?.ui?.setOpen?.(true);
  });
  await page.locator('[data-discovery-tab="gear"]').click();

  await page.evaluate(() => {
    try { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); } catch (_) {}
    try { Object.defineProperty(navigator, 'xr', { configurable: true, value: undefined }); } catch (_) {}
  });
  await page.locator('[data-companion-action="ar"]').first().click();
  const arLaunchDebug = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      shellClass: document.getElementById('arExperience')?.className || '',
      ar: ctx.getArPlatformSnapshot?.(),
      services: ctx.getPlatformServicesSnapshot?.(),
      environment: ctx.getEnv?.(),
      companion: ctx.worldDiscoveryRuntime?.companionRuntime?.snapshot?.()
    };
  });
  assert.equal(arLaunchDebug.ar?.phase, 'preview', `AR launch did not enter preview: ${JSON.stringify(arLaunchDebug)}`);
  await page.locator('#arExperience.show').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('arModeBadge')?.textContent === 'Interactive 3D');
  await page.locator('#arContinueBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).augmentedReality?.active === true);
  const arState = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text())).augmentedReality;
  assert.equal(arState.experienceType, 'companion');
  assert.equal(arState.capability.level, 'interactive-3d');
  assert.equal(arState.cameraActive, false);
  assert.equal(arState.cameraFramesStored, false);
  await page.screenshot({ path: path.join(outputDir, 'companion-ar-viewer-desktop.png'), fullPage: false });
  await page.locator('#arCloseBtn').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).augmentedReality?.phase === 'idle');

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const state = ctx.worldDiscoveryRuntime;
    if (state.companionRuntime.snapshot().companions.some((entry) => entry.catalogId === 'city-pigeon')) {
      await state.companionRuntime.setActive(state.companionRuntime.snapshot().companions.find((entry) => entry.catalogId === 'city-pigeon').instanceId);
      return;
    }
    const actor = state.publication.wildlife.actors.find((entry) => entry.speciesId === 'rock-pigeon');
    if (!actor) throw new Error('No rock pigeon world encounter was published for bird companion progression');
    for (let step = 0; step < 3; step += 1) {
      await state.handleWorldWildlifeInteraction({ data: {
        actorId: actor.id,
        speciesId: actor.speciesId,
        companionPolicy: actor.companionPolicy,
        x: actor.home.x,
        y: Number(ctx.SurfaceQuery?.walkAt?.(actor.home.x, actor.home.z)?.position?.y || 0) + 1.5,
        z: actor.home.z
      } });
      ctx.advanceRuntimeTime?.(1350);
    }
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text()).worldDiscovery?.companions?.activeCatalogId === 'city-pigeon');
  const birdCompanion = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.worldDiscoveryRuntime?.ui?.setOpen?.(false);
    await ctx.advanceRuntimeTime?.(800);
    const snapshot = ctx.worldDiscoveryRuntime?.companionRuntime?.snapshot?.();
    return snapshot?.presentation;
  });
  await page.locator('#discoveryPanel').waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(outputDir, 'companion-bird-desktop.png'), fullPage: false });
  assert.equal(birdCompanion.behaviorArchetype, 'air-follower', 'bird companion must use airborne following behavior');
  assert.equal(birdCompanion.visible, true, 'bird companion must be visible while walking');
  assert.ok(birdCompanion.renderedHeight > .15 && birdCompanion.renderedHeight < .3, 'pigeon companion scale must remain credible beside the character');
  assert.ok(birdCompanion.clearance > 1.2 && birdCompanion.clearance < 1.9, `bird companion must fly at a bounded shoulder-height clearance: ${JSON.stringify(birdCompanion)}`);

  const stored = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      profile: await ctx.discoveryProfileStore.getProfile(),
      items: await ctx.discoveryProfileStore.listItems(),
      events: await ctx.discoveryProfileStore.listEvents(),
      guide: await ctx.discoveryProfileStore.listFieldGuide()
    };
  });
  assert.equal(stored.profile.collectionCount >= 1, true);
  assert.equal(stored.profile.tutorials['metal-detector-v1'], true);
  assert.equal(stored.items.some((item) => item.catalogId === collectedCatalogId), true);
  assert.equal(stored.items.every((item) => item.tradeable === false && item.authority === 'anonymous-local'), true);
  assert.equal(stored.events.length >= 2, true, 'detector and photograph actions must both persist in the Journal');
  assert.equal(stored.events.every((event) => event.locationKey === 'baltimore'), true, 'Journal events must preserve a reusable preset location');
  assert.equal(stored.guide.length >= 2, true, 'detector and photograph identifications must project into the Field Guide');
  assert.equal(stored.items.some((item) => item.activityId === 'photograph'), false, 'photographs must not become owned Collection items');
  state = JSON.parse(await page.evaluate(() => globalThis.render_game_to_text()));
  assert.equal(state.worldDiscovery.wildlife.logical <= 8, true);
  assert.equal(state.worldDiscovery.wildlife.generatedWithAdditionalProviderQueries, false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.worldDiscoveryRuntime?.ui?.setOpen?.(true);
  });
  await page.locator('[data-discovery-tab="today"]').click();
  await page.screenshot({ path: path.join(outputDir, 'detector-mobile.png'), fullPage: false });

  assert.deepEqual(fatalErrors, [], `fatal browser errors: ${fatalErrors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    target,
    revealPresentation,
    excavationPresentation,
    collectionCount: stored.profile.collectionCount,
    birdCompanion,
    screenshots: ['detector-tutorial-desktop.png', 'detector-signal-desktop.png', 'detector-excavation-desktop.png', 'detector-reveal-desktop.png', 'collection-desktop.png', 'field-activity-collapsed-desktop.png', 'field-animal-world-desktop.png', 'field-record-desktop.png', 'field-guide-desktop.png', 'progress-desktop.png', 'companion-desktop.png', 'companion-ar-viewer-desktop.png', 'companion-bird-desktop.png', 'detector-mobile.png']
  }, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
