import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = 'output/verification/engineering-career-20261103/entrance-1793735353782',
  backup = JSON.parse(await fs.readFile(source + '/qa-fieldwork-backup.json')),
  possessions = JSON.parse(await fs.readFile(source + '/possessions.json')),
  output = 'output/verification/engineering-career-20261103/owner-identity-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'engineering',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa,
  requests = new Set();
page.on('request', (r) => {
  if (r.url().includes('/app/js/game/property-ui.js'))
    requests.add(new URL(r.url()).pathname + new URL(r.url()).search);
});
try {
  report.scope =
    'Only the corrected canonical property-module import at the real Activities entry. Retained source workspace/report data; no world start or design procedure replay.';
  await page.addInitScript(
    (p) => localStorage.setItem('world-explorer:character-backpack:v3', JSON.stringify(p)),
    possessions
  );
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:field-engineer"]').click();
  await page.locator('[data-experience-variant]').waitFor();
  report.identity = await page.evaluate(async () => {
    const { getPersonalHousing } = await import('/app/js/game/property-ui.js?v=9'),
      { ctx } = await import('/app/js/shared-context.js?v=55');
    const a = getPersonalHousing(),
      b = (await import('/app/js/game/property-ui.js?v=9')).getPersonalHousing(),
      v = a.snapshot(),
      h = v.homes.find((h) => h.id === v.starterHomeId);
    return {
      sameOwner: a === b,
      reports: Object.keys(h.workspace.projects.reports).length,
      revision: h.workspace.revision,
      started: ctx.gameStarted === true,
    };
  });
  assert.equal(report.identity.sameOwner, true);
  assert.equal(report.identity.reports, 3);
  assert.equal(report.identity.started, false);
  assert.deepEqual([...requests], ['/app/js/game/property-ui.js?v=9']);
  report.moduleRequests = [...requests];
  await page.screenshot({ path: output + '/canonical-activities-entry.png' });
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
