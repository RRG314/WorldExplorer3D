import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];

page.on('pageerror', (error) => failures.push(String(error?.stack || error)));
await page.route('**/assets/models/characters/*.glb', (route) => route.abort('failed'));

try {
  await page.goto(`${baseUrl}/app/?curated-character-fallback=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });

  let fallbackReady = false;
  for (let attempt = 0; attempt < 120 && !fallbackReady; attempt += 1) {
    fallbackReady = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const character = ctx.Walk?.state?.characterMesh;
      const npcs = ctx.urbanSandboxRuntime?.npcs || [];
      return !!character && character.userData.curatedCharacterLoadStarted === false &&
        npcs.some((npc) => npc.visual?.root?.userData?.curatedCharacterLoadStarted === false);
    });
    if (!fallbackReady) await page.waitForTimeout(250);
  }
  assert.equal(fallbackReady, true, 'Character asset failure states did not settle.');

  const result = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const character = ctx.Walk.state.characterMesh;
    const npcRoots = (ctx.urbanSandboxRuntime?.npcs || []).map((npc) => npc.visual.root);
    const inspectFallback = (root) => {
      const parts = [];
      root.traverse((child) => {
        if (child.userData?.defaultCharacterFallback === true) parts.push(child);
      });
      return { parts: parts.length, visible: parts.filter((part) => part.visible).length };
    };
    return {
      player: inspectFallback(character),
      playerCuratedAssetId: character.userData.curatedCharacterAssetId || '',
      npcs: npcRoots.map((root) => ({
        ...inspectFallback(root),
        proceduralCharacterMeshes: Number(root.userData.proceduralCharacterMeshCount || 0)
      })),
      curatedNpcCount: npcRoots.filter((root) => root.userData.curatedCharacterAssetId).length
    };
  });

  assert.ok(result.player.parts > 0);
  assert.equal(result.player.visible, result.player.parts);
  assert.equal(result.playerCuratedAssetId, '');
  assert.ok(result.npcs.length > 0);
  assert.ok(result.npcs.every((npc) => npc.parts === 0 && npc.visible === 0 && npc.proceduralCharacterMeshes === 0));
  assert.equal(result.curatedNpcCount, 0);

  const incidentAccepted = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const actor = ctx.Walk?.state?.walker;
    return ctx.urbanSandboxRuntime?.reportCivicEvent?.({
      kind: 'vehicle_collision',
      position: { x: Number(actor?.x || 0), y: Number(actor?.y || 0), z: Number(actor?.z || 0) },
      radius: 500,
      audibleRadius: 500,
      maximumWitnesses: 3,
      forceWitness: true
    })?.accepted === true;
  });
  assert.equal(incidentAccepted, true);
  let responderFallback = null;
  for (let attempt = 0; attempt < 220; attempt += 1) {
    responderFallback = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const officer = ctx.urbanSandboxRuntime?.responders?.snapshot?.()?.responders?.find((entry) => entry.officer)?.officer;
      if (!officer) return null;
      const root = ctx.urbanSandboxRuntime.responders.targets().find((entry) => entry.kind === 'responder_officer')?.ref?.visual?.root;
      if (!root || root.userData.curatedCharacterLoadStarted !== false) return null;
      const parts = [];
      root.traverse((child) => { if (child.userData?.defaultCharacterFallback === true) parts.push(child); });
      return {
        curatedAssetId: root.userData.curatedCharacterAssetId || '',
        parts: parts.length,
        visible: parts.filter((part) => part.visible).length
      };
    });
    if (responderFallback) break;
    await page.evaluate(() => globalThis.advanceTime?.(240));
    await page.waitForTimeout(40);
  }
  assert.ok(responderFallback, 'The responder failure state did not settle.');
  assert.equal(responderFallback.parts, 0);
  assert.equal(responderFallback.visible, 0);
  assert.equal(responderFallback.curatedAssetId, '');

  await page.goto(`${baseUrl}/app/?launch=space&curated-character-fallback-ship=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(() => {
    document.getElementById('spaceLaunchToggle')?.click();
    document.getElementById('startBtn')?.click();
  });
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
  if (await page.locator('#spaceFlightHUD').evaluate((element) => element.classList.contains('collapsed'))) await page.locator('#sfHudToggle').click();
  await page.locator('#sfExpeditionBtn').click();
  await page.locator('#expeditionOverlay').waitFor({ state: 'visible' });
  await page.locator('#expeditionPlan').click();
  await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
  await page.locator('#expeditionEnterShip').click();
  await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const layer = ctx.scene?.getObjectByName?.('solis-reach-crew-layer');
    return layer?.children?.length === 7 && layer.children.every((root) => root.userData.curatedCharacterLoadStarted === false);
  }, null, { timeout: 60_000 });
  const crewFallback = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const roots = ctx.scene?.getObjectByName?.('solis-reach-crew-layer')?.children || [];
    return roots.map((root) => {
      const parts = [];
      root.traverse((child) => { if (child.userData?.defaultCharacterFallback === true) parts.push(child); });
      return {
        curatedAssetId: root.userData.curatedCharacterAssetId || '',
        parts: parts.length,
        visible: parts.filter((part) => part.visible).length,
        proceduralCharacterMeshes: Number(root.userData.proceduralCharacterMeshCount || 0)
      };
    });
  });
  assert.equal(crewFallback.length, 7);
  assert.ok(crewFallback.every((crew) => crew.parts === 0 && crew.visible === 0 && crew.curatedAssetId === '' && crew.proceduralCharacterMeshes === 0));
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, ...result, responderFallback, crewFallback }, null, 2));
} finally {
  await browser.close();
}
