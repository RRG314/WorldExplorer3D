import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'session-lifecycle');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTransientNetworkError(message = '') {
  return /net::ERR_(ABORTED|CONNECTION_REFUSED|HTTP2_PROTOCOL_ERROR)|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(message);
}

async function waitForRuntime(page) {
  await pollPageState(page, async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(
      typeof ctx?.getSessionCoordinatorDebugState === 'function' &&
      typeof ctx?.startOceanMode === 'function' &&
      typeof ctx?.startSpaceFlightToMoon === 'function'
    );
  }, null, 90000, 'runtime initialization');
}

async function pollPageState(page, evaluator, argument, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(evaluator, argument)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function readLifecycleState(page, mode) {
  return page.evaluate(async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const renderer = requestedMode === 'space' ? ctx.spaceFlight?.renderer : ctx.oceanMode?.renderer;
    const scene = requestedMode === 'space' ? ctx.spaceFlight?.scene : ctx.oceanMode?.scene;
    const memory = renderer?.info?.memory || {};
    const sceneSummary = {
      objects: 0,
      geometries: 0,
      materials: 0,
      textures: 0,
      resourceSignature: ''
    };
    if (scene?.traverse) {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      scene.traverse((object) => {
        sceneSummary.objects += 1;
        if (object.geometry?.uuid) geometries.add(object.geometry.uuid);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => {
          if (material.uuid) materials.add(material.uuid);
          Object.values(material).forEach((value) => {
            if (value?.isTexture && value.uuid) textures.add(value.uuid);
          });
        });
      });
      sceneSummary.geometries = geometries.size;
      sceneSummary.materials = materials.size;
      sceneSummary.textures = textures.size;
      sceneSummary.resourceSignature = [
        ...geometries,
        ...materials,
        ...textures
      ].sort().join('|');
    }
    return {
      coordinator: ctx.getSessionCoordinatorDebugState?.(),
      canvases: {
        ocean: document.querySelectorAll('#oceanModeCanvas').length,
        space: document.querySelectorAll('#spaceFlightCanvas').length,
        total: document.querySelectorAll('canvas').length
      },
      gpu: {
        geometries: Number(memory.geometries || 0),
        textures: Number(memory.textures || 0)
      },
      scene: sceneSummary
    };
  }, mode);
}

async function waitForMode(page, mode, previousSpaceSessionId = -1) {
  await pollPageState(page, async ({ requestedMode, previousSessionId }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (requestedMode === 'space') {
      return (
        ctx.getEnv?.() === ctx.ENV?.SPACE_FLIGHT &&
        ctx.spaceFlight?.active &&
        ctx.spaceFlight?.animationId != null &&
        Number(ctx.spaceFlight?._sessionId || 0) > previousSessionId
      );
    }
    return ctx.getEnv?.() === ctx.ENV?.OCEAN && ctx.oceanMode?.active && ctx.oceanMode?.animationId != null;
  }, { requestedMode: mode, previousSessionId: previousSpaceSessionId }, 30000, `${mode} render-loop ownership`);
}

async function waitForHubExit(page, mode) {
  await pollPageState(page, async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const titleVisible = !document.getElementById('titleScreen')?.classList.contains('hidden');
    const globeVisible = document.getElementById('globeSelectorScreen')?.classList.contains('show');
    const ownerStopped = requestedMode === 'space'
      ? !ctx.spaceFlight?.active && ctx.spaceFlight?.animationId == null
      : !ctx.oceanMode?.active && ctx.oceanMode?.animationId == null;
    return (globeVisible || titleVisible) && ctx.getEnv?.() === ctx.ENV?.EARTH && ownerStopped;
  }, mode, 30000, `${mode} return to hub`);
}

async function runModeCycles(page, mode, lifecycleEvents) {
  const destination = mode === 'space' ? '#globeSelectorSpaceBtn' : '#globeSelectorOceanBtn';
  const cycles = [];
  for (let cycle = 1; cycle <= 10; cycle++) {
    const beforeLaunch = await readLifecycleState(page, mode);
    const previousSpaceSessionId = Number(beforeLaunch.coordinator.environments.SPACE_FLIGHT?.sessionId || 0);
    await page.click(destination);
    await waitForMode(page, mode, previousSpaceSessionId);
    const observed = await readLifecycleState(page, mode);
    await page.waitForTimeout(1200);
    const active = await readLifecycleState(page, mode);
    if (cycle === 1 || cycle === 10) {
      await page.screenshot({ path: path.join(outputDir, `${mode}-cycle-${cycle}.png`), fullPage: false });
    }

    await page.evaluate(() => document.getElementById('mainMenuBtn')?.click());
    await waitForHubExit(page, mode);
    const exited = await readLifecycleState(page, mode);
    cycles.push({ observed, active, exited, events: lifecycleEvents.splice(0) });
  }
  return cycles;
}

function assertPlateau(mode, cycles) {
  const second = cycles[1];
  const finalCycle = cycles.at(-1);
  const adapterKey = mode === 'space' ? 'SPACE_FLIGHT' : 'OCEAN';
  for (const [index, cycle] of cycles.entries()) {
    const activeAdapter = cycle.active.coordinator.environments[adapterKey];
    const exitedAdapter = cycle.exited.coordinator.environments[adapterKey];
    assert(activeAdapter.active && activeAdapter.animationActive, `${mode} cycle ${index + 1} did not own an active render loop`);
    assert(!exitedAdapter.active && !exitedAdapter.animationActive, `${mode} cycle ${index + 1} left its render loop active`);
    assert(cycle.exited.coordinator.transition === null, `${mode} cycle ${index + 1} left a transition token active`);
    assert(cycle.exited.canvases[mode] === 1, `${mode} cycle ${index + 1} duplicated its canvas`);
    assert(!exitedAdapter.rendererReady, `${mode} cycle ${index + 1} retained renderer resources`);
    if (mode === 'ocean') assert(!exitedAdapter.sceneReady, `ocean cycle ${index + 1} retained scene resources`);
    const expectedSessionOwner = mode === 'space' ? 'space-flight-session' : 'ocean-session';
    assert(cycle.active.coordinator.lifecycle.owners[expectedSessionOwner]?.scopes === 1, `${mode} cycle ${index + 1} did not have one session owner`);
    assert(cycle.active.coordinator.lifecycle.resources.renderer === 1, `${mode} cycle ${index + 1} did not lease one renderer`);
    assert(cycle.active.coordinator.lifecycle.resources['animation-frame'] === 1, `${mode} cycle ${index + 1} did not lease one RAF`);
    assert(!cycle.exited.coordinator.lifecycle.owners[expectedSessionOwner], `${mode} cycle ${index + 1} retained its session owner`);
    assert(!cycle.exited.coordinator.lifecycle.resources.renderer, `${mode} cycle ${index + 1} retained a renderer lease`);
    assert(!cycle.exited.coordinator.lifecycle.resources['animation-frame'], `${mode} cycle ${index + 1} retained a RAF lease`);
  }
  assert(finalCycle.active.scene.objects === second.active.scene.objects, `${mode} scene object count changed after warm-up`);
  assert(finalCycle.active.scene.geometries === second.active.scene.geometries, `${mode} scene geometry count changed after warm-up`);
  assert(finalCycle.active.scene.materials === second.active.scene.materials, `${mode} scene material count changed after warm-up`);
  assert(finalCycle.active.scene.textures === second.active.scene.textures, `${mode} scene texture count changed after warm-up`);
  assert(finalCycle.exited.canvases.total === second.exited.canvases.total, `${mode} DOM canvas count grew after warm-up`);
  assert(finalCycle.exited.coordinator.lifecycle.activeScopeCount === second.exited.coordinator.lifecycle.activeScopeCount, `${mode} lifecycle owner count grew after warm-up`);
  assert(finalCycle.exited.coordinator.lifecycle.resourceCount === second.exited.coordinator.lifecycle.resourceCount, `${mode} lifecycle resource count grew after warm-up`);
  assert(
    JSON.stringify(finalCycle.exited.coordinator.lifecycle.resources) === JSON.stringify(second.exited.coordinator.lifecycle.resources),
    `${mode} lifecycle resource types changed after warm-up`
  );
}

await mkdirp(outputDir);
const server = await startServer({ rootDir, host, candidatePorts: [4216, 4217, 4218] });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const lifecycleEvents = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Starting space flight|Exiting space flight|Starting ocean mode|Stopping ocean mode/i.test(text)) {
      lifecycleEvents.push({ at: Date.now(), text });
    }
    if (message.type() === 'error' && !isTransientNetworkError(text)) consoleErrors.push(text);
  });
  await page.goto(`http://${host}:${server.port}/app/?lifecycle-plateau=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#globeSelectorScreen.show', { state: 'visible', timeout: 90000 });
  await waitForRuntime(page);
  await page.evaluate(() => {
    const panel = document.getElementById('proAccessPanel');
    if (panel) panel.hidden = true;
  });

  const report = {
    space: await runModeCycles(page, 'space', lifecycleEvents),
    ocean: await runModeCycles(page, 'ocean', lifecycleEvents)
  };
  await fs.writeFile(path.join(outputDir, 'plateau-report.json'), `${JSON.stringify({ ok: false, report }, null, 2)}\n`);
  assertPlateau('space', report.space);
  assertPlateau('ocean', report.ocean);
  const registered = report.ocean.at(-1).exited.coordinator.registeredEnvironments;
  assert(registered.length === 5, `Expected five environment adapters, found ${registered.length}`);
  assert(consoleErrors.length === 0, `Lifecycle cycles logged errors: ${consoleErrors.join(' | ')}`);

  await fs.writeFile(path.join(outputDir, 'plateau-report.json'), `${JSON.stringify({ ok: true, report }, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    registeredEnvironments: registered,
    spaceWarmGpu: report.space.at(-1).active.gpu,
    oceanWarmGpu: report.ocean.at(-1).active.gpu,
    consoleErrors
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
