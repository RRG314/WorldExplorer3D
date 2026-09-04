import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/interstellar-persistence');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const results = [];

async function openSpace(page, reload = false) {
  if (reload) await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  else await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
}

async function seedArchivedStation(page, suffix) {
  return page.evaluate(async (runSuffix) => {
    const [{ DEFAULT_CREW }, { createExpeditionPlan }, { createExpeditionStore }, outposts] = await Promise.all([
      import('/app/js/expedition/catalog.js?v=2'),
      import('/app/js/expedition/model.js?v=6'),
      import('/app/js/expedition/store.js?v=6'),
      import('/app/js/expedition/outpost.js?v=1')
    ]);
    const id = `persistence-${runSuffix}`;
    const contact = {
      id: `${id}-contact-733`, designation: `Aster Reach ${runSuffix}`, stableSeed: 733,
      spectralClass: 'dim red dwarf', worldClass: 'rocky world',
      resourceSignature: 'metal-bearing silicate regolith', status: 'surveyed', localOperationState: 'returned'
    };
    let expedition = createExpeditionPlan({ destinationId: 'proxima-centauri', crew: DEFAULT_CREW, id, createdAtMs: 71_000 });
    expedition = {
      ...expedition,
      progress: 0.65,
      routeContacts: [contact],
      resources: {
        ...expedition.resources,
        maintenanceKg: 180, feedstockKg: 220, powerMWh: 40, foodKg: 220, waterKg: 220
      }
    };
    expedition = outposts.createOutpostSite(expedition, contact.id, 71_100).expedition;
    expedition = outposts.constructOutpost(expedition, expedition.outposts[0].id, 71_200).expedition;
    expedition = {
      ...expedition,
      state: 'traveling',
      voyagePhase: 'cruise',
      strategicElapsedS: 12_345,
      crew: expedition.crew.map((member, index) => ({ ...member, ageYears: Number(member.ageYears) + index / 10 })),
      systems: { ...expedition.systems, sensors: { ...expedition.systems.sensors, condition: 0.83, status: 'operational' } },
      resources: { ...expedition.resources, scienceCargoKg: 7 },
      log: [...expedition.log, { atMissionS: 12_345, kind: 'science', message: 'The survey baseline was preserved for reload.' }]
    };
    const outpost = expedition.outposts[0];
    const store = createExpeditionStore();
    store.save(expedition);
    return {
      contact, outpost, activeKey: store.storageKey,
      fingerprint: {
        id: expedition.id,
        state: expedition.state,
        voyagePhase: expedition.voyagePhase,
        strategicElapsedS: expedition.strategicElapsedS,
        crew: expedition.crew.map((member) => [member.id, member.ageYears, member.health, member.assignment]),
        resources: expedition.resources,
        systems: expedition.systems,
        routeContacts: expedition.routeContacts,
        log: expedition.log,
        outposts: expedition.outposts
      }
    };
  }, suffix);
}

async function setWayfinderCourse(page, destinationId) {
  await page.locator('#universeToggle').click();
  await page.locator('#universeNavigator').waitFor({ state: 'visible' });
  await page.selectOption('#universeDestinationSelect', destinationId);
  await page.locator('#universeDestinationSelect').dispatchEvent('change');
  await page.locator('#universeTravelBtn').click();
}

async function run(viewport, name) {
  const context = await browser.newContext({ viewport, hasTouch: name === 'mobile' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name}: ${error.stack || error}`));
  try {
    await openSpace(page);
    const seeded = await seedArchivedStation(page, name);
    await openSpace(page, true);
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
    const activeReload = await page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition);
    const activeFingerprint = {
      id: activeReload.id,
      state: activeReload.state,
      voyagePhase: activeReload.voyagePhase,
      strategicElapsedS: activeReload.strategicElapsedS,
      crew: activeReload.crew.map((member) => [member.id, member.ageYears, member.health, member.assignment]),
      resources: activeReload.resources,
      systems: activeReload.systems,
      routeContacts: activeReload.routeContacts,
      log: activeReload.log,
      outposts: activeReload.outposts
    };
    assert.deepEqual(activeFingerprint, seeded.fingerprint);
    await page.locator('#expeditionClose').click();
    await page.evaluate(async () => {
      const { createExpeditionStore } = await import('/app/js/expedition/store.js?v=6');
      createExpeditionStore().clear();
    });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), seeded.activeKey), null);
    await openSpace(page, true);
    const bodyId = `${seeded.contact.id}-i`;
    const restored = await page.evaluate(async ({ contactId, childId, discoveryKey }) => {
      const [{ getUniverseDestinations, resolveUniverseAddress }, { createExpeditionArchive }] = await Promise.all([
        import('/app/js/universe/catalog.js?v=11'), import('/app/js/expedition/archive.js?v=1')
      ]);
      const destinations = getUniverseDestinations();
      return {
        systemCount: destinations.filter((entry) => entry.id === contactId).length,
        worldCount: destinations.filter((entry) => entry.id === childId).length,
        archiveCount: createExpeditionArchive().load().discoveries.filter((entry) => entry.id === contactId).length,
        systemAddress: resolveUniverseAddress(contactId)?.address,
        worldAddress: resolveUniverseAddress(childId)?.address,
        activeMissionPresent: localStorage.getItem('world-explorer:interstellar-expedition:v1') !== null,
        discoveryKeyPresent: localStorage.getItem(discoveryKey) !== null
      };
    }, { contactId: seeded.contact.id, childId: bodyId, discoveryKey: 'world-explorer:interstellar-discoveries:v1' });
    assert.deepEqual({ system: restored.systemCount, world: restored.worldCount, archive: restored.archiveCount }, { system: 1, world: 1, archive: 1 });
    assert.equal(restored.activeMissionPresent, false);
    assert.equal(restored.discoveryKeyPresent, true);
    assert.match(restored.systemAddress, new RegExp(`${seeded.contact.id}$`));
    assert.match(restored.worldAddress, new RegExp(`${bodyId}$`));

    const optionCount = await page.locator(`#universeDestinationSelect option[value="${seeded.contact.id}"]`).count();
    assert.equal(optionCount, 1);
    await setWayfinderCourse(page, seeded.contact.id);
    await page.waitForFunction((contactId) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.universeNavigation?.currentFrameId === contactId && state.universeNavigation?.transitionDestinationId == null;
    }, seeded.contact.id, { timeout: 30_000 });
    await setWayfinderCourse(page, bodyId);
    await page.waitForFunction((id) => JSON.parse(globalThis.render_game_to_text?.() || '{}').universeNavigation?.courseDestinationId === id, bodyId);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const target = ctx.getUniverseHudTarget();
      ctx.spaceFlight.rocket.position.set(target.position.x, target.position.y, target.position.z + target.radius + Math.max(12, target.radius * 2));
      ctx.spaceFlight.velocity.set(0, 0, 0);
      ctx.spaceFlight.speed = 0;
    });
    await page.waitForFunction(() => document.getElementById('sfLandBtn')?.disabled === false);
    if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
      await page.locator('#sfHudToggle').click();
    }
    await page.locator('#sfLandBtn').click();
    await page.waitForFunction(() => document.body.classList.contains('solid-world-active'), null, { timeout: 30_000 });
    await page.waitForFunction(() => document.getElementById('solidWorldPanel')?.textContent?.includes('Field Station'));
    const surface = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const stationBlocks = [];
      ctx.scene.traverse((object) => { if (object.userData?.buildAuthority === 'expedition-outpost') stationBlocks.push(object); });
      const first = stationBlocks[0];
      if (first && ctx.Walk?.state?.walker) Object.assign(ctx.Walk.state.walker, {
        x: first.position.x,
        z: first.position.z - 18,
        y: first.position.y + 1.2,
        angle: 0,
        yaw: 0,
        lookYawOffset: 0,
        pitch: 0,
        vy: 0,
        onGround: true
      });
      return {
        addressKey: ctx.planetarySurfaceAuthority.snapshot().active.addressKey,
        blockCount: stationBlocks.length,
        returnLabel: document.getElementById('solidWorldReturnBtn')?.textContent,
        panel: document.getElementById('solidWorldPanel')?.textContent
      };
    });
    assert.equal(surface.addressKey, seeded.outpost.worldAddressKey);
    assert.equal(surface.blockCount, seeded.outpost.blueprint.length);
    assert.match(surface.returnLabel, /Return to Space/);
    assert.match(surface.panel, new RegExp(seeded.outpost.name));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outputDir, `${name}-archived-station.png`), fullPage: true });

    await page.locator('#solidWorldReturnBtn').click();
    await page.waitForFunction((contactId) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.modes?.space === true && state.universeNavigation?.currentFrameId === contactId;
    }, seeded.contact.id, { timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, `${name}-returned-space.png`), fullPage: true });
    results.push({
      name, viewport, contactId: seeded.contact.id, outpostId: seeded.outpost.id,
      addressKey: surface.addressKey, structuralBlocks: surface.blockCount,
      uniqueSystemRecords: restored.systemCount, uniqueWorldRecords: restored.worldCount,
      activeJourneyReloaded: true
    });
  } finally {
    await context.close();
  }
}

try {
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
}
const report = { ok: failures.length === 0, baseUrl, results, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
