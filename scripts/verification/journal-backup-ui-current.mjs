import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { journalBackupSummary } from '../../app/js/discovery/journal-backup-ui.js';
const mediaOnly = process.env.WE3D_JOURNAL_BACKUP_MEDIA_ONLY === '1';
const root = process.cwd(),
  source =
    process.env.WE3D_JOURNAL_BACKUP_SOURCE ||
    'output/verification/companion-handling-20261103/handoff-1793751709613/qa-fieldwork-backup.json',
  seed = JSON.parse(await fs.readFile(source)),
  output = root + '/output/verification/coherence-whole-ui-20261103/backup-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    rootDir: root,
    careerId: 'companions',
    maximumDurationMs: 180000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Native Profile export boundary only. Actual latest saved source Journal/photographs and real IndexedDB; controlled failed export read, real browser download, exact retained bytes and three layouts. No source-world play, image-appearance, career replay or filled-disk claim.';
  report.source = source;
  await page.route('**/journal-backup-native-view', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/app/"><link rel="stylesheet" href="/styles/world-explorer-tokens.css"><link rel="stylesheet" href="/styles/world-explorer-components.css"><link rel="stylesheet" href="/app/styles/discovery.css"><style>body{background:#122825;margin:12px}#discoveryPanel{position:relative;inset:auto;width:100%;max-width:760px;margin:auto;overflow:visible;padding:16px}#discoveryPanel p{line-height:1.5}</style><main id="discoveryPanel" class="show"></main>',
    })
  );
  await page.goto('http://127.0.0.1:4192/journal-backup-native-view');
  const index = await fs.readFile(root + '/app/index.html', 'utf8'),
    section = index.match(/<details class="discoveryOnlineService">[\s\S]*?<\/details>/)?.[0];
  assert.ok(section);
  await page.locator('main').evaluate((node, html) => (node.innerHTML = html), section);
  await page.locator('details').evaluate((node) => (node.open = true));
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      ),
      { bindJournalBackupExport } = await import('/app/js/discovery/journal-backup-ui.js');
    const store = createIndexedDbDiscoveryProfileStore();
    await store.importData(data);
    const listeners = [];
    window.fixture = { store, fail: false, calls: 0 };
    fixture.binding = bindJournalBackupExport({
      store: {
        exportData: async () => {
          fixture.calls++;
          if (fixture.fail)
            throw new DOMException('PRIVATE controlled read failure', 'QuotaExceededError');
          fixture.lastData = await store.exportData();
          return fixture.lastData;
        },
      },
      exportButton: document.getElementById('discoveryExportBtn'),
      storageButton: document.getElementById('discoveryStorageBtn'),
      status: document.getElementById('discoveryBackupStatus'),
      otherButtons: [
        document.getElementById('discoveryImportBtn'),
        document.getElementById('discoveryUndoImportBtn'),
      ],
      listen(node, event, fn) {
        node?.addEventListener(event, fn);
        listeners.push(() => node?.removeEventListener(event, fn));
      },
    });
    const { discoverySaveMessage } = await import('/app/js/discovery/save-status.js?v=1');
    document.getElementById('discoverySaveStatus').textContent = discoverySaveMessage({
      durable: true,
      signedIn: false,
    });
    fixture.raw = () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('world-explorer-discovery');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction(['profiles', 'events', 'companions'], 'readonly'),
            out = {};
          for (const name of ['profiles', 'events', 'companions']) {
            const q = tx.objectStore(name).getAll();
            q.onsuccess = () => (out[name] = q.result);
          }
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    fixture.dispose = () => {
      fixture.binding.dispose();
      listeners.forEach((fn) => fn());
    };
  }, seed);
  if (!mediaOnly) {
    await page.locator('#discoveryStorageBtn').click();
    await page.waitForFunction(() =>
      /This site uses|estimate is unavailable/.test(
        document.getElementById('discoveryBackupStatus').textContent
      )
    );
    report.checks.push({ name: 'Optional actual browser storage estimate uses no Journal write' });
    await page.evaluate(async () => {
      fixture.before = await fixture.raw();
      fixture.fail = true;
    });
    await page.locator('#discoveryExportBtn').click();
    await page.waitForFunction(() =>
      document
        .getElementById('discoveryBackupStatus')
        .textContent.includes('Saved records and photographs are kept')
    );
    assert.equal(
      await page.evaluate(
        async () => JSON.stringify(await fixture.raw()) === JSON.stringify(fixture.before)
      ),
      true
    );
    assert.equal(
      (await page.locator('#discoveryBackupStatus').textContent()).includes('PRIVATE'),
      false
    );
    await page.screenshot({ path: output + '/export-retry.png' });
    report.checks.push({
      name: 'Controlled failed export read leaves all raw existing rows unchanged and offers friendly retry',
    });
  }
  await page.evaluate(() => (fixture.fail = false));
  const waiting = page.waitForEvent('download');
  await page.locator('#discoveryExportBtn').click();
  const download = await waiting;
  assert.equal(await download.failure(), null);
  await download.saveAs(output + '/journal-backup.json');
  const actual = JSON.parse(await fs.readFile(output + '/journal-backup.json')),
    snapshot = await page.evaluate(() => fixture.lastData);
  assert.deepEqual(actual, snapshot);
  assert.deepEqual(actual.researchMedia, seed.researchMedia);
  assert.deepEqual(actual.albums, seed.albums);
  assert.deepEqual(actual.events, seed.events);
  for (const row of actual.researchMedia) {
    if (row.schemaVersion === 1)
      assert.equal(createHash('sha256').update(row.photo.dataUrl).digest('hex'), row.fingerprint);
  }
  report.summary = journalBackupSummary(actual);
  report.fileBytes = (await fs.stat(output + '/journal-backup.json')).size;
  report.checks.push({
    name: 'Real JSON download contains every original source album, field photograph and event; all known field JPEG fingerprints match',
  });
  if (!mediaOnly) {
    for (const [width, height] of [
      [1440, 960],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.locator('main').evaluate((e) => e.scrollWidth > e.clientWidth + 1),
        false
      );
      assert.ok((await page.locator('#discoveryExportBtn').boundingBox()).height >= 44);
      await page.screenshot({ path: output + '/backup-' + width + '.png' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--wx-type-control', '28px')
    );
    assert.equal(
      await page.locator('main').evaluate((e) => e.scrollWidth > e.clientWidth + 1),
      false
    );
    await page.screenshot({ path: output + '/backup-200-percent-type.png' });
    report.checks.push({
      name: 'Three native layouts and doubled control text retain accessible export/storage actions without horizontal overflow; not a whole-app accessibility certification',
    });
  } else {
    report.reusedBoundaries =
      'backup-1793752143028: read failure/rollback, optional estimate, three sizes and doubled control text accepted; not repeated';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/field-photo-backup.png' });
  }
  await page.evaluate(() => fixture.dispose());
  await qa.succeed();
} catch (error) {
  await fs.writeFile(
    output + '/native-failure.json',
    JSON.stringify({ error: error.stack }, null, 2) + '\n'
  );
  await page.screenshot({ path: output + '/failed.png' }).catch(() => {});
  throw error;
} finally {
  await qa.close();
}
