import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-traffic-family');
await fs.mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];
const assetRequests = new Map();

function observe(page, label) {
  page.on('pageerror', (error) => failures.push(`${label} pageerror: ${error.stack || error}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/app/assets/models/vehicles/traffic/')) return;
    const pathname = new URL(url).pathname;
    assetRequests.set(pathname, Number(assetRequests.get(pathname) || 0) + 1);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failures.push(`${label} ${response.status()} ${response.url()}`);
  });
}

async function openEarth(page, label) {
  await page.goto(`${baseUrl}/app/?curated-traffic-family=${label}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible().catch(() => false)) await deny.click();
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.evaluate(() => {
    const tutorialSkip = document.querySelector('.tutorial-text-btn');
    if (tutorialSkip instanceof HTMLElement && tutorialSkip.offsetParent) tutorialSkip.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.urbanSandbox?.active === true && state.urbanSandbox.vehicleCount > 0;
  }, null, { timeout: 120_000 });
}

async function curatedPresentation(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (ctx.urbanSandboxRuntime?.vehicles || []).filter((vehicle) => vehicle.visual?.root?.userData?.curatedTrafficAssetId).map((vehicle) => {
      const root = vehicle.visual.root;
      let fallbackMeshCount = 0;
      let visibleFallbackMeshCount = 0;
      root.traverse((object) => {
        if (!object?.isMesh || object.userData.defaultTrafficVehicleFallback !== true) return;
        fallbackMeshCount += 1;
        if (object.visible !== false) visibleFallbackMeshCount += 1;
      });
      const attachment = root.userData.curatedTrafficVehicleAttachment;
      const bounds = new THREE.Box3().setFromObject(attachment.visual);
      const size = bounds.getSize(new THREE.Vector3());
      return {
        id: vehicle.id,
        assetId: root.userData.curatedTrafficAssetId,
        variantId: vehicle.variant.id,
        source: vehicle.source,
        ambientTraffic: vehicle.ambientTraffic === true,
        x: vehicle.x,
        y: vehicle.y,
        z: vehicle.z,
        yaw: vehicle.yaw,
        color: vehicle.color,
        collisionPolicy: attachment.visual.userData.collisionPolicy,
        performanceProfile: attachment.visual.userData.performanceProfile,
        fallbackMeshCount,
        visibleFallbackMeshCount,
        curatedVisualCount: root.children.filter((child) => child.userData?.curatedTrafficAssetId).length,
        size: { x: size.x, y: size.y, z: size.z }
      };
    });
  });
}

async function frameVehicle(page, vehicleId) {
  await page.evaluate(async (id) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const vehicle = ctx.urbanSandboxRuntime?.vehicles?.find((entry) => entry.id === id);
    const walker = ctx.Walk?.state?.walker;
    if (!vehicle || !walker) return;
    const backX = Math.sin(vehicle.yaw) * -7;
    const backZ = Math.cos(vehicle.yaw) * -7;
    Object.assign(walker, {
      x: vehicle.x + backX,
      y: vehicle.y,
      z: vehicle.z + backZ,
      angle: vehicle.yaw,
      yaw: vehicle.yaw,
      lookYawOffset: 0,
      pitch: -0.08,
      vy: 0,
      onGround: true
    });
  }, vehicleId);
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const tutorialSkip = document.querySelector('.tutorial-text-btn');
    if (tutorialSkip instanceof HTMLElement && tutorialSkip.offsetParent) tutorialSkip.click();
  });
  await page.waitForTimeout(120);
}

async function activeJourney(viewport, label) {
  const mobile = viewport.width < 600;
  const context = await browser.newContext({ viewport, hasTouch: mobile });
  const page = await context.newPage();
  observe(page, label);
  try {
    await openEarth(page, label);
    let presentation = [];
    for (let attempt = 0; attempt < 480 && presentation.length === 0; attempt += 1) {
      presentation = await curatedPresentation(page);
      if (presentation.length === 0) await page.waitForTimeout(250);
    }
    assert.ok(presentation.length >= 1);
    assert.ok(presentation.length <= (mobile ? 2 : 4));
    assert.equal(new Set(presentation.map((entry) => entry.assetId)).size, presentation.length);
    for (const entry of presentation) {
      assert.equal(entry.collisionPolicy, 'existing-road-vehicle-envelope');
      assert.ok(entry.fallbackMeshCount > 0);
      assert.equal(entry.visibleFallbackMeshCount, 0);
      assert.equal(entry.curatedVisualCount, 1);
      assert.equal(entry.performanceProfile.maxInstances, 1);
      assert.ok(entry.size.y > 1.2 && entry.size.y < 1.9, JSON.stringify(entry));
      const horizontalExtents = [entry.size.x, entry.size.z].sort((left, right) => left - right);
      assert.ok(horizontalExtents[0] > 1.4 && horizontalExtents[0] < 3.4, JSON.stringify(entry));
      assert.ok(horizontalExtents[1] > 3.4 && horizontalExtents[1] < 5.1, JSON.stringify(entry));
    }

    await frameVehicle(page, presentation[0].id);
    await page.screenshot({ path: path.join(evidenceDir, `${label}-close-traffic.png`), fullPage: false });

    const damageTarget = presentation[1] || presentation[0];
    const damageResult = damageTarget ? await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const vehicle = ctx.urbanSandboxRuntime.vehicles.find((entry) => entry.id === id);
      vehicle.visual.setCondition(.72);
      let visibleFallbackMeshCount = 0;
      vehicle.visual.root.traverse((object) => {
        if (object?.isMesh && object.userData.defaultTrafficVehicleFallback === true && object.visible !== false) visibleFallbackMeshCount += 1;
      });
      return {
        curatedAssetId: vehicle.visual.root.userData.curatedTrafficAssetId || '',
        attachmentPresent: Boolean(vehicle.visual.root.userData.curatedTrafficVehicleAttachment),
        visibleFallbackMeshCount,
        condition: vehicle.visual.root.userData.condition
      };
    }, damageTarget.id) : null;
    if (damageResult) {
      assert.equal(damageResult.curatedAssetId, '');
      assert.equal(damageResult.attachmentPresent, false);
      assert.ok(damageResult.visibleFallbackMeshCount > 0);
      assert.equal(damageResult.condition, .72);
    }

    const enterResult = await page.evaluate(async (id) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const vehicle = ctx.urbanSandboxRuntime.vehicles.find((entry) => entry.id === id);
      const snapshot = ctx.urbanSandboxRuntimeSnapshot();
      const entry = snapshot.vehicles.find((candidate) => candidate.id === id);
      Object.assign(ctx.Walk.state.walker, {
        x: entry.driverDoor.x,
        z: entry.driverDoor.z,
        y: vehicle.y,
        vy: 0,
        onGround: true
      });
      const accepted = ctx.enterUrbanVehicleByIdForSupport(id);
      await globalThis.advanceTime?.(900);
      const after = ctx.urbanSandboxRuntimeSnapshot();
      let visibleFallbackMeshCount = 0;
      vehicle.visual.root.traverse((object) => {
        if (object?.isMesh && object.userData.defaultTrafficVehicleFallback === true && object.visible !== false) visibleFallbackMeshCount += 1;
      });
      return {
        accepted,
        phase: after.phase,
        activeVehicleId: after.activeVehicleId,
        curatedAssetId: vehicle.visual.root.userData.curatedTrafficAssetId || '',
        attachmentPresent: Boolean(vehicle.visual.root.userData.curatedTrafficVehicleAttachment),
        visibleFallbackMeshCount,
        mountedUnderPlayerCar: vehicle.visual.root.parent === ctx.carMesh,
        e34Visible: ctx.carMesh.userData.curatedVehicleVisual?.visible === true,
        carVariantId: ctx.car.vehicleVariantId
      };
    }, presentation[0].id);
    assert.equal(enterResult.accepted, true);
    assert.equal(enterResult.phase, 'driving');
    assert.equal(enterResult.activeVehicleId, presentation[0].id);
    assert.equal(enterResult.curatedAssetId, '');
    assert.equal(enterResult.attachmentPresent, false);
    assert.ok(enterResult.visibleFallbackMeshCount > 0);
    assert.equal(enterResult.mountedUnderPlayerCar, true);
    assert.equal(enterResult.e34Visible, false);
    assert.equal(enterResult.carVariantId, presentation[0].variantId);

    const exitResult = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.car.speed = 0;
      const accepted = ctx.exitUrbanVehicleForSupport();
      await globalThis.advanceTime?.(900);
      const after = ctx.urbanSandboxRuntimeSnapshot();
      return { accepted, phase: after.phase, activeVehicleId: after.activeVehicleId };
    });
    assert.deepEqual(exitResult, { accepted: true, phase: 'walking', activeVehicleId: '' });

    const teardown = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const refs = ctx.urbanSandboxRuntime.vehicles.map((vehicle) => vehicle.visual.root);
      ctx.disposeUrbanSandboxRuntime('curated-traffic-family-test');
      return {
        active: ctx.urbanSandboxRuntimeSnapshot().active,
        attachmentCount: refs.filter((root) => root.userData.curatedTrafficVehicleAttachment).length,
        curatedIdCount: refs.filter((root) => root.userData.curatedTrafficAssetId).length
      };
    });
    assert.deepEqual(teardown, { active: false, attachmentCount: 0, curatedIdCount: 0 });
    return { label, mobile, presentation, damageResult, enterResult, exitResult, teardown };
  } finally {
    await context.close();
  }
}

async function fallbackJourney() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  let blockedRequests = 0;
  await context.route('**/app/assets/models/vehicles/traffic/*.glb', (route) => {
    blockedRequests += 1;
    return route.abort('failed');
  });
  const page = await context.newPage();
    observe(page, 'blocked-mobile');
  try {
    await openEarth(page, 'blocked-mobile');
    await page.waitForTimeout(1_500);
    const result = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        curatedCount: ctx.urbanSandboxRuntime.vehicles.filter((vehicle) => vehicle.visual.root.userData.curatedTrafficAssetId).length,
        vehicles: ctx.urbanSandboxRuntime.vehicles.map((vehicle) => {
          let fallbackMeshCount = 0;
          let visibleFallbackMeshCount = 0;
          vehicle.visual.root.traverse((object) => {
            if (!object?.isMesh || object.userData.defaultTrafficVehicleFallback !== true) return;
            fallbackMeshCount += 1;
            if (object.visible !== false) visibleFallbackMeshCount += 1;
          });
          return { id: vehicle.id, fallbackMeshCount, visibleFallbackMeshCount };
        })
      };
    });
    assert.equal(result.curatedCount, 0);
    assert.ok(blockedRequests > 0);
    assert.ok(result.vehicles.length > 0);
    assert.ok(result.vehicles.every((vehicle) => vehicle.fallbackMeshCount > 0 && vehicle.visibleFallbackMeshCount === vehicle.fallbackMeshCount));
    await page.screenshot({ path: path.join(evidenceDir, 'mobile-load-fallback.png'), fullPage: false });
    return { ...result, blockedRequests };
  } finally {
    await context.close();
  }
}

try {
  const results = [
    await activeJourney({ width: 1440, height: 900 }, 'desktop'),
    await activeJourney({ width: 390, height: 844 }, 'mobile')
  ];
  const fallback = await fallbackJourney();
  assert.deepEqual(failures, []);
  assert.ok(assetRequests.size >= 1);
  assert.ok([...assetRequests.values()].every((count) => count <= 3));
  const report = { ok: true, results, fallback, assetRequests: Object.fromEntries([...assetRequests].sort()), failures };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
