import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-region-manager');

async function captureSnapshot(page, label) {
  return await page.evaluate(async (nextLabel) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { label: nextLabel, ok: false, reason: 'continuous-world diagnostics unavailable' };
    }
    return {
      label: nextLabel,
      ok: true,
      snapshot: ctx.getContinuousWorldValidationSnapshot()
    };
  }, label);
}

async function moveAcrossRegionBoundary(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (!ctx?.car || typeof ctx.updateContinuousWorldRuntime !== 'function') {
      return { ok: false, reason: 'continuous-world runtime unavailable' };
    }
    ctx.car.z -= 2600;
    ctx.updateContinuousWorldRuntime();
    return {
      ok: true,
      snapshot: typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null
    };
  });
}

function manager(snapshot) {
  return snapshot?.continuousWorld?.regionManager || null;
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1500);

    const boot = await bootstrapEarthRuntime(page, 'baltimore');
    if (!boot?.ok) throw new Error(`Failed to bootstrap runtime: ${JSON.stringify(boot || {})}`);
    await page.waitForTimeout(1500);

    const initial = await captureSnapshot(page, 'initial');
    if (!initial?.ok) throw new Error(`Initial snapshot unavailable: ${JSON.stringify(initial || {})}`);

    const moved = await moveAcrossRegionBoundary(page);
    if (!moved?.ok) throw new Error(`Move snapshot unavailable: ${JSON.stringify(moved || {})}`);

    const reload = await loadEarthLocation(page, { kind: 'preset', key: 'sanfrancisco' });
    if (!reload?.ok) throw new Error(`Failed to reload San Francisco: ${JSON.stringify(reload || {})}`);
    await page.waitForTimeout(2000);
    const reloaded = await captureSnapshot(page, 'reloaded');
    if (!reloaded?.ok) throw new Error(`Reload snapshot unavailable: ${JSON.stringify(reloaded || {})}`);

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });

    const initialManager = manager(initial.snapshot);
    const movedManager = manager(moved.snapshot);
    const reloadedManager = manager(reloaded.snapshot);
    const initialCw = initial.snapshot?.continuousWorld;
    const movedCw = moved.snapshot?.continuousWorld;
    const reloadedCw = reloaded.snapshot?.continuousWorld;

    const failures = [];

    if (!initialManager) failures.push('initial region manager snapshot missing');
    if (!movedManager) failures.push('moved region manager snapshot missing');
    if (!reloadedManager) failures.push('reloaded region manager snapshot missing');

    if (initialManager) {
      if (initialManager.trackedCounts?.total !== 81) failures.push(`expected 81 tracked regions initially, got ${initialManager.trackedCounts?.total || 0}`);
      if (initialManager.trackedCounts?.near !== 9) failures.push(`expected 9 near regions initially, got ${initialManager.trackedCounts?.near || 0}`);
      if (initialManager.trackedCounts?.mid !== 16) failures.push(`expected 16 mid regions initially, got ${initialManager.trackedCounts?.mid || 0}`);
      if (initialManager.trackedCounts?.far !== 56) failures.push(`expected 56 far regions initially, got ${initialManager.trackedCounts?.far || 0}`);
      if (initialManager.activeRegionKey !== initialCw?.activeRegion?.key) failures.push('initial active region key mismatch between runtime and region manager');
      if ((initialManager.staleTrackedRegions || 0) !== 0) failures.push(`expected no stale tracked regions initially, got ${initialManager.staleTrackedRegions || 0}`);
    }

    if (movedManager) {
      if (movedManager.activeRegionKey === initialManager?.activeRegionKey) failures.push('active region key did not change after crossing boundary');
      if ((movedManager.lastTransition?.enteredCount || 0) === 0) failures.push('expected entered regions after boundary crossing');
      if ((movedManager.lastTransition?.retiredCount || 0) === 0) failures.push('expected retired regions after boundary crossing');
      if (!movedManager.lastTransition?.activeRegionChanged) failures.push('expected activeRegionChanged after boundary crossing');
      if (movedManager.trackedCounts?.total !== 81) failures.push(`expected 81 tracked regions after move, got ${movedManager.trackedCounts?.total || 0}`);
      if ((movedManager.staleTrackedRegions || 0) !== 0) failures.push(`expected no stale tracked regions after move, got ${movedManager.staleTrackedRegions || 0}`);
      if ((movedCw?.localOffset?.distanceFromOrigin ?? 9999) > 250) {
        failures.push(`expected runtime rebase to keep moved local offset bounded, got ${movedCw?.localOffset?.distanceFromOrigin || 0}`);
      }
      if (movedCw?.rebase?.recommended) failures.push('rebase should not still be recommended after large boundary crossing move');
    }

    if (reloadedManager) {
      if (!(reloadedManager.sessionEpoch > (initialManager?.sessionEpoch || 0))) failures.push('region manager session epoch did not advance after reload');
      if (reloadedManager.trackedCounts?.total !== 81) failures.push(`expected 81 tracked regions after reload, got ${reloadedManager.trackedCounts?.total || 0}`);
      if ((reloadedManager.staleTrackedRegions || 0) !== 0) failures.push(`expected no stale tracked regions after reload, got ${reloadedManager.staleTrackedRegions || 0}`);
      if (reloadedManager.activeRegionKey !== reloadedCw?.activeRegion?.key) failures.push('reloaded active region key mismatch between runtime and region manager');
      if (reloadedManager.lastSessionReset?.sessionEpoch !== reloadedManager.sessionEpoch) failures.push('expected session reset metadata for reload epoch');
      if (reloadedManager.lastSessionReset?.activeRegionKey !== reloadedCw?.activeRegion?.key) failures.push('expected session reset metadata to point at reloaded active region');
    }

    const report = {
      ok: failures.length === 0,
      boot,
      reload,
      initial: initial.snapshot,
      moved: moved.snapshot,
      reloaded: reloaded.snapshot,
      failures,
      errors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

    if (failures.length > 0) {
      throw new Error(`continuous-world region manager validation failed: ${failures.join('; ')}`);
    }
  } finally {
    await context.close();
    await browser.close();
    await server.close();
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
