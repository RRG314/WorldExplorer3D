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
  assert.equal(fallbackReady, true, 'The built-in characters did not recover after curated assets failed.');

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
      npcs: npcRoots.map(inspectFallback),
      curatedNpcCount: npcRoots.filter((root) => root.userData.curatedCharacterAssetId).length
    };
  });

  assert.ok(result.player.parts > 0);
  assert.equal(result.player.visible, result.player.parts);
  assert.equal(result.playerCuratedAssetId, '');
  assert.ok(result.npcs.length > 0);
  assert.ok(result.npcs.every((npc) => npc.parts > 0 && npc.visible === npc.parts));
  assert.equal(result.curatedNpcCount, 0);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
}
