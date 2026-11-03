import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/palaeontology-career-20261102/storage-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 180000
  }),
  { page, report } = qa;
try {
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/experience-browser.html'
  );
  report.scope =
    'Actual IndexedDB and memory transactions with real encoded JPEGs and controlled field commands. Physical camera/world acceptance is separate.';
  report.checks = await page.evaluate(async () => {
    const { createMemoryDiscoveryProfileStore, createIndexedDbDiscoveryProfileStore } =
        await import('/app/js/discovery/profile-store.js'),
      { validateJournalBackup } = await import('/app/js/discovery/backup-validation.js'),
      { fieldPhotoFixtures } = await import('/tests/helpers/field-photo-fixture.mjs'),
      { fossilHarness } = await import('/tests/helpers/palaeontology-study.mjs'),
      { THREE_VIEWS } = await import('/app/js/campaign/three-views.js');
    const assert = (yes, text) => {
        if (!yes) throw Error(text);
      },
      equal = (a, b) => {
        const clean = (v) => {
          const c = structuredClone(v);
          if (c && typeof c === 'object') delete c.exportedAt;
          return c;
        };
        return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
      },
      reject = async (fn, text) => {
        let failed = false;
        try {
          await fn();
        } catch {
          failed = true;
        }
        assert(failed, text);
      },
      photos = await fieldPhotoFixtures(),
      checks = [];
    const seed = createMemoryDiscoveryProfileStore({
      profile: {
        threeViews: { schemaVersion: 2, opaque: 'future album owner' },
        futureCareerField: { kept: true }
      },
      albums: [
        {
          id: THREE_VIEWS.albumId,
          kind: 'personal-photo-album',
          schemaVersion: 1,
          photos: [photos.layer.photo]
        }
      ]
    });
    const original = await seed.exportData();
    for (const kind of ['memory', 'indexeddb']) {
      const store =
        kind === 'memory'
          ? createMemoryDiscoveryProfileStore()
          : createIndexedDbDiscoveryProfileStore();
      await store.importData(original);
      const h = fossilHarness(
        undefined,
        'campaign',
        'fossil-storage-case',
        Object.fromEntries(Object.entries(photos).map(([slot, row]) => [slot, row.capture]))
      );
      h.step('inspect', { form: h.study.form });
      h.photographs();
      h.prepare();
      h.compare();
      h.report();
      for (const e of h.events.slice(0, 2))
        await store.updateResearchCareer('palaeontology', e.metadata.action, { now: e.occurredAt });
      const photoEvent = h.events[2],
        before = await store.exportData();
      await reject(
        () =>
          store.updateResearchCareer('palaeontology', photoEvent.metadata.action, { now: 1000 }),
        'metadata-only photograph admitted'
      );
      await reject(
        () =>
          store.updateResearchCareer('palaeontology', photoEvent.metadata.action, {
            now: 1000,
            photoAttachment: photos.orientation.photo
          }),
        'mismatched photograph admitted'
      );
      assert(equal(before, await store.exportData()), 'rejected photo changed profile/event/media');
      const aborted = new AbortController();
      aborted.abort();
      await reject(
        () =>
          store.updateResearchCareer('palaeontology', photoEvent.metadata.action, {
            now: 1000,
            photoAttachment: photos.layer.photo,
            signal: aborted.signal
          }),
        'aborted save admitted'
      );
      await store.updateResearchCareer('palaeontology', photoEvent.metadata.action, {
        now: 1000,
        photoAttachment: photos.layer.photo
      });
      const saved = await store.getResearchPhoto(photoEvent.metadata.action.capture.id);
      assert(saved.photo.dataUrl === photos.layer.photo.dataUrl, 'pixels not durable');
      const next = h.events[3],
        competing = await Promise.allSettled(
          [1, 2].map(() =>
            store.updateResearchCareer('palaeontology', next.metadata.action, {
              now: 1000,
              photoAttachment: photos.orientation.photo
            })
          )
        );
      assert(
        competing.filter((row) => row.status === 'fulfilled').length === 1,
        'concurrent photo saved twice'
      );
      for (const e of h.events.slice(4))
        await store.updateResearchCareer('palaeontology', e.metadata.action, { now: e.occurredAt });
      const complete = await store.exportData();
      validateJournalBackup(complete);
      assert(complete.researchMedia.length === 2, 'missing owned photos');
      assert(
        equal(await store.getThreeViewsAlbum(), original.albums[0]),
        'existing album overwritten'
      );
      assert(complete.profile.futureCareerField.kept, 'future profile field lost');
      const missing = structuredClone(complete);
      missing.researchMedia.pop();
      await reject(() => store.importData(missing), 'missing historical photo accepted');
      const corrupt = structuredClone(complete);
      corrupt.researchMedia[0].photo = {
        ...photos.orientation.photo,
        kind: 'context',
        id: 'three-views:context'
      };
      await reject(() => store.importData(corrupt), 'changed pixels accepted');
      assert(
        equal(complete, await store.exportData()),
        'invalid import destroyed existing records'
      );
      await store.importData(original);
      assert(
        (await store.exportData()).researchMedia.length === 0,
        'replacement import retained stale media'
      );
      await store.rollbackLastImport();
      const rolled = await store.exportData();
      assert(equal(rolled.researchMedia, complete.researchMedia), 'rollback lost photo pixels');
      assert(
        equal(
          rolled.profile.researchCareers.palaeontology,
          complete.profile.researchCareers.palaeontology
        ),
        'rollback lost case'
      );
      checks.push(
        `${kind}: atomic photo/evidence, hash rejection, abort, concurrent stale save, specimen completion, missing/corrupt backup rejection, original album isolation and exact media rollback`
      );
    }
    return checks;
  });
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
