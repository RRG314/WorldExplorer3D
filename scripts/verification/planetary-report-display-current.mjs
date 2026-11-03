import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { runPrescribedGameActions } from './prescribed-game-actions.mjs';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { lunarStudyEventIds, lunarStudyState } from '../../app/js/planetary/lunar-study-records.js';
const source = process.env.WE3D_PLANETARY_RECOVERY || '';
assert.match(source, /planetary-career-20261103\/world-\d+\/qa-lunar-checkpoint\.json$/);
const seed = JSON.parse(await fs.readFile(source)),
  data = seed.discovery,
  saved = lunarStudyState(data.events);
assert.equal(Object.values(saved.reports).filter(Boolean).length, 3);
assert.equal(Object.values(saved.displays).filter(Boolean).length, 3);
const output = 'output/verification/planetary-career-20261103/display-' + Date.now();
await fs.mkdir(output, { recursive: true });
const memory = createMemoryDiscoveryProfileStore();
await memory.importData(data);
const before = await memory.exportData();
assert.deepEqual(before.profile.researchCareers, data.profile.researchCareers);
const altered = structuredClone(before),
  planned = altered.events.find(
    (e) => e.eventId === 'event:destination-mission:moon:planned-return',
  );
planned.metadata.siteARecovery.podId = planned.metadata.podId;
await assert.rejects(memory.importData(altered));
const after = await memory.exportData();
assert.deepEqual(after.profile, before.profile);
assert.deepEqual(after.events, before.events);
await memory.importData(before);
assert.deepEqual((await memory.exportData()).events, before.events);
await fs.writeFile(
  output + '/compatibility.json',
  JSON.stringify(
    {
      ok: true,
      scope:
        'Real memory reader, actual full source backup, all existing research domains unchanged, altered recovery rejected before replacement, exact events retained on retry',
      events: before.events.length,
      reports: Object.keys(saved.reports),
    },
    null,
    2,
  ),
);
const qa = await createFieldworkQaSession({
    output,
    careerId: 'planetary',
    maximumDurationMs: 90000,
  }),
  { page, report } = qa;
try {
  report.source = source;
  report.scope =
    'Only actual three lunar field-book projections in the existing Journal reader at three sizes, with the original older book outside the recent-100 window. Actual source repeat reports plus unchanged accepted original report; no field procedure or native desk failure/reload replay.';
  await page.goto('http://127.0.0.1:4192/tests/fixtures/journey-journal.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (data) => {
    await journalTest.ctx.discoveryProfileStore.importData(data);
    await journalTest.open('journal');
  }, data);
  const plates = page.locator('.planetary-report');
  assert.equal(await plates.count(), 3);
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator('summary').click();
    const text = await p.innerText();
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    assert.match(text, /Composition and age remain unmeasured/);
    report.plates.push(text);
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await p.locator('h3').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/book-${i}-${width}.png` });
      await p.locator('a').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/sources-${i}-${width}.png` });
    }
  }
  assert.equal(report.plates.filter((p) => p.includes('Both recovery identities')).length, 1);
  assert.equal(report.plates.filter((p) => p.includes('other method')).length, 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await plates.first().scrollIntoViewIfNeeded();
  await runPrescribedGameActions(page, output, [{ buttons: [], frames: 3 }], 'canvas');
  await fs.writeFile(
    output + '/prescribed-state.json',
    await page.evaluate(() => render_game_to_text()),
  );
  await page.screenshot({ path: output + '/prescribed-journal.png' });
  report.checks.push(
    'all three actual field books, original timestamp retained, readable paired sites/method/return/source at three sizes, prescribed client choreography',
  );
  assert.deepEqual(
    await page.evaluate(
      async (ids) =>
        (await journalTest.ctx.discoveryProfileStore.getEventsById(ids))
          .map((e) => e.eventId)
          .sort(),
      lunarStudyEventIds,
    ),
    [...lunarStudyEventIds].sort(),
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
