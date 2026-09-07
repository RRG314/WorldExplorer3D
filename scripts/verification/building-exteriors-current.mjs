import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4194').replace(/\/$/, '');
const outputDir = path.resolve(process.env.WE3D_VERIFY_OUTPUT || 'output/verification/building-exteriors/after/chrome');
const requested = String(process.env.WE3D_BUILDING_PILOTS || 'baltimore').split(',').map((value) => value.trim()).filter(Boolean);
const baselineMode = process.env.WE3D_BUILDING_BASELINE === '1';
const targetBuildingId = String(process.env.WE3D_BUILDING_TARGET_ID || '').trim();
const catalog = {
  baltimore: { name: 'Baltimore', lat: 39.2904, lon: -76.6122, preferredFamilies: ['mixed_use_storefront', 'narrow_urban_rowhouse'] },
  manhattan: { name: 'Manhattan', lat: 40.7580, lon: -73.9855, preferredFamilies: ['glass_office_highrise', 'modern_office', 'mixed_use_storefront'] },
  towson: { name: 'Towson', lat: 39.4015, lon: -76.6019, preferredFamilies: ['detached_suburban_house', 'small_multifamily'] },
  rotterdam: { name: 'Rotterdam', lat: 51.9480, lon: 4.1400, preferredFamilies: ['metal_warehouse', 'brick_warehouse', 'distribution_loading', 'industrial_factory'] },
  westminster: { name: 'Westminster', lat: 39.5754, lon: -76.9958, preferredFamilies: ['small_urban_storefront', 'detached_suburban_house'] },
  london: { name: 'London', lat: 51.5074, lon: -0.1278, preferredFamilies: ['wide_urban_townhouse', 'mixed_use_storefront', 'apartment_masonry'] },
  ames: { name: 'Ames', lat: 42.0308, lon: -93.6319, preferredFamilies: ['agricultural_farm', 'detached_suburban_house'] },
  tokyo: { name: 'Tokyo', lat: 35.6762, lon: 139.6503, preferredFamilies: ['apartment_modern', 'modern_office', 'glass_office_highrise'] }
};
const pilots = requested.map((id) => ({ id, ...(catalog[id] || catalog.baltimore) }));

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];

async function launchPilot(pilot) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  try {
    await page.goto(`${baseUrl}/app/?building-exteriors=${pilot.id}-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
    const deny = page.locator('#analyticsConsentDenyBtn');
    if (await deny.isVisible().catch(() => false)) await deny.click();
    await page.locator('#globeCustomLat').fill(String(pilot.lat));
    await page.locator('#globeCustomLon').fill(String(pilot.lon));
    await page.locator('#globeCustomLon').press('Enter');
    await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction((allowBaseline) => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.();
      return state?.gameStarted === true && state?.worldLoading === false &&
        (allowBaseline || state?.buildingExteriors?.catalog?.familyCount >= 20) &&
        document.getElementById('loading')?.classList.contains('show') !== true;
    }, baselineMode, { timeout: 300_000 });
    await page.evaluate(() => {
      const skip = [...document.querySelectorAll('button')].find((button) => /skip/i.test(button.textContent || '') && button.offsetParent);
      skip?.click();
    });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.setTimeOfDay?.('day');
    });
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: path.join(outputDir, `${pilot.id}-arrival.png`) });

    const walking = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk');
    if (!walking) {
      await page.locator('#travelBtn').click();
      await page.waitForSelector('#travelMenu.open', { timeout: 10_000 });
      await page.locator('#fWalk').click();
      await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === 'walk', null, { timeout: 20_000 });
    }

    const closeFacade = await page.evaluate(async ({ preferredFamilies, targetBuildingId }) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const entrances = [...(ctx.buildingEntranceByBuilding?.values?.() || [])];
      const valid = entrances.filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.z));
      const exact = targetBuildingId
        ? valid.filter((entry) => String(entry.buildingSourceId || '') === targetBuildingId)
        : [];
      const preferred = valid.filter((entry) => preferredFamilies.includes(entry.exteriorFamilyId));
      const entrance = (exact.length > 0 ? exact : preferred.length > 0 ? preferred : valid)
        .sort((a, b) => {
          const familyA = preferredFamilies.indexOf(a.exteriorFamilyId);
          const familyB = preferredFamilies.indexOf(b.exteriorFamilyId);
          const rankA = familyA < 0 ? preferredFamilies.length : familyA;
          const rankB = familyB < 0 ? preferredFamilies.length : familyB;
          return rankA - rankB || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
        })[0];
      const walker = ctx.Walk?.state?.walker;
      if (!entrance || !walker) return null;
      const normalX = Number(entrance.normalX) || 0;
      const normalZ = Number(entrance.normalZ) || 1;
      const yaw = Math.atan2(-normalX, -normalZ);
      walker.x = Number(entrance.x) + normalX * 8;
      walker.z = Number(entrance.z) + normalZ * 8;
      walker.y = Number(ctx.GroundHeight?.walkSurfaceY?.(walker.x, walker.z) ?? entrance.approachY ?? entrance.y ?? walker.y);
      walker.angle = yaw;
      walker.yaw = yaw;
      walker.lookYawOffset = 0;
      walker.pitch = 0.06;
      walker.vy = 0;
      walker.onGround = true;
      return {
        buildingSourceId: entrance.buildingSourceId,
        provenance: entrance.provenance,
        doorStyle: entrance.doorStyle,
        exteriorFamilyId: entrance.exteriorFamilyId,
        distance: Math.hypot(entrance.x, entrance.z)
      };
    }, { preferredFamilies: pilot.preferredFamilies || [], targetBuildingId });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: path.join(outputDir, `${pilot.id}-facade.png`) });

    const snapshot = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return {
        location: { lat: ctx.LOC?.lat, lon: ctx.LOC?.lon, name: ctx.LOC?.name },
        gameStarted: diagnostics.gameStarted,
        worldLoading: diagnostics.worldLoading,
        worldCounts: diagnostics.worldCounts,
        buildingExteriors: diagnostics.buildingExteriors,
        facadeEntrances: ctx.buildingFacadeEntrances?.diagnostics || null,
        renderer: diagnostics.renderer,
        performance: diagnostics.performance,
        textureStatus: diagnostics.buildingExteriorMaterials || null,
        runtimeErrors: diagnostics.runtimeErrors || []
      };
    });
    assert.equal(snapshot.gameStarted, true);
    assert.equal(snapshot.worldLoading, false);
    if (!baselineMode) {
      assert.ok(snapshot.buildingExteriors?.sourceBuildings > 0, `${pilot.id} did not publish exterior source buildings.`);
      assert.ok(snapshot.buildingExteriors?.addedDrawCalls <= 6, `${pilot.id} exterior details exceeded the six-batch draw-call budget.`);
      assert.ok(snapshot.buildingExteriors?.catalog?.familyCount >= 20);
      assert.equal(snapshot.buildingExteriors?.geometryAuthority, 'mapped-building-footprint-unchanged');
      assert.ok(snapshot.textureStatus?.materialCount < 1_000, `${pilot.id} created ${snapshot.textureStatus?.materialCount} shared facade materials.`);
      assert.ok(snapshot.textureStatus?.textures?.length < 200, `${pilot.id} created ${snapshot.textureStatus?.textures?.length} shared facade textures.`);
      assert.equal(snapshot.textureStatus?.textures?.some((texture) => texture.status === 'failed'), false);
    }
    return { pilot, closeFacade, snapshot, errors, failedResponses };
  } finally {
    await context.close();
  }
}

try {
  for (const pilot of pilots) results.push(await launchPilot(pilot));
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ baseUrl, results }, null, 2));
  const failures = results.flatMap((result) => [
    ...result.errors.map((error) => `${result.pilot.id}: ${error}`),
    ...result.failedResponses.map((response) => `${result.pilot.id}: HTTP ${response.status} ${response.url}`)
  ]);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, baseUrl, pilots: results.map((result) => ({
    id: result.pilot.id,
    buildings: result.snapshot.worldCounts?.buildings,
    details: result.snapshot.buildingExteriors,
    closeFacade: result.closeFacade
  })) }, null, 2));
} finally {
  await browser.close();
}
