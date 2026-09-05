import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-character-gender');
const familyAssetIds = [
  'character-city-explorer-v1',
  'character-city-explorer-woman-casual-v1',
  'character-city-explorer-casual-v1',
  'character-city-explorer-woman-worker-v1'
];
const femaleNpcAssetIds = familyAssetIds.filter((id) => id.includes('-woman-'));
const maleNpcAssetIds = familyAssetIds.filter((id) => !id.includes('-woman-'));

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

async function startCurrentEarth(page) {
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
}

async function openEarth(page, marker) {
  await page.goto(`${baseUrl}/app/?curated-character-gender=${marker}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await startCurrentEarth(page);
}

async function waitForDetailedFamily(page) {
  await page.waitForFunction((allowed) => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const npcs = state.urbanSandbox?.interactiveNpcs || [];
    return npcs.length >= 4 && npcs.every((npc) => allowed.includes(npc.curatedAssetId));
  }, familyAssetIds, { timeout: 120_000 });
}

async function inspectCharacters(page) {
  return page.evaluate(async ({ allowed, femaleIds, maleIds }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const player = ctx.Walk?.state?.characterMesh;
    const npcs = ctx.urbanSandboxRuntime?.npcs || [];
    const inspectRoot = (root) => {
      let fallbackMeshCount = 0;
      let visibleFallbackMeshCount = 0;
      root?.traverse?.((object) => {
        if (!object?.isMesh || object.userData?.defaultCharacterFallback !== true) return;
        fallbackMeshCount += 1;
        if (object.visible !== false) visibleFallbackMeshCount += 1;
      });
      return { fallbackMeshCount, visibleFallbackMeshCount };
    };
    const npcAssetIds = npcs.map((npc) => String(npc.visual?.root?.userData?.curatedCharacterAssetId || ''));
    return {
      preference: ctx.getPlayerCharacterGender?.() || '',
      playerAssetId: String(player?.userData?.curatedCharacterAssetId || ''),
      playerFallback: inspectRoot(player),
      playerActions: Object.fromEntries(Object.entries(player?.userData?.characterActions || {}).map(([name, action]) => [name, action.getEffectiveWeight()])),
      npcCount: npcs.length,
      npcAssetIds,
      allNpcsCurated: npcAssetIds.length > 0 && npcAssetIds.every((id) => allowed.includes(id)),
      femaleNpcCount: npcAssetIds.filter((id) => femaleIds.includes(id)).length,
      maleNpcCount: npcAssetIds.filter((id) => maleIds.includes(id)).length,
      visibleNpcFallbackCount: npcs.reduce((count, npc) => count + inspectRoot(npc.visual?.root).visibleFallbackMeshCount, 0),
      choice: [...document.querySelectorAll('[data-player-character-gender]')].map((button) => ({
        gender: button.dataset.playerCharacterGender,
        pressed: button.getAttribute('aria-pressed')
      }))
    };
  }, { allowed: familyAssetIds, femaleIds: femaleNpcAssetIds, maleIds: maleNpcAssetIds });
}

async function selectCharacter(page, gender) {
  await page.evaluate(() => {
    void import('/app/js/shared-context.js?v=55').then(({ ctx }) => ctx.toggleUrbanEquipment?.(true));
  });
  await page.locator('#urbanEquipment.show').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(`[data-player-character-gender="${gender}"]`).click();
  const assetId = gender === 'woman' ? 'character-field-explorer-woman-v1' : 'character-field-explorer-v1';
  await page.waitForFunction((expected) => {
    const root = globalThis.Walk?.state?.characterMesh;
    return root?.userData?.curatedCharacterAssetId === expected;
  }, assetId, { timeout: 120_000 });
  await page.waitForFunction((selected) => document.querySelector(`[data-player-character-gender="${selected}"]`)?.getAttribute('aria-pressed') === 'true', gender);
  return assetId;
}

async function positionFamilyForEvidence(page) {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.toggleUrbanEquipment?.(false);
    const walker = ctx.Walk?.state?.walker;
    const npcs = (ctx.urbanSandboxRuntime?.npcs || []).slice(0, 4);
    if (!walker || npcs.length < 4) return;
    const offsets = [[-2.6, -5.5], [-.85, -6.2], [.9, -6.2], [2.65, -5.5]];
    npcs.forEach((npc, index) => {
      npc.x = walker.x + offsets[index][0];
      npc.z = walker.z + offsets[index][1];
      npc.y = Number(ctx.SurfaceQuery?.walkAt?.(npc.x, npc.z)?.position?.y ?? walker.y);
      npc.yaw = Math.PI;
      npc.visual.root.position.set(npc.x, npc.y, npc.z);
      npc.visual.root.rotation.y = npc.yaw;
    });
    Object.assign(walker, { angle: Math.PI, yaw: Math.PI, lookYawOffset: 0, pitch: -0.04 });
  });
  await page.waitForTimeout(250);
}

async function normalJourney(viewport, label, verifyPersistence = false) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  observe(page, label);
  try {
    await openEarth(page, label);
    await page.waitForFunction(() => globalThis.Walk?.state?.characterMesh?.userData?.curatedCharacterAssetId === 'character-field-explorer-v1', null, { timeout: 120_000 });
    await waitForDetailedFamily(page);
    const initial = await inspectCharacters(page);
    assert.equal(initial.preference, 'man');
    assert.equal(initial.playerAssetId, 'character-field-explorer-v1');
    assert.equal(initial.playerFallback.visibleFallbackMeshCount, 0);
    assert.equal(initial.allNpcsCurated, true);
    assert.ok(initial.femaleNpcCount > 0, JSON.stringify(initial));
    assert.ok(initial.maleNpcCount > 0, JSON.stringify(initial));
    assert.equal(initial.visibleNpcFallbackCount, 0);

    await selectCharacter(page, 'woman');
    const woman = await inspectCharacters(page);
    assert.equal(woman.preference, 'woman');
    assert.equal(woman.playerAssetId, 'character-field-explorer-woman-v1');
    assert.equal(woman.playerFallback.visibleFallbackMeshCount, 0);
    assert.equal(woman.playerActions.idle, 1);
    assert.deepEqual(woman.choice, [
      { gender: 'man', pressed: 'false' },
      { gender: 'woman', pressed: 'true' }
    ]);
    await page.screenshot({ path: path.join(evidenceDir, `${label}-woman-choice.png`), fullPage: false });
    await positionFamilyForEvidence(page);
    await page.screenshot({ path: path.join(evidenceDir, `${label}-woman-and-npc-family.png`), fullPage: false });

    let persisted = null;
    if (verifyPersistence) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await startCurrentEarth(page);
      await page.waitForFunction(() => globalThis.Walk?.state?.characterMesh?.userData?.curatedCharacterAssetId === 'character-field-explorer-woman-v1', null, { timeout: 120_000 });
      await waitForDetailedFamily(page);
      persisted = await inspectCharacters(page);
      assert.equal(persisted.preference, 'woman');
      assert.equal(persisted.playerAssetId, 'character-field-explorer-woman-v1');
      assert.equal(persisted.allNpcsCurated, true);
      assert.equal(persisted.visibleNpcFallbackCount, 0);
      await selectCharacter(page, 'man');
      const switchedBack = await inspectCharacters(page);
      assert.equal(switchedBack.preference, 'man');
      assert.equal(switchedBack.playerAssetId, 'character-field-explorer-v1');
    }
    return { label, initial, woman, persisted };
  } finally {
    await context.close();
  }
}

async function blockedWomanFallbackJourney() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/app/assets/models/characters/field-explorer-woman-v1.glb', (route) => route.abort('failed'));
  const page = await context.newPage();
  observe(page, 'blocked-woman');
  try {
    await openEarth(page, 'blocked-woman');
    await page.waitForFunction(() => globalThis.Walk?.state?.characterMesh?.userData?.curatedCharacterAssetId === 'character-field-explorer-v1', null, { timeout: 120_000 });
    await page.evaluate(() => {
      void import('/app/js/shared-context.js?v=55').then(({ ctx }) => ctx.setPlayerCharacterGender?.('woman'));
    });
    await page.waitForFunction(() => {
      const root = globalThis.Walk?.state?.characterMesh;
      let visibleFallbacks = 0;
      root?.traverse?.((object) => {
        if (object?.isMesh && object.userData?.defaultCharacterFallback === true && object.visible !== false) visibleFallbacks += 1;
      });
      return root?.userData?.playerCharacterGender === 'woman' && !root?.userData?.curatedCharacterAssetId && visibleFallbacks > 0;
    }, null, { timeout: 30_000 });
    return page.evaluate(() => {
      const root = globalThis.Walk?.state?.characterMesh;
      let visibleFallbackMeshCount = 0;
      root?.traverse?.((object) => {
        if (object?.isMesh && object.userData?.defaultCharacterFallback === true && object.visible !== false) visibleFallbackMeshCount += 1;
      });
      return { preference: root?.userData?.playerCharacterGender, curatedAssetId: root?.userData?.curatedCharacterAssetId || '', visibleFallbackMeshCount };
    });
  } finally {
    await context.close();
  }
}

try {
  const results = [];
  results.push(await normalJourney({ width: 1440, height: 900 }, 'desktop', true));
  results.push(await normalJourney({ width: 390, height: 844 }, 'mobile'));
  const blockedFallback = await blockedWomanFallbackJourney();
  assert.equal(blockedFallback.preference, 'woman');
  assert.equal(blockedFallback.curatedAssetId, '');
  assert.ok(blockedFallback.visibleFallbackMeshCount > 0);
  assert.deepEqual(failures, []);
  const report = {
    ok: true,
    results,
    blockedFallback,
    assetRequests: Object.fromEntries([...assetRequests].sort()),
    failures
  };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
