import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = 'output/verification/accelerator-career-20261103/detector-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only pinned MIT CMS display GLBs through the existing r128 renderer/model leases, actual material/line ownership and deliberate layer controls. Controlled camera/lighting; no facility traversal, numerical validation or saved career claim.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/cms-detector-view.html');
  await page.waitForFunction(() => window.ready);
  report.initial = await page.evaluate(() => cmsView.snapshot());
  assert.equal(report.initial.exhibit.components, 18);
  assert.ok(report.initial.draw.calls < 50);
  for (const layer of process.env.WE3D_CMS_VIEW_ONLY === '1'
    ? ['all', 'muon', 'ecal']
    : ['all', 'tracking', 'ecal', 'hcal', 'muon']) {
    await page.getByRole('button', { name: layer, exact: true }).click();
    const state = await page.evaluate(() => cmsView.snapshot());
    assert.equal(state.exhibit.layer, layer);
    assert.ok(state.draw.calls > 0);
    await page.screenshot({ path: output + '/' + layer + '.png' });
  }
  if (process.env.WE3D_CMS_VIEW_ONLY === '1') {
    report.scope =
      'Only corrected owned triangle normals and shaded surface presentation; actual native load/layer/lease/disposal proof in detector1793714156425 is reused. Controlled camera/lighting; no facility, numerical or career completion claim.';
    await qa.succeed();
  } else {
    report.leases = await page.evaluate(() => cmsView.cache());
    assert.equal(
      report.leases.entries
        .filter((e) => e.id.startsWith('cms-'))
        .reduce((n, e) => n + e.leases, 0),
      18
    );
    await page.evaluate(() => cmsView.detector.dispose());
    assert.equal(await page.evaluate(() => cmsView.detector.root.parent), null);
    assert.equal(
      await page.evaluate(() =>
        cmsView
          .cache()
          .entries.filter((e) => e.id.startsWith('cms-'))
          .reduce((n, e) => n + e.leases, 0)
      ),
      0
    );
    await qa.succeed();
  }
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
