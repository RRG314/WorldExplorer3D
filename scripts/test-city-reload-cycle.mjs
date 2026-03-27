import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './lib/runtime-browser-harness.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'city-reload-cycle');

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getRuntimeState(page, label) {
  return await page.evaluate(async (nextLabel) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const actorX = Number(ctx.Walk?.state?.walker?.x ?? ctx.car?.x ?? 0);
    const actorZ = Number(ctx.Walk?.state?.walker?.z ?? ctx.car?.z ?? 0);
    return {
      label: nextLabel,
      titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden'),
      worldLoading: !!ctx.worldLoading,
      gameStarted: !!ctx.gameStarted,
      selLoc: ctx.selLoc || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      buildingMeshes: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0,
      visibleRoads: typeof ctx.countVisibleRoadMeshesNearWorldPoint === 'function' ? ctx.countVisibleRoadMeshesNearWorldPoint(actorX, actorZ, 320) : 0,
      visibleDetailedBuildings: typeof ctx.countVisibleDetailedBuildingMeshesNearWorldPoint === 'function' ? ctx.countVisibleDetailedBuildingMeshesNearWorldPoint(actorX, actorZ, 440) : 0,
      loadSeq: Number(ctx._worldLoadSequence || 0),
      loc: ctx.LOC || null,
      roadsNeedRebuild: !!ctx.roadsNeedRebuild,
      worldBuildStage: ctx.worldBuildStage || null,
      worldBuildReadyReason: ctx.worldBuildReadyReason || null,
      perfLastLoad: ctx.perfStats?.lastLoad || null
    };
  }, label);
}

async function waitForState(page, label, predicate, timeoutMs = 120000, intervalMs = 1000) {
  const startAt = Date.now();
  let lastState = null;
  while (Date.now() - startAt < timeoutMs) {
    lastState = await getRuntimeState(page, label);
    if (predicate(lastState)) return lastState;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`Timeout waiting for ${label}: ${JSON.stringify(lastState || {})}`);
}

async function startLocation(page, locKey) {
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return typeof ctx.triggerTitleStart === 'function';
  }, { timeout: 120000 });
  await page.evaluate(async (targetLoc) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    document.querySelector(`.loc[data-loc="${targetLoc}"]`)?.click();
    if (typeof ctx.triggerTitleStart === 'function') {
      ctx.triggerTitleStart();
      return;
    }
    document.getElementById('startBtn')?.click();
  }, locKey);
}

async function returnToMainMenu(page) {
  await page.evaluate(() => {
    document.getElementById('mainMenuBtn')?.click();
  });
}

async function runScenario(page, baseUrl, { earlyReturn = false }) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1500);

  await startLocation(page, 'baltimore');

  let firstPhaseState = null;
  if (earlyReturn) {
    await page.waitForTimeout(1200);
    firstPhaseState = await getRuntimeState(page, 'midLoad');
  } else {
    firstPhaseState = await waitForState(
      page,
      'firstDone',
      (state) =>
        state.titleHidden &&
        !state.worldLoading &&
        state.selLoc === 'baltimore' &&
        state.roads > 0 &&
        state.visibleDetailedBuildings > 0,
      180000,
      2000
    );
  }

  await returnToMainMenu(page);
  const menuState = await waitForState(
    page,
    'menu',
    (state) => !state.titleHidden && !state.worldLoading && !state.gameStarted,
    30000,
    500
  );

  await startLocation(page, 'newyork');
  const secondDone = await waitForState(
    page,
    'secondDone',
    (state) =>
      state.titleHidden &&
      !state.worldLoading &&
      state.selLoc === 'newyork' &&
      state.roads > 0 &&
      state.visibleDetailedBuildings > 0,
    180000,
    2000
  );

  return { firstPhaseState, menuState, secondDone };
}

async function main() {
  await mkdirp(outputDir);
  const serverHandle = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });

  try {
    const settledScenario = await runScenario(page, serverHandle.baseUrl, { earlyReturn: false });
    await page.screenshot({ path: path.join(outputDir, 'settled-reload.png') });

    const quickScenario = await runScenario(page, serverHandle.baseUrl, { earlyReturn: true });
    await page.screenshot({ path: path.join(outputDir, 'quick-reload.png') });

    const report = {
      ok: true,
      settledScenario,
      quickScenario,
      errors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await serverHandle.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    await mkdirp(outputDir);
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      ok: false,
      error: String(error?.message || error)
    }, null, 2));
    console.error(error);
    process.exit(1);
  });
