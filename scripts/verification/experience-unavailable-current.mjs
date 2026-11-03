import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/unavailable-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 60000
  }),
  { page, report } = qa;
try {
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/tests/fixtures/field-store.html'
  );
  await page.evaluate(async () => {
    const { createExperienceBrowser } = await import('/app/js/ui/experience-browser.js');
    window.summaryReads = 0;
    window.unavailableBrowser = createExperienceBrowser({
      readProfile: async () => ({
        researchCareers: { palaeontology: { schemaVersion: 9, opaque: { kept: true } } }
      }),
      resolveAdapter: () => ({
        places: () => [],
        offer: () => ({
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved career needs a newer version of World Explorer.',
          enabled: false
        }),
        summary: () => {
          window.summaryReads++;
          throw Error('Unsupported data must remain uninterpreted.');
        }
      })
    });
    await unavailableBrowser.open({ experienceId: 'career:palaeontologist' });
  });
  await page.getByRole('button', { name: 'Update required', exact: true }).waitFor();
  assert.equal(await page.locator('[data-experience-begin]').isDisabled(), true);
  assert.equal(await page.evaluate(() => summaryReads), 0);
  report.checks.push(
    'An unavailable adapter displays its reason and disabled action without interpreting a newer saved career.'
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
