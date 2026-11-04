import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/wildlife-career-20261102/presentation-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'wildlife', maximumDurationMs: 90000 }),
  { page, report } = qa;
try {
  report.scope =
    'Actual licensed models/animations and rendered course in controlled flat WebGL habitat. Diagnose the affected visibility/placement/lifecycle boundary; not world admission or field-method completion.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/wildlife-presentation.html'
  );
  await page.waitForFunction(() => window.wildlifeVisual);
  await page.waitForTimeout(500);
  report.probes = await page.evaluate(() =>
    ['a', 'b'].map((id) => ({ id, ...wildlifeVisual.probe(id) }))
  );
  await fs.writeFile(`${output}/probes.json`, JSON.stringify(report.probes, null, 2) + '\n');
  console.log(
    JSON.stringify(
      report.probes.map(({ id, sensor, trace, sensorMs, observer }) => ({
        id,
        sensor,
        trace,
        sensorMs,
        observer
      })),
      null,
      2
    )
  );
  await page.screenshot({ path: `${output}/wooded.png` });
  for (const p of report.probes) assert.ok(p.sensor, 'sensor sees actual ' + p.id);
  report.signs = await page.evaluate(async () => {
    const { inspectWildlifeObservation } = await import('/app/js/campaign/wildlife-sight.js'),
      T = THREE,
      out = [];
    for (const id of ['a', 'b']) {
      const { runtime, presentation, qualified } = wildlifeVisual,
        p = qualified.points[id],
        center = new T.Box3().setFromObject(presentation.signs[id]).getCenter(new T.Vector3());
      runtime.camera.position.set(p.x, 1.7, p.z + 1.8);
      runtime.camera.lookAt(center);
      runtime.camera.updateMatrixWorld();
      out.push({
        id,
        visible: !!inspectWildlifeObservation(runtime, presentation.signObservations[id])
      });
    }
    return out;
  });
  assert.ok(report.signs.every((row) => row.visible));
  await page.evaluate(() => {
    const { runtime } = wildlifeVisual;
    runtime.camera.position.set(9, 1.7, 1);
    runtime.camera.lookAt(9, 0.6, -7);
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${output}/open.png` });
  report.disposal = await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16'),
      { runtime, presentation } = wildlifeVisual;
    const before = runtime.dynamicBuildingColliders.length;
    presentation.dispose();
    return {
      before,
      after: runtime.dynamicBuildingColliders.length,
      attached: !!presentation.root.parent,
      leases: modelAssetCacheSnapshot()
        .entries.filter((row) => /^(animal-|nature-|workspace-table)/.test(row.id))
        .map((row) => ({ id: row.id, leases: row.leases }))
    };
  });
  assert.equal(report.disposal.before, 16);
  assert.equal(report.disposal.after, 0);
  assert.equal(report.disposal.attached, false);
  assert.ok(report.disposal.leases.every((row) => row.leases === 0));
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
