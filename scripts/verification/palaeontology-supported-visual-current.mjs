import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_FOSSIL_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/palaeontology-career-20261102') + path.sep) &&
    path.basename(source) === 'qa-fieldwork-backup.json'
);
const backup = JSON.parse(await fs.readFile(source)),
  output = `output/verification/palaeontology-career-20261102/supported-visual-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 90000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected supported-leaf presentation boundary only. Actual completed source record/specimen in the existing controlled WebGL room; no procedure replay, city admission or new home-ownership claim.';
  report.source = source;
  await page.addInitScript((data) => (window.__fieldworkBackup = data), backup);
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/scripts/verification/fixtures/personal-workspace.html'
  );
  await page.waitForFunction(() => window.fixture && !fixture.runtime.snapshot().busy);
  report.presentation = await page.evaluate(async () => {
    const { createPalaeontologyPresentation } = await import(
        '/app/js/campaign/palaeontology-presentation.js'
      ),
      { PALAEONTOLOGY_STUDIES } = await import('/app/js/campaign/palaeontology-career.js'),
      data = window.__fieldworkBackup,
      record = data.events.find(
        (row) => row.metadata?.variantId === 'plant-impression' && row.metadata?.palaeontologyReport
      )?.metadata.palaeontologyReport;
    if (!record || !data.items.some((row) => row.instanceId === record.specimen.instanceId))
      throw Error('Actual completed leaf specimen required.');
    const runtime = {
      scene: fixture.ctx.scene,
      dynamicBuildingColliders: [],
      playerBackpackInventory: { item: (id) => data.items.find((row) => row.instanceId === id) }
    };
    const presentation = await createPalaeontologyPresentation(
      runtime,
      {
        site: record.site,
        metersPerUnit: 1,
        points: { bed: { x: -9, y: 0, z: 0 }, bench: { x: 0, y: 0, z: 0 } }
      },
      PALAEONTOLOGY_STUDIES['plant-impression'],
      {}
    );
    presentation.update({ ...record, phase: 'complete' });
    fixture.state.ui.setOpen(false);
    Object.assign(fixture.walker, { x: 0, y: 1.8, z: 1.3 });
    document.querySelector('#hint').textContent =
      'Supported training leaf · actual saved specimen · controlled presentation only';
    fixture.draw();
    const T = globalThis.THREE,
      packed = presentation.root.getObjectByName('Prepared fossil specimen'),
      support = presentation.root.getObjectByName('Supported sediment block'),
      leafBounds = new T.Box3().setFromObject(packed),
      blockBounds = new T.Box3().setFromObject(support);
    window.supportedPresentation = { presentation, runtime };
    return {
      visible: packed.visible,
      supportVisible: support.visible,
      leafMinY: leafBounds.min.y,
      supportMaxY: blockBounds.max.y,
      fullySupported:
        leafBounds.min.x > blockBounds.min.x + 0.02 &&
        leafBounds.max.x < blockBounds.max.x - 0.02 &&
        leafBounds.min.z > blockBounds.min.z + 0.02 &&
        leafBounds.max.z < blockBounds.max.z - 0.02,
      budget: presentation.budget
    };
  });
  assert.equal(report.presentation.visible, true);
  assert.equal(report.presentation.supportVisible, true);
  assert.ok(
    report.presentation.leafMinY > report.presentation.supportMaxY + 0.0001 &&
      report.presentation.leafMinY < report.presentation.supportMaxY + 0.005
  );
  assert.equal(report.presentation.fullySupported, true);
  await page.screenshot({ path: `${output}/supported-leaf-on-bench.png` });
  const disposed = await page.evaluate(() => {
    supportedPresentation.presentation.dispose();
    return {
      colliders: supportedPresentation.runtime.dynamicBuildingColliders.length,
      attached: !!supportedPresentation.presentation.root.parent
    };
  });
  assert.deepEqual(disposed, { colliders: 0, attached: false });
  report.checks.push(
    'The actual saved leaf sits visibly above its sediment support, with retained veins; the bounded presentation and both proxies dispose cleanly.'
  );
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
