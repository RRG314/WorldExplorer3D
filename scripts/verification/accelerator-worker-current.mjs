import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { CMS_STUDY_REFERENCE } from '../../app/js/campaign/cms-study-reference.js';
const output = 'output/verification/accelerator-career-20261103/worker-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
let dataRequests = 0;
try {
  report.scope =
    'Only the new real dedicated-worker seam: bounded original-source requests, lazy pinned100000-row load/hash, compact witness and matched charge results, owned termination. No accepted ten-check numerical requalification, physical instrument/field journey or saved career.';
  page.context().on('request', (request) => {
    if (request.url().includes('/app/assets/data/cms/dimuon-2010b.json')) dataRequests++;
  });
  await page.goto('http://127.0.0.1:4192/tests/fixtures/accelerator-worker.html');
  await page.waitForFunction(() => window.ready);
  const bend = await page.evaluate(() => acceleratorWorkerView.run('bend', { fieldTesla: 1.5 }));
  assert.equal(bend.method, 'bend');
  assert.equal(bend.category, 'EDUCATIONAL_MODEL');
  assert.equal(dataRequests, 0);
  const mass = await page.evaluate(() => acceleratorWorkerView.run('mass', { beta: 0 }));
  assert.equal(mass.dataVerification.rows, 100000);
  assert.equal(mass.dataVerification.bundleSha256, CMS_STUDY_REFERENCE.bundleSha256);
  assert.equal(mass.readings.eventId, CMS_STUDY_REFERENCE.witnesses.campaign.id);
  for (const charge of ['opposite', 'same']) {
    const r = await page.evaluate(
        (charge) => acceleratorWorkerView.run('population', { cutGeV: 20, charge }),
        charge
      ),
      expected = CMS_STUDY_REFERENCE.populations[20][charge];
    assert.equal(r.category, 'REAL_RECORDED_DATA');
    assert.equal(r.readings.count, expected.count);
    assert.deepEqual(r.readings.bins, expected.bins);
    assert.equal(r.readings.selectedRowsSha256, expected.selectedRowsSha256);
  }
  assert.equal(dataRequests, 1);
  report.dataRequests = dataRequests;
  report.verifiedSource = mass.dataVerification;
  report.client = await page.evaluate(() => acceleratorWorkerView.client.snapshot());
  await page.evaluate(() => acceleratorWorkerView.client.dispose());
  assert.deepEqual(await page.evaluate(() => acceleratorWorkerView.client.snapshot()), {
    closed: true,
    workerActive: false,
    pending: false,
    requests: 4,
  });
  assert.deepEqual(report.errors, []);
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
