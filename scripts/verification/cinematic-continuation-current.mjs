import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const base = 'http://127.0.0.1:4192';
const output = path.resolve(
  `output/verification/cinematic-app-20261105/continuation-${Date.now()}`
);
const qa = await createFieldworkQaSession({ output, careerId: 'pilot', maximumDurationMs: 300000 });
const page = qa.page,
  report = {
    scope:
      'New Home Continue and legacy Harbor Run alias using genuine prior checkpoints. No accepted delivery, field methods, rewards or history are synthesized or replayed.',
    checks: [],
  };
const sources = [
  [
    'geology',
    'output/verification/cinematic-app-20261105/journey-1793890040223/qa-fieldwork-backup.json',
  ],
  [
    'harbor',
    'output/verification/pilot-career-20261103/review-1793741706007/qa-fieldwork-backup.json',
  ],
];
try {
  await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  for (const [kind, source] of sources) {
    const backup = JSON.parse(await fs.readFile(source, 'utf8'));
    await page.goto(base + '/app/');
    await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
    await page.evaluate(async (backup) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(backup);
    }, backup);
    await page.reload();
    await page
      .locator('#playerEntryScreen [data-entry=continue-task]')
      .waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(
      () => document.getElementById('startBtn')?.disabled === false,
      null,
      { timeout: 90000 }
    );
    await page.locator('#playerEntryScreen [data-entry=continue-task]').click();
    await page.locator('#experienceBrowser[open]').waitFor();
    const id = kind === 'geology' ? 'career:geologist' : 'activity:harbor-run';
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-experience-begin]');
      return !!e && !e.disabled;
    });
    assert.match(
      await page.locator('.experience-detail .experience-eyebrow').innerText(),
      kind === 'geology' ? /Geologist/i : /Harbor Run/i
    );
    if (kind === 'geology')
      assert.match(await page.locator('[data-experience-begin]').innerText(), /Resume/i);
    else assert.equal(await page.locator('[data-experience-variant]').inputValue(), 'return-case');
    const before = await page.evaluate(async () => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      return createIndexedDbDiscoveryProfileStore().exportData();
    });
    assert.deepEqual(before.profile.activeExperience, backup.profile.activeExperience);
    assert.deepEqual(before.events, backup.events);
    report.checks.push(kind + ':Home-Continue-opens-original-selected-assignment');
    await page.screenshot({ path: path.join(output, kind + '-home-continue.png') });
    if (kind === 'harbor') {
      await page.locator('[data-experience-begin]').click();
      await qa.waitForCareer('return-case');
      const after = await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.discoveryProfileStore.exportData();
      });
      assert.equal(after.profile.activeExperience.experienceId, id);
      assert.deepEqual(after.profile.harborRun, backup.profile.harborRun);
      for (const event of backup.events)
        assert.deepEqual(
          after.events.find((e) => e.eventId === event.eventId),
          event
        );
      assert.equal(after.events.filter((e) => e.metadata?.pilotDeliveryReport).length, 1);
      await page.screenshot({ path: path.join(output, 'original-completed-harbor-return.png') });
      report.checks.push(
        'Legacy-pilot-Continue-enters-same-Harbor-runtime-return-case-with-original-route-revision-finish-and-271-events'
      );
    }
  }
  assert.deepEqual(qa.report.errors, []);
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  report.ok = true;
  await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  report.failure = error.stack;
  report.errors = qa.report.errors;
  report.providerErrors = qa.report.providerErrors;
  await page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa.close();
}
