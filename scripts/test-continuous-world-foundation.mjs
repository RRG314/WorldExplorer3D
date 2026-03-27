import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-foundation');

function approxEqual(a, b, tolerance = 0.02) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

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

async function nudgeActorFarFromOrigin(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (!ctx?.car || typeof ctx.updateContinuousWorldRuntime !== 'function') {
      return { ok: false, reason: 'continuous-world runtime unavailable' };
    }
    ctx.car.x += 9000;
    ctx.car.z += 1800;
    ctx.updateContinuousWorldRuntime();
    return {
      ok: true,
      snapshot: typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null
    };
  });
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
    if (!boot?.ok) throw new Error(`Failed to bootstrap earth runtime: ${JSON.stringify(boot || {})}`);
    await page.waitForTimeout(1500);

    const initial = await captureSnapshot(page, 'initial');
    if (!initial?.ok) throw new Error(`Initial snapshot unavailable: ${JSON.stringify(initial || {})}`);

    const moved = await nudgeActorFarFromOrigin(page);
    if (!moved?.ok) throw new Error(`Move snapshot unavailable: ${JSON.stringify(moved || {})}`);

    const reload = await loadEarthLocation(page, { kind: 'preset', key: 'newyork' });
    if (!reload?.ok) throw new Error(`Failed to reload New York: ${JSON.stringify(reload || {})}`);
    await page.waitForTimeout(2000);
    const reloaded = await captureSnapshot(page, 'reloaded');
    if (!reloaded?.ok) throw new Error(`Reload snapshot unavailable: ${JSON.stringify(reloaded || {})}`);

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });

    const initialCw = initial.snapshot?.continuousWorld;
    const movedCw = moved.snapshot?.continuousWorld;
    const reloadedCw = reloaded.snapshot?.continuousWorld;

    const failures = [];

    if (!initialCw) failures.push('initial continuous-world snapshot missing');
    if (!movedCw) failures.push('moved continuous-world snapshot missing');
    if (!reloadedCw) failures.push('reloaded continuous-world snapshot missing');

    if (initialCw) {
      if (!approxEqual(initialCw.origin.lat, 39.2904, 0.05) || !approxEqual(initialCw.origin.lon, -76.6122, 0.05)) {
        failures.push(`initial origin mismatch: ${JSON.stringify(initialCw.origin)}`);
      }
      if ((initialCw.activeRegionRings?.near?.length || 0) !== 9) failures.push(`expected 9 near cells, got ${initialCw.activeRegionRings?.near?.length || 0}`);
      if ((initialCw.activeRegionRings?.mid?.length || 0) !== 16) failures.push(`expected 16 mid cells, got ${initialCw.activeRegionRings?.mid?.length || 0}`);
      if ((initialCw.activeRegionRings?.far?.length || 0) !== 56) failures.push(`expected 56 far cells, got ${initialCw.activeRegionRings?.far?.length || 0}`);
    }

    if (movedCw) {
      if (!approxEqual(movedCw.origin.lat, movedCw.actorGlobal?.lat, 0.01) || !approxEqual(movedCw.origin.lon, movedCw.actorGlobal?.lon, 0.01)) {
        failures.push(`expected runtime rebase origin to follow actor geo after large move, got origin=${JSON.stringify(movedCw.origin)} actor=${JSON.stringify(movedCw.actorGlobal)}`);
      }
      if ((movedCw.localOffset?.distanceFromOrigin ?? 9999) > 250) {
        failures.push(`expected runtime rebase to collapse local distance after large move, got ${movedCw.localOffset?.distanceFromOrigin || 0}`);
      }
      if (movedCw.rebase?.recommended) failures.push('rebase should not remain recommended after runtime rebase applies');
    }

    if (initialCw && reloadedCw) {
      if (!(reloadedCw.sessionEpoch > initialCw.sessionEpoch)) failures.push('session epoch did not advance after location reload');
    }

    if (reloadedCw) {
      if (!approxEqual(reloadedCw.origin.lat, 40.7580, 0.05) || !approxEqual(reloadedCw.origin.lon, -73.9855, 0.05)) {
        failures.push(`reloaded origin mismatch: ${JSON.stringify(reloadedCw.origin)}`);
      }
      if ((reloadedCw.localOffset?.distanceFromOrigin || 9999) > 250) {
        failures.push(`expected reload to reset local offset near origin, got ${reloadedCw.localOffset?.distanceFromOrigin || 0}`);
      }
      if (reloadedCw.rebase?.recommended) failures.push('rebase should not still be recommended immediately after reload reset');
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
      throw new Error(`continuous-world foundation validation failed: ${failures.join('; ')}`);
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
