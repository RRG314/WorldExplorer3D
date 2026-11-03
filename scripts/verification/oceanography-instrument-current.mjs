import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/oceanography-career-20261102/instrument-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 120000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected actual licensed vessel/CTD attachment, all station access and new solid control footprint; normal-frame physical downcast/pause/recovery/disposal. Controlled water/position and stub persistence; not a source career or replayed vessel journey.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/oceanography-instrument.html'
  );
  await page.waitForFunction(() => window.instrumentCheck, {}, { timeout: 65000 });
  report.navigation = await page.evaluate(async () => {
    const { RCRV_LAYOUT } = await import('/app/js/boat-mode/research/layout.js'),
      v = instrumentCheck.visual.root,
      n = v.userData.researchNavigation;
    return {
      stations: RCRV_LAYOUT.stations.map((s) => ({
        id: s.id,
        support: n.support(s.x, s.z, s.y),
        blocked: n.blocked(s.x, s.z, 0.3, s.y)
      })),
      controlBlocked: n.blocked(-2.4, -32.3, 0.3, RCRV_LAYOUT.floorY),
      budget: instrumentCheck.instrument.budget
    };
  });
  assert.ok(report.navigation.stations.every((s) => s.support !== null && !s.blocked));
  assert.equal(report.navigation.controlBlocked, true);
  await page.screenshot({ path: output + '/admitted-instrument.png' });
  await page.evaluate(() => instrumentCheck.start());
  await page.waitForFunction(() => instrumentCheck.recorder.snapshot().activeSeconds > 0.75);
  const before = await page.evaluate(() => {
    instrumentCheck.paused = true;
    return {
      depth: instrumentCheck.instrument.read(instrumentCheck.runtime).depthMeters,
      seconds: instrumentCheck.recorder.snapshot().activeSeconds
    };
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    depth: instrumentCheck.instrument.read(instrumentCheck.runtime).depthMeters,
    seconds: instrumentCheck.recorder.snapshot().activeSeconds
  }));
  assert.deepEqual(after, before);
  await page.evaluate(() => {
    instrumentCheck.paused = false;
  });
  await page.waitForFunction(
    () => instrumentCheck.recorder.snapshot().measurementComplete,
    {},
    { timeout: 30000 }
  );
  await page.screenshot({ path: output + '/six-metre-probe.png' });
  await page.waitForFunction(
    () => instrumentCheck.recorder.snapshot().ready,
    {},
    { timeout: 20000 }
  );
  report.cast = await page.evaluate(() => instrumentCheck.recorder.result());
  assert.equal(report.cast.samples.length, 3);
  assert.equal(report.cast.units.practicalSalinity, 'unitless');
  assert.ok(report.cast.activeSeconds >= 6);
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(report.cast.samples[i].depthMeters - [2, 4, 6][i]) <= 0.04);
  await page.screenshot({ path: output + '/recovered-instrument.png' });
  report.disposal = await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16'),
      v = instrumentCheck.visual.root;
    instrumentCheck.dispose();
    return {
      attached: !!v.parent,
      ctdPresent: !!v.userData.researchCtd,
      leases: modelAssetCacheSnapshot().entries.map((r) => ({ id: r.id, leases: r.leases }))
    };
  });
  assert.equal(report.disposal.attached, false);
  assert.equal(report.disposal.ctdPresent, false);
  assert.ok(report.disposal.leases.every((r) => r.leases === 0));
  assert.deepEqual(report.errors, []);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
