import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = path.resolve('output/release-evidence/current/curated-responder-pursuit');
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
});

async function launchEarth() {
  await page.goto(`${baseUrl}/app/?curated-responder-pursuit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  const deny = page.locator('#analyticsConsentDenyBtn');
  if (await deny.isVisible().catch(() => false)) await deny.click();
  await page.waitForFunction(() => document.getElementById('globeSelectorStartBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.locator('#loading.show').waitFor({ state: 'hidden', timeout: 180_000 });
  await page.evaluate(() => {
    const skip = document.querySelector('.tutorial-text-btn');
    if (skip instanceof HTMLElement && skip.offsetParent) skip.click();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    return state.urbanSandbox?.active === true;
  }, null, { timeout: 120_000 });
}

try {
  await launchEarth();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk.state.walker;
    ctx.setPauseReason?.('responder-verification', true);
    // This focused browser journey exercises the local responder runtime. Room
    // authority has separate backend coverage and would overwrite the injected
    // deterministic incident used here.
    ctx.urbanSandboxRuntime.roomAuthorityRuntime = null;
    ctx.urbanSandboxRuntime.civic.observe({
      kind: 'assault',
      severity: 2,
      position: { x: walker.x, z: walker.z }
    }, [{ id: 'verification-witness', distance: 4, reaction: 'reporting' }]);
    for (let index = 0; index < 70; index += 1) {
      ctx.urbanSandboxRuntime.civic.update(.1, walker, { detected: false, responseEnRoute: index > 60 });
      ctx.urbanSandboxRuntime.responders.update(.1, ctx.urbanSandboxRuntime.civic.snapshot(), walker);
    }
  });
  await page.waitForFunction(() => (
    Number(globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.responders?.activeCount || 0) > 0
  ), null, { timeout: 35_000 });
  await page.waitForFunction(() => {
    const responders = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.responders?.responders || [];
    return responders.length > 0 && responders.every((entry) => entry.curatedAssetId === 'traffic-police-response-v1');
  }, null, { timeout: 20_000 });

  const candidate = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk.state.walker;
    const radii = [24, 32, 40, 48];
    for (const radius of radii) {
      for (let index = 0; index < 20; index += 1) {
        const angle = index / 20 * Math.PI * 2;
        const x = walker.x + Math.sin(angle) * radius;
        const z = walker.z + Math.cos(angle) * radius;
        const y = ctx.elevationWorldYAtWorldXZ?.(x, z) ?? walker.y;
        const road = ctx.findNearestRoad?.(x, z, { y, maxVerticalDelta: 24 });
        const roadDistance = Number(road?.dist ?? road?.distance ?? 0);
        const collision = ctx.checkBuildingCollision?.(x, z, 1, { actorBaseY: y, actorHeight: 1.8 });
        if (roadDistance < 10 || collision?.collision === true || ctx.isInsideWaterArea?.(x, z) === true) continue;
        Object.assign(walker, { x, y, z, vx: 0, vz: 0, vy: 0, onGround: true });
        return { x, y, z, roadDistance };
      }
    }
    const x = walker.x + 18;
    const z = walker.z + 18;
    const y = ctx.elevationWorldYAtWorldXZ?.(x, z) ?? walker.y;
    Object.assign(walker, { x, y, z, vx: 0, vz: 0, vy: 0, onGround: true });
    return { x, y, z, roadDistance: 0 };
  });

  const trace = [];
  for (let index = 0; index < 24; index += 1) {
    trace.push(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const runtime = ctx.urbanSandboxRuntime;
      const walker = ctx.Walk?.state?.walker;
      if (walker) walker.vx = 2;
      runtime?.responders?.update?.(.25, runtime?.civic?.snapshot?.(), walker);
      const responder = runtime?.responders?.snapshot?.()?.responders?.[0] || null;
      return responder ? {
        distanceToActor: responder.distanceToActor,
        speed: responder.speed,
        curatedAssetId: responder.curatedAssetId,
        proceduralVehicleMeshes: responder.proceduralVehicleMeshes,
        navigationTarget: responder.navigationTarget,
        officerDeployed: Boolean(responder.officer)
      } : null;
    }));
  }
  const samples = trace.filter(Boolean);
  assert.ok(samples.length >= 8);
  assert.ok(samples.every((sample) => sample.curatedAssetId === 'traffic-police-response-v1'));
  assert.ok(samples.every((sample) => sample.proceduralVehicleMeshes === 0));
  assert.ok(samples.some((sample) => sample.navigationTarget?.pursuitMode === 'cross-terrain-direct'));
  assert.ok(samples.some((sample) => sample.navigationTarget?.roadBound === false));
  const firstDistance = Number(samples[0].distanceToActor);
  const minimumDistance = Math.min(...samples.map((sample) => Number(sample.distanceToActor)));
  assert.ok(minimumDistance < firstDistance - 2, JSON.stringify({ firstDistance, minimumDistance, candidate, trace: samples.slice(-8) }));
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const root = ctx.urbanSandboxRuntime?.responders?.targets?.().find((entry) => entry.kind === 'responder_officer')?.ref?.visual?.root;
    const equipment = root?.children?.find((child) => child?.userData?.equipmentPresentation);
    return root?.userData?.curatedCharacterAssetId === 'character-civic-responder-v1' &&
      equipment?.userData?.curatedEquipmentAssetId === 'equipment-explorer-pulse-sidearm-v1';
  }, null, { timeout: 35_000 });
  const officerPresentation = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const runtime = ctx.urbanSandboxRuntime;
    const walker = ctx.Walk?.state?.walker;
    if (walker) walker.vx = 2;
    runtime?.responders?.update?.(.01, runtime?.civic?.snapshot?.(), walker);
    const officer = runtime?.responders?.snapshot?.()?.responders?.find((entry) => entry.officer)?.officer;
    return officer || null;
  });
  assert.equal(Number(officerPresentation?.fallbackMeshCount || 0), 0);
  assert.equal(Number(officerPresentation?.visibleFallbackMeshCount || 0), 0);
  assert.equal(Number(officerPresentation?.proceduralCharacterMeshes || 0), 0);
  assert.equal(Number(officerPresentation?.proceduralEquipmentMeshes || 0), 0);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const officer = ctx.urbanSandboxRuntime?.responders?.targets?.().find((entry) => entry.kind === 'responder_officer')?.ref;
    if (!officer || !ctx.camera) return;
    ctx.camera.position.set(Number(officer.x) + 3.5, Number(officer.y) + 1.65, Number(officer.z) + 4.5);
    ctx.camera.lookAt(Number(officer.x), Number(officer.y) + 1.1, Number(officer.z));
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(evidenceDir, 'curated-officer-and-pursuit.png'), fullPage: false });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk?.state?.walker;
    if (!walker) return;
    ctx.Walk.state.mode = 'walk';
    // Keep the generic stopped-vehicle contact resolver reset while directly
    // exercising the officer's stricter continuous physical-contact arrest.
    for (let index = 0; index < 24 && !ctx.urbanSandboxRuntime?.custody?.active; index += 1) {
      const officer = ctx.urbanSandboxRuntime?.responders?.targets?.().find((entry) => entry.kind === 'responder_officer')?.ref;
      if (!officer) break;
      Object.assign(walker, {
        x: Number(officer.x), y: Number(officer.y), z: Number(officer.z),
        vx: 1, vy: 0, vz: 0, onGround: true
      });
      ctx.urbanSandboxRuntime.responders.update(
        .1,
        ctx.urbanSandboxRuntime.civic.snapshot(),
        walker
      );
    }
  });
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.custody?.active === true, null, { timeout: 8_000 });
  const custody = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.custody || null);
  assert.equal(custody?.active, true);
  assert.equal(custody?.type, 'police');
  assert.ok(['arrested', 'responder_contact'].includes(String(custody?.reason || '')));
  assert.deepEqual(failures, []);
  await page.screenshot({ path: path.join(evidenceDir, 'off-road-police-pursuit.png'), fullPage: false });
  const report = { ok: true, candidate, firstDistance, minimumDistance, officerPresentation, custody, trace: samples, failures };
  await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
