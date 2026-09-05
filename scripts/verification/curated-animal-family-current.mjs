import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-animal-family');
const supported = Object.freeze({
  'trail-hound': 'animal-trail-hound-husky-v1',
  'field-retriever': 'animal-trail-hound-husky-v1',
  'park-terrier': 'animal-park-terrier-shiba-inu-v1',
  'pasture-cow': 'animal-pasture-cow-v1',
  'heritage-pig': 'animal-heritage-pig-v1',
  'field-horse': 'animal-field-horse-v1',
  'woodland-fox': 'animal-woodland-fox-v1'
});
const failures = [];
const animalRequests = new Map();

await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

function observe(page, label, intentionalBlockedAsset = '') {
  page.on('pageerror', (error) => failures.push(`${label} pageerror: ${error.stack || error}`));
  page.on('request', (request) => {
    if (!request.url().includes('/app/assets/models/animals/')) return;
    const pathname = new URL(request.url()).pathname;
    animalRequests.set(pathname, Number(animalRequests.get(pathname) || 0) + 1);
  });
  page.on('response', (response) => {
    if (!response.url().startsWith(baseUrl) || response.status() < 400) return;
    if (intentionalBlockedAsset && response.url().includes(intentionalBlockedAsset)) return;
    failures.push(`${label} ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith(baseUrl)) return;
    if (intentionalBlockedAsset && request.url().includes(intentionalBlockedAsset)) return;
    const reason = request.failure()?.errorText || 'failed';
    if (reason !== 'net::ERR_ABORTED') failures.push(`${label} ${reason} ${request.url()}`);
  });
}

async function startEarth(page, label) {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk', diagnostics: '1', animalTest: `${label}-${Date.now()}`
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const globeStart = page.locator('#globeSelectorStartBtn');
  if (await globeStart.isVisible().catch(() => false)) {
    await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
    await globeStart.click();
  } else {
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
  }
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 240_000 }).catch(() => {});
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.gameStarted === true && diagnostics.worldLoading === false &&
      !!globalThis.__WE3D_COMPANION_SUPPORT__ && !!globalThis.__WE3D_URBAN_CRASH_SUPPORT__;
  }, null, { timeout: 360_000 });
  const turnOffTips = page.getByRole('button', { name: 'Turn off tips', exact: true });
  if (await turnOffTips.isVisible().catch(() => false)) await turnOffTips.click();
}

async function adoptAndWait(page, speciesId, name) {
  await page.evaluate(({ speciesId, name }) => globalThis.__WE3D_COMPANION_SUPPORT__.adopt(speciesId, {
    name,
    discoveryId: `curated-animal-verification:${speciesId}:${Date.now()}`
  }), { speciesId, name });
  await page.waitForFunction(({ speciesId, assetId }) => {
    const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.();
    return snapshot?.activeCatalogId === speciesId &&
      snapshot?.presentation?.curatedAssetId === assetId &&
      snapshot?.presentation?.visibleFallbackMeshCount === 0;
  }, { speciesId, assetId: supported[speciesId] }, { timeout: 120_000 });
  return page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
}

async function inspectWorldDiscovery(page) {
  return page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery || null);
}

async function desktopJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  observe(page, 'desktop');
  try {
    await startEarth(page, 'desktop');
    const speciesResults = [];
    for (const speciesId of Object.keys(supported)) {
      const snapshot = await adoptAndWait(page, speciesId, speciesId === 'trail-hound' ? 'Scout' : `Test ${speciesId}`);
      speciesResults.push({
        speciesId,
        assetId: snapshot.presentation.curatedAssetId,
        activity: snapshot.presentation.curatedActivity,
        visibleFallbackMeshCount: snapshot.presentation.visibleFallbackMeshCount,
        renderedHeight: snapshot.presentation.renderedHeight
      });
    }

    const scout = await adoptAndWait(page, 'trail-hound', 'Scout');
    const beforePosition = scout.presentation.position;
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const walker = ctx.Walk.state.walker;
      walker.x += 7;
      walker.vx = 0;
      walker.vz = 0;
      if (ctx.Walk.state.characterMesh) {
        ctx.Walk.state.characterMesh.position.x = walker.x;
        ctx.Walk.state.characterMesh.position.z = walker.z;
      }
    });
    await page.waitForFunction((before) => {
      const current = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation?.position;
      return current && Math.hypot(current.x - before.x, current.z - before.z) > 2;
    }, beforePosition, { timeout: 15_000 });
    const afterFollow = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    assert.ok(['walk', 'run', 'idle'].includes(afterFollow.presentation.curatedActivity));

    await page.evaluate((instanceId) => globalThis.__WE3D_COMPANION_SUPPORT__.care(instanceId, 'feed'), afterFollow.activeInstanceId);
    await page.waitForFunction(() => globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation?.curatedActivity === 'eat', null, { timeout: 5_000 });
    const fed = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.awardXp(`curated-animal-xp:${Date.now()}`, 'field-activity'));
    await page.waitForFunction((beforeXp) => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot().companions
      .find((entry) => entry.active)?.progression?.totalXp > beforeXp, fed.companions.find((entry) => entry.active).progression.totalXp);
    const progressed = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());

    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(evidenceDir, 'desktop-scout-companion.png') });

    const vehicleId = await page.evaluate(() => globalThis.__WE3D_URBAN_CRASH_SUPPORT__.snapshot().vehicles.find((vehicle) => !vehicle.occupied)?.id || '');
    assert.ok(vehicleId, 'No enterable vehicle was available for companion travel verification.');
    await page.evaluate((id) => globalThis.__WE3D_URBAN_CRASH_SUPPORT__.enterVehicle(id), vehicleId);
    await page.waitForFunction(() => {
      const presentation = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation;
      return presentation?.travelState === 'vehicle-occupant' && presentation.visible === false;
    }, null, { timeout: 15_000 });
    const inVehicle = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.exitUrbanVehicleForSupport?.();
    });
    await page.waitForFunction(() => {
      const presentation = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.().presentation;
      return presentation?.travelState === 'following' && presentation.visible === true;
    }, null, { timeout: 15_000 });

    const beforeReload = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    await startEarth(page, 'desktop-reload');
    await page.waitForFunction(() => {
      const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.();
      return snapshot?.activeName === 'Scout' &&
        snapshot.presentation.curatedAssetId === 'animal-trail-hound-husky-v1' &&
        snapshot.presentation.visibleFallbackMeshCount === 0;
    }, null, { timeout: 120_000 });
    const afterReload = await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
    const worldDiscovery = await inspectWorldDiscovery(page);
    const supportedWildlife = (worldDiscovery?.wildlife?.models || []).filter((entry) => supported[entry.speciesId]);
    if (supportedWildlife.length) {
      await page.waitForFunction((mapping) => {
        const models = globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.wildlife?.models || [];
        return models.filter((entry) => mapping[entry.speciesId]).every((entry) =>
          entry.curatedAssetId === mapping[entry.speciesId] && entry.visibleFallbackMeshCount === 0
        );
      }, supported, { timeout: 120_000 });
    }
    return { speciesResults, beforePosition, afterFollow, fed, progressed, inVehicle, beforeReload, afterReload, worldDiscovery };
  } finally {
    await context.close();
  }
}

async function mobileJourney() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  observe(page, 'mobile');
  try {
    await startEarth(page, 'mobile');
    const snapshot = await adoptAndWait(page, 'park-terrier', 'Maple');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(evidenceDir, 'mobile-maple-companion.png') });
    return snapshot;
  } finally {
    await context.close();
  }
}

async function blockedFallbackJourney() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/app/assets/models/animals/trail-hound-husky-v1.glb', (route) => route.abort('failed'));
  const page = await context.newPage();
  observe(page, 'blocked-husky', 'trail-hound-husky-v1.glb');
  try {
    await startEarth(page, 'blocked-husky');
    await page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.adopt('trail-hound', {
      name: 'Fallback Scout', discoveryId: `blocked-husky:${Date.now()}`
    }));
    await page.waitForFunction(() => {
      const snapshot = globalThis.__WE3D_COMPANION_SUPPORT__?.snapshot?.();
      return snapshot?.activeCatalogId === 'trail-hound' &&
        !snapshot.presentation.curatedAssetId &&
        snapshot.presentation.visibleFallbackMeshCount > 0 &&
        snapshot.presentation.visible === true;
    }, null, { timeout: 30_000 });
    return page.evaluate(() => globalThis.__WE3D_COMPANION_SUPPORT__.snapshot());
  } finally {
    await context.close();
  }
}

try {
  const desktop = await desktopJourney();
  const mobile = await mobileJourney();
  const blockedFallback = await blockedFallbackJourney();
  assert.equal(desktop.speciesResults.length, Object.keys(supported).length);
  assert.ok(desktop.speciesResults.every((entry) => entry.assetId === supported[entry.speciesId] && entry.visibleFallbackMeshCount === 0));
  assert.equal(desktop.inVehicle.presentation.travelState, 'vehicle-occupant');
  assert.equal(desktop.inVehicle.presentation.visible, false);
  assert.ok(desktop.progressed.companions.find((entry) => entry.active).progression.totalXp > 0);
  assert.equal(desktop.afterReload.activeName, 'Scout');
  assert.equal(mobile.presentation.curatedAssetId, 'animal-park-terrier-shiba-inu-v1');
  assert.equal(mobile.presentation.visibleFallbackMeshCount, 0);
  assert.equal(blockedFallback.presentation.curatedAssetId, null);
  assert.ok(blockedFallback.presentation.visibleFallbackMeshCount > 0);
  assert.deepEqual(failures, []);
  const report = {
    ok: true,
    checks: {
      sevenSpeciesPresentationsLoaded: true,
      proceduralFallbackHiddenAfterLoad: true,
      followAndAnimationPreserved: true,
      feedingAnimationPreserved: true,
      progressionPreserved: true,
      vehicleTravelPolicyPreserved: true,
      reloadPersistencePreserved: true,
      mobilePresentationVerified: true,
      blockedAssetFallbackVerified: true,
      noUnexpectedBrowserOrLocalResourceFailures: true
    },
    desktop,
    mobile,
    blockedFallback,
    animalRequests: Object.fromEntries([...animalRequests].sort()),
    failures
  };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
