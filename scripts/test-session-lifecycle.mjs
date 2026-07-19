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
  return /net::ERR_(ABORTED|HTTP2_PROTOCOL_ERROR)|Failed to load resource:.*\b(429|500|502|503|504)\b/i.test(message);
}

async function waitForRuntime(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return !!(
      typeof ctx?.getSessionCoordinatorDebugState === 'function' &&
      typeof ctx?.startOceanMode === 'function' &&
      typeof ctx?.startSpaceFlightToMoon === 'function'
    );
  }, null, { timeout: 90000 });
}

async function readLifecycleState(page, mode) {
  return page.evaluate(async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const renderer = requestedMode === 'space' ? ctx.spaceFlight?.renderer : ctx.oceanMode?.renderer;
    const memory = renderer?.info?.memory || {};
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
      }
    };
  }, mode);
}

async function waitForMode(page, mode) {
  await page.waitForFunction(async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (requestedMode === 'space') {
      return ctx.getEnv?.() === ctx.ENV?.SPACE_FLIGHT && ctx.spaceFlight?.active && ctx.spaceFlight?.animationId != null;
    }
    return ctx.getEnv?.() === ctx.ENV?.OCEAN && ctx.oceanMode?.active && ctx.oceanMode?.animationId != null;
  }, mode, { timeout: 30000 });
}

async function waitForTitleExit(page, mode) {
  await page.waitForFunction(async (requestedMode) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const titleVisible = !document.getElementById('titleScreen')?.classList.contains('hidden');
    const ownerStopped = requestedMode === 'space'
      ? !ctx.spaceFlight?.active && ctx.spaceFlight?.animationId == null
      : !ctx.oceanMode?.active && ctx.oceanMode?.animationId == null;
    return titleVisible && ctx.getEnv?.() === ctx.ENV?.EARTH && ownerStopped;
  }, mode, { timeout: 30000 });
}

async function runModeCycles(page, mode) {
  const toggle = mode === 'space' ? '#spaceLaunchToggle' : '#oceanLaunchToggle';
  const cycles = [];
  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.click(toggle);
    await page.click('#startBtn');
    await waitForMode(page, mode);
    await page.waitForTimeout(1200);
    const active = await readLifecycleState(page, mode);
    if (cycle === 1 || cycle === 3) {
      await page.screenshot({ path: path.join(outputDir, `${mode}-cycle-${cycle}.png`), fullPage: false });
    }

    await page.click('#mainMenuBtn');
    await waitForTitleExit(page, mode);
    const exited = await readLifecycleState(page, mode);
    cycles.push({ active, exited });
  }
  return cycles;
}

function assertPlateau(mode, cycles) {
  const second = cycles[1];
  const third = cycles[2];
  const adapterKey = mode === 'space' ? 'SPACE_FLIGHT' : 'OCEAN';
  for (const [index, cycle] of cycles.entries()) {
    const activeAdapter = cycle.active.coordinator.environments[adapterKey];
    const exitedAdapter = cycle.exited.coordinator.environments[adapterKey];
    assert(activeAdapter.active && activeAdapter.animationActive, `${mode} cycle ${index + 1} did not own an active render loop`);
    assert(!exitedAdapter.active && !exitedAdapter.animationActive, `${mode} cycle ${index + 1} left its render loop active`);
    assert(cycle.exited.coordinator.transition === null, `${mode} cycle ${index + 1} left a transition token active`);
    assert(cycle.exited.canvases[mode] === 1, `${mode} cycle ${index + 1} duplicated its canvas`);
    if (mode === 'ocean') {
      assert(!exitedAdapter.rendererReady && !exitedAdapter.sceneReady, `ocean cycle ${index + 1} retained renderer resources`);
    }
  }
  assert(third.active.gpu.geometries <= second.active.gpu.geometries, `${mode} GPU geometry count grew after warm-up`);
  assert(third.active.gpu.textures <= second.active.gpu.textures + 1, `${mode} GPU texture count kept growing after warm-up`);
  assert(third.exited.canvases.total === second.exited.canvases.total, `${mode} DOM canvas count grew after warm-up`);
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
  page.on('console', (message) => {
    if (message.type() === 'error' && !isTransientNetworkError(message.text())) consoleErrors.push(message.text());
  });
  await page.goto(`http://${host}:${server.port}/app/?lifecycle-plateau=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#startBtn', { state: 'visible', timeout: 90000 });
  await waitForRuntime(page);
  await page.evaluate(() => {
    const panel = document.getElementById('proAccessPanel');
    if (panel) panel.hidden = true;
  });

  const report = {
    space: await runModeCycles(page, 'space'),
    ocean: await runModeCycles(page, 'ocean')
  };
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
