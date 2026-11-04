import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/botany-career-20261102/grounding-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'botany', maximumDurationMs: 60000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected grounding boundary only: actual model bases and all physical support feet on a controlled sloped terrain. No repeated photography or seasonal study.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/botany-presentation.html?slope'
  );
  await page.waitForFunction(() => window.botanyVisual);
  report.grounding = await page.evaluate(() => {
    const v = botanyVisual,
      T = THREE,
      p = v.qualified.points.plot;
    v.runtime.scene.updateMatrixWorld(true);
    v.runtime.camera.position.set(p.x, 3.4, p.z + 4);
    v.runtime.camera.lookAt(p.x, 0.3, p.z);
    return {
      feet: v.presentation.footings,
      plants: Object.values(v.presentation.plantBeds).map((b) => ({
        base: new T.Box3().setFromObject(b.living.object).min.y,
        soil: new T.Box3().setFromObject(b.soil).max.y
      })),
      proxies: v.runtime.dynamicBuildingColliders.length
    };
  });
  assert.equal(report.grounding.feet.length, 30);
  for (const f of report.grounding.feet) {
    assert.equal(f.bottomY, f.groundY);
    assert.ok(f.topY >= f.groundY);
  }
  for (const p of report.grounding.plants) assert.ok(Math.abs(p.base - p.soil) < 0.00001);
  await page.screenshot({ path: output + '/sloped-plot.png' });
  await page.evaluate(() => botanyVisual.presentation.dispose());
  report.disposal = await page.evaluate(() => ({
    proxies: botanyVisual.runtime.dynamicBuildingColliders.length,
    attached: !!botanyVisual.presentation.root.parent
  }));
  assert.equal(report.disposal.proxies, 0);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
