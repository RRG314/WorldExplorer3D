import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/recovery-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 120000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected recovery boundary only: actual memory/IndexedDB, original JPEG retention and archive viewing, and native Activities intent/layout. Separate source-world relocation acceptance is required.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/tests/fixtures/field-store.html'
  );
  report.checks = await page.evaluate(async () => {
    const { createMemoryDiscoveryProfileStore, createIndexedDbDiscoveryProfileStore } =
        await import('/app/js/discovery/profile-store.js'),
      { fossilHarness } = await import('/tests/helpers/palaeontology-study.mjs'),
      { fieldPhotoFixtures } = await import('/tests/helpers/field-photo-fixture.mjs'),
      { validateJournalBackup } = await import('/app/js/discovery/backup-validation.js'),
      { palaeontologyArchiveMarkup, showResearchPhoto } = await import(
        '/app/js/campaign/palaeontology-report.js'
      );
    const photos = await fieldPhotoFixtures(),
      checks = [],
      yes = (v, m) => {
        if (!v) throw Error(m);
      };
    let finalStore;
    for (const kind of ['memory', 'indexeddb']) {
      const store =
        kind === 'memory'
          ? createMemoryDiscoveryProfileStore()
          : createIndexedDbDiscoveryProfileStore();
      await store.importData(await createMemoryDiscoveryProfileStore().exportData());
      const h = fossilHarness(
        undefined,
        'campaign',
        'fossil-before-move',
        Object.fromEntries(Object.entries(photos).map(([slot, row]) => [slot, row.capture]))
      );
      h.step('inspect', { form: h.study.form });
      h.photographs();
      h.prepare();
      for (const e of h.events)
        await store.updateResearchCareer('palaeontology', e.metadata.action, {
          now: e.occurredAt,
          ...(e.metadata.action.type === 'photograph'
            ? { photoAttachment: photos[e.metadata.action.slot].photo }
            : {})
        });
      const before = await store.exportData(),
        site = structuredClone(h.state.active.site);
      site.location.lat += 0.0003;
      for (const p of Object.values(site.points)) p.lat += 0.0003;
      const moved = await store.updateResearchCareer(
        'palaeontology',
        {
          type: 'relocate',
          revision: h.state.revision,
          runId: 'fossil-after-move',
          variantId: 'campaign',
          site
        },
        { now: 2000 }
      );
      const after = await store.exportData();
      yes(
        after.researchMedia.length === 2 && after.items.length === 1,
        'move deleted pixels or specimen'
      );
      yes(
        JSON.stringify(after.researchMedia) === JSON.stringify(before.researchMedia),
        'move changed original images'
      );
      yes(
        moved.state.active.phase === 'brief' && !Object.keys(moved.state.completed).length,
        'move fabricated completion'
      );
      yes(after.events.length === before.events.length + 1, 'move replaced prior notes');
      validateJournalBackup(after);
      await store.importData(after);
      yes(
        (await store.getProfile()).researchCareers.palaeontology.active.priorAttempts[0].runId ===
          'fossil-before-move',
        'archive lost on import'
      );
      const host = document.querySelector('#fieldEvidence');
      host.innerHTML = palaeontologyArchiveMarkup(moved.event.metadata.palaeontologyArchive);
      yes(
        host.querySelectorAll('[data-research-photo]').length === 2,
        'archived photos have no review action'
      );
      await showResearchPhoto(host.querySelector('[data-research-photo]'), store);
      yes(
        host.querySelector('img')?.src === photos.layer.photo.dataUrl,
        'archive did not restore original pixels'
      );
      checks.push(
        `${kind}: relocation retains notes, exact JPEGs and labelled specimen; new observations required, no capstone awarded; backup and archive photo review pass`
      );
      finalStore = store;
    }
    window.recoveryFinalStore = finalStore;
    return checks;
  });
  await fs.writeFile(
    `${output}/storage-accepted.json`,
    JSON.stringify({ ok: true, checks: report.checks }, null, 2) + '\n'
  );
  await page.evaluate(async () => {
    const finalStore = window.recoveryFinalStore;
    const { createExperienceBrowser } = await import('/app/js/ui/experience-browser.js'),
      { palaeontologyCareerSummary } = await import('/app/js/campaign/palaeontology-career.js'),
      { fieldResearchPlaces } = await import('/app/js/campaign/field-research-places.js');
    window.recoveryUi = createExperienceBrowser({
      readContext: () => ({ loaded: true, environment: 'earth' }),
      readProfile: () => finalStore.getProfile(),
      resolveAdapter: () => ({
        recoveryActions: ['relocate-course'],
        places: (input) => fieldResearchPlaces('palaeontology', input),
        offer: () => ({ state: 'ready', label: 'Begin fossil case', enabled: true }),
        summary: ({ profile, variantId }) =>
          palaeontologyCareerSummary(profile?.researchCareers?.palaeontology, { variantId })
      }),
      onBegin: async (intent) => {
        window.recoveryUiIntent = intent;
        return true;
      }
    });
    await recoveryUi.open({ experienceId: 'career:palaeontologist' });
  });
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    const button = page.locator('[data-experience-recovery=relocate-course]'),
      r = await button.boundingBox();
    assert.ok(r.height >= 44 && r.y >= 0 && r.y + r.height <= height);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${width}-recovery-action.png` });
    report.checks.push(
      `${width}x${height}: explicit Move training site action fits the fixed Activities footer`
    );
  }
  await page.locator('[data-experience-recovery=relocate-course]').click();
  assert.equal(await page.evaluate(() => recoveryUiIntent.recoveryAction), 'relocate-course');
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
