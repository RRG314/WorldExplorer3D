import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-character-family');
await fs.mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const assetRequests = new Map();

function observe(page, label) {
  page.on('pageerror', (error) => failures.push(`${label} pageerror: ${error.stack || error}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/app/assets/models/characters/')) return;
    const pathname = new URL(url).pathname;
    assetRequests.set(pathname, Number(assetRequests.get(pathname) || 0) + 1);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failures.push(`${label} ${response.status()} ${response.url()}`);
    }
  });
}

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function openEarth(page) {
  await page.goto(`${baseUrl}/app/?curated-character-family-earth=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
}

async function earthJourney(viewport, label) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  observe(page, label);
  try {
    await openEarth(page);
    const expectedNpcCount = viewport.width < 600 ? 1 : 2;
    await page.waitForFunction((expected) => {
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return (state.urbanSandbox?.interactiveNpcs || []).filter((npc) => npc.curatedAssetId).length === expected;
    }, expectedNpcCount, { timeout: 120_000 });

    const beforeIncident = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const player = ctx.Walk?.state?.characterMesh;
      const npcs = ctx.urbanSandboxRuntime?.npcs || [];
      const actor = ctx.Walk?.state?.walker;
      const result = ctx.urbanSandboxRuntime?.reportCivicEvent?.({
        kind: 'vehicle_collision',
        position: { x: Number(actor?.x || 0), y: Number(actor?.y || 0), z: Number(actor?.z || 0) },
        radius: 500,
        audibleRadius: 500,
        maximumWitnesses: 3,
        forceWitness: true
      });
      return {
        playerAssetId: player?.userData?.curatedCharacterAssetId || '',
        npcAssetIds: npcs.map((npc) => npc.visual?.root?.userData?.curatedCharacterAssetId || '').filter(Boolean).sort(),
        incidentAccepted: result?.accepted === true
      };
    });
    assert.equal(beforeIncident.playerAssetId, 'character-field-explorer-v1');
    assert.deepEqual(beforeIncident.npcAssetIds, expectedNpcCount === 1
      ? ['character-city-explorer-v1']
      : ['character-city-explorer-casual-v1', 'character-city-explorer-v1']);
    assert.equal(beforeIncident.incidentAccepted, true);

    let responderState = null;
    for (let attempt = 0; attempt < 220; attempt += 1) {
      responderState = (await snapshot(page)).urbanSandbox?.responders || null;
      const officer = responderState?.responders?.find((entry) => entry.officer)?.officer || null;
      if (officer?.curatedAssetId === 'character-civic-responder-v1') break;
      await page.evaluate(() => globalThis.advanceTime?.(240));
      await page.waitForTimeout(40);
    }
    const officer = responderState?.responders?.find((entry) => entry.officer)?.officer || null;
    assert.equal(officer?.curatedAssetId, 'character-civic-responder-v1', JSON.stringify(responderState));
    assert.ok(officer.fallbackMeshCount > 0);
    assert.equal(officer.visibleFallbackMeshCount, 0);

    await page.evaluate(async (officerPose) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const walker = ctx.Walk?.state?.walker;
      if (!walker) return;
      const yaw = Math.atan2(Number(officerPose.x) - Number(walker.x), Number(officerPose.z) - Number(walker.z));
      Object.assign(walker, { angle: yaw, yaw, lookYawOffset: 0, pitch: 0 });
    }, officer);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(evidenceDir, `${label}-earth-family.png`), fullPage: false });
    return { label, expectedNpcCount, beforeIncident, officer };
  } finally {
    await context.close();
  }
}

async function openShip(page) {
  await page.goto(`${baseUrl}/app/?launch=space&curated-character-family-ship=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) {
    await page.locator('#sfHudToggle').click();
  }
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionPlan').click();
  await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  await page.waitForFunction(() => {
    const crew = JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.crewPresentation || [];
    return crew.length === 7 && crew.every((member) => member.curatedAssetId === 'character-ship-crew-v1');
  }, null, { timeout: 60_000 });
}

async function shipJourney(viewport, label) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  observe(page, label);
  try {
    await openShip(page);
    await page.waitForTimeout(800);
    const presentation = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const crewLayer = ctx.scene?.getObjectByName?.('solis-reach-crew-layer');
      const roots = crewLayer?.children || [];
      globalThis.__WE3D_CREW_TEARDOWN_REFS__ = [...roots];
      const members = roots.map((root) => {
        const geometryIds = [];
        const materialIds = [];
        root.userData.curatedCharacterAttachment?.visual?.traverse?.((object) => {
          if (!object?.isMesh) return;
          if (object.geometry?.uuid) geometryIds.push(object.geometry.uuid);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { if (material?.uuid) materialIds.push(material.uuid); });
        });
        const actions = Object.fromEntries(Object.entries(root.userData.characterActions || {}).map(([name, action]) => [name, action.getEffectiveWeight()]));
        return {
          crewId: root.userData.crewId,
          curatedAssetId: root.userData.curatedCharacterAssetId || '',
          geometryIds: geometryIds.sort(),
          materialIds: materialIds.sort(),
          actions
        };
      });
      return { members, snapshot: ctx.getShipInteriorSnapshot?.() || null };
    });
    assert.equal(presentation.members.length, 7);
    assert.ok(presentation.members.every((member) => member.curatedAssetId === 'character-ship-crew-v1'));
    assert.ok(presentation.snapshot.crewPresentation.every((member) => member.fallbackMeshCount > 0 && member.visibleFallbackMeshCount === 0));
    assert.ok(presentation.members.every((member) => JSON.stringify(member.geometryIds) === JSON.stringify(presentation.members[0].geometryIds)));
    assert.ok(presentation.members.slice(1).every((member) => JSON.stringify(member.materialIds) !== JSON.stringify(presentation.members[0].materialIds)));
    assert.ok(presentation.members.every((member) => Number(member.actions.idle || 0) + Number(member.actions.walk || 0) > 0.99));

    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const crewLayer = ctx.scene?.getObjectByName?.('solis-reach-crew-layer');
      const target = crewLayer?.children?.find((root) => root.visible !== false);
      const walker = ctx.Walk?.state?.walker;
      if (!target || !walker) return;
      Object.assign(walker, {
        x: Number(target.position.x),
        z: Number(target.position.z) - 4.2,
        angle: 0,
        yaw: 0,
        lookYawOffset: 0,
        pitch: -0.04,
        vy: 0,
        onGround: true
      });
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(evidenceDir, `${label}-ship-crew.png`), fullPage: false });
    const deckResult = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const before = ctx.getShipInteriorSnapshot?.();
      ctx.switchSolisReachDeck?.('habitat');
      const habitat = ctx.getShipInteriorSnapshot?.();
      ctx.switchSolisReachDeck?.('engineering');
      const engineering = ctx.getShipInteriorSnapshot?.();
      return {
        before: { deckId: before?.deckId, visibleCrewCount: before?.visibleCrewCount },
        habitat: { deckId: habitat?.deckId, visibleCrewCount: habitat?.visibleCrewCount },
        engineering: { deckId: engineering?.deckId, visibleCrewCount: engineering?.visibleCrewCount }
      };
    });
    assert.equal(deckResult.before.deckId, 'command');
    assert.equal(deckResult.habitat.deckId, 'habitat');
    assert.equal(deckResult.engineering.deckId, 'engineering');
    assert.ok([deckResult.before, deckResult.habitat, deckResult.engineering].every((deck) => deck.visibleCrewCount > 0));

    const teardown = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const exited = ctx.exitExpeditionShipInterior?.() === true;
      const refs = globalThis.__WE3D_CREW_TEARDOWN_REFS__ || [];
      const result = {
        exited,
        rootPresent: Boolean(ctx.scene?.getObjectByName?.('expedition-ship:solis-reach')),
        attachmentCount: refs.filter((root) => root.userData.curatedCharacterAttachment).length,
        curatedIdCount: refs.filter((root) => root.userData.curatedCharacterAssetId).length
      };
      delete globalThis.__WE3D_CREW_TEARDOWN_REFS__;
      return result;
    });
    assert.deepEqual(teardown, { exited: true, rootPresent: false, attachmentCount: 0, curatedIdCount: 0 });
    return { label, crewCount: presentation.members.length, deckResult, teardown };
  } finally {
    await context.close();
  }
}

try {
  const results = [];
  results.push(await earthJourney({ width: 1440, height: 900 }, 'desktop'));
  results.push(await earthJourney({ width: 390, height: 844 }, 'mobile'));
  results.push(await shipJourney({ width: 1440, height: 900 }, 'desktop'));
  results.push(await shipJourney({ width: 390, height: 844 }, 'mobile'));
  assert.equal(assetRequests.get('/app/assets/models/characters/ship-crew-v1.glb'), 2, 'Each isolated ship context should request one crew template.');
  assert.deepEqual(failures, []);
  const report = { ok: true, results, assetRequests: Object.fromEntries([...assetRequests].sort()), failures };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
