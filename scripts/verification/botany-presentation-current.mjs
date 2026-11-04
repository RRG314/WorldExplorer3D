import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/botany-career-20261102/presentation-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'botany', maximumDurationMs: 120000 }),
  { page, report } = qa;
try {
  report.scope =
    'Actual licensed plant assets, alpha-aware photographs, simulated sensor hardware, geometry cover and planting in controlled flat WebGL beds. Controlled camera/presence; not source-world admission or completed career.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/botany-presentation.html'
  );
  await page.waitForFunction(() => window.botanyVisual);
  report.plants = [];
  for (const id of process.env.WE3D_BOTANY_PHOTOS === 'remaining' ? ['c'] : ['a', 'b', 'c']) {
    const result = await page.evaluate((id) => {
      const v = botanyVisual,
        view = v.facePlant(id);
      return { view, reading: v.presentation.readPlant(id, 5), budget: v.presentation.budget };
    }, id);
    assert.equal(result.reading.depthCm, 5);
    assert.equal(result.reading.plantId, id);
    report.plants.push(result);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${output}/plant-${id}.png` });
  }
  report.studies = [];
  for (const variantId of ['campaign', 'dry-summer', 'returning-canopy']) {
    const result = await page.evaluate(async (variantId) => {
      const v = botanyVisual,
        study =
          variantId === 'campaign'
            ? (await import('/app/js/campaign/botany-career.js')).BOTANY_STUDIES.campaign
            : await v.setup(variantId),
        a = v.state.active,
        p = v.qualified.points.plot;
      Object.assign(v.runtime.Walk.state.walker, { x: p.x, y: 1.7, z: p.z + 2 });
      Object.assign(a, {
        currentSeason: study.initialSeason,
        markedAt: Date.now(),
        phase: 'mark-plot'
      });
      v.presentation.update(a);
      const baseline = v.presentation.readPlot('baseline');
      a.currentSeason = study.visitSeason;
      a.phase = 'planting';
      v.presentation.update(a);
      const visit = v.presentation.readPlot('visit'),
        condition = v.presentation.readCondition(),
        cell = visit.treatment.points.find((row) => row.kind === 'soil')?.index;
      if (cell === undefined) throw Error('No free planting cell');
      a.planting = { variety: study.suitable, cell, condition };
      v.presentation.update(a);
      const placed = v.presentation.restoration.object.visible;
      a.currentSeason = study.afterSeason;
      a.phase = 'report';
      v.presentation.update(a);
      const followup = v.presentation.readPlot('followup');
      v.runtime.camera.position.set(p.x, 3.7, p.z + 4);
      v.runtime.camera.lookAt(p.x, 0.4, p.z);
      return {
        variantId,
        baseline,
        visit,
        condition,
        placed,
        followup,
        budget: v.presentation.budget
      };
    }, variantId);
    assert.equal(result.placed, true);
    for (const stage of ['baseline', 'visit', 'followup'])
      for (const id of ['control', 'treatment']) assert.equal(result[stage][id].points.length, 16);
    report.studies.push(result);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${output}/${variantId}-plot.png` });
  }
  report.disposal = await page.evaluate(async () => {
    const { modelAssetCacheSnapshot } = await import('/app/js/assets/model-asset-runtime.js?v=16'),
      v = botanyVisual;
    v.presentation.dispose();
    return {
      colliders: v.runtime.dynamicBuildingColliders.length,
      attached: !!v.presentation.root.parent,
      opacity: v.presentation.opacity.snapshot(),
      leases: modelAssetCacheSnapshot().entries.map((row) => ({ id: row.id, leases: row.leases }))
    };
  });
  assert.equal(report.disposal.colliders, 0);
  assert.equal(report.disposal.attached, false);
  assert.equal(report.disposal.opacity.bytes, 0);
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
