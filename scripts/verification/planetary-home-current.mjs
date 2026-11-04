import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { lunarReportFixture } from '../../tests/helpers/lunar-study-record.mjs';
const output = 'output/verification/planetary-career-20261103/home-' + Date.now();
const source =
  'output/verification/cartography-career-20261103/access-1793696455262/qa-fieldwork-backup.json';
const originalSource = 'output/roadmap-20261010/lunar-observation-earth-final/journal.json';
const recovery = process.env.WE3D_PLANETARY_HOME_RECOVERY;
const data = JSON.parse(await fs.readFile(recovery || source)),
  original = JSON.parse(await fs.readFile(originalSource)).events.find(
    (e) => e.eventId === 'event:destination-mission:moon',
  );
assert.equal(original.metadata.strategy, 'observe');
const qa = await createFieldworkQaSession({
    output,
    careerId: 'planetary',
    maximumDurationMs: 150000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Controlled native Earth room, actual existing home/GLB leases/IndexedDB/UI. Genuine accepted original optical report; the two repeat report shapes are CONTROLLED component data only. No lunar field or mapped-city journey claim. Original First Bearings is not synthesized.';
  report.sources = { source, recovery: recovery || null, originalSource };
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('planetary-home-seed')) {
      window.__fieldworkBackup = data;
      sessionStorage.setItem('planetary-home-seed', '1');
    }
    window.__skipOpeningChapterFixture = true;
  }, data);
  await page.goto('http://127.0.0.1:4192/scripts/verification/fixtures/personal-workspace.html');
  await page.waitForFunction(() => window.fixture && !fixture.runtime.snapshot().busy);
  await page.evaluate(async (original) => {
    await fixture.store.recordExplorerEvent(original);
    await fixture.runtime.refresh();
  }, original);
  assert.notEqual(
    await page.evaluate(async () => (await fixture.store.getProfile()).openingChapter.phase),
    'complete',
  );
  await page.locator('[data-home-action="place"]').click();
  await page.waitForFunction(
    () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy,
  );
  await page.evaluate(async () => {
    const { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js'),
      g = workspaceGeometry(fixture.active, fixture.runtime.snapshot().workspace.pose);
    Object.assign(fixture.walker, { ...g.use, y: g.use.y + 1.7 });
    fixture.state.ui.setOpen(true);
  });
  await page.waitForFunction(() => fixture.runtime.snapshot().interactionReady);
  const rows = [
    original,
    lunarReportFixture('alternate-method', 'samples'),
    lunarReportFixture('planned-return', 'observe'),
  ];
  for (const row of recovery ? [] : rows) {
    const id = row.metadata.surveyVariantId || 'campaign';
    if (id !== 'campaign')
      await page.evaluate(async (row) => {
        await fixture.store.recordExplorerEvent(row);
        await fixture.runtime.refresh();
      }, row);
    if (await page.locator('[data-home-lunar-record]').count())
      await page.locator('[data-home-lunar-record]').selectOption(row.eventId);
    await page.locator('[data-home-action="lunar-display"]').click();
    await page.waitForFunction(
      (id) =>
        fixture.runtime.snapshot().workspace.recordId === id &&
        fixture.runtime.snapshot().furnitureReady &&
        !fixture.runtime.snapshot().busy,
      row.eventId,
    );
    const displayId =
      id === 'campaign'
        ? 'event:campaign:lunar-homecoming:v1'
        : 'event:campaign:lunar-homecoming:' + id;
    if (id === 'alternate-method') {
      await page.evaluate((displayId) => {
        window.targetedWriteFailed = false;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, ...args) {
          if (this.name === 'events' && value?.eventId === displayId) {
            IDBObjectStore.prototype.put = put;
            window.targetedWriteFailed = true;
            throw new DOMException('Controlled homecoming quota', 'QuotaExceededError');
          }
          return put.call(this, value, ...args);
        };
      }, displayId);
      await page.locator('[data-home-action="lunar-review"]').click();
      await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
      assert.equal(await page.evaluate(() => window.targetedWriteFailed), true);
      assert.equal(
        await page.evaluate(
          async (id) => (await fixture.store.getEventsById([id])).length,
          displayId,
        ),
        0,
      );
      assert.equal(
        await page.evaluate(() => fixture.runtime.snapshot().workspace.recordId),
        row.eventId,
      );
    }
    await page.locator('[data-home-action="lunar-review"]').click();
    await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
    assert.equal(
      await page.evaluate(
        async (id) => (await fixture.store.getEventsById([id])).length,
        displayId,
      ),
      1,
    );
    await page.locator('[data-home-action="lunar-review"]').click();
    await page.waitForFunction(() => !fixture.runtime.snapshot().busy);
    assert.equal(
      await page.evaluate(
        async (id) => (await fixture.store.getEventsById([id])).length,
        displayId,
      ),
      1,
    );
    if (id === 'campaign') {
      const seed = await page.evaluate(async () => fixture.store.exportData());
      await fs.writeFile(output + '/qa-original-display-seed.json', JSON.stringify(seed), {
        mode: 0o600,
      });
    }
    await page.locator('.planetary-report summary').click();
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('.planetary-report').scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.doesNotMatch(
        await page.locator('.planetary-report').innerText(),
        /undefined|NaN|Infinity/,
      );
      await page.screenshot({ path: output + '/' + id + '-' + width + '.png' });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      fixture.state.ui.setOpen(false);
      const g = fixture.active.group.getObjectByName('Personal research workspace'),
        paper = g.children.find((o) => o.isMesh && o.material.map?.image?.tagName === 'CANVAS');
      if (!paper) throw Error('Selected physical plate missing');
      const p = paper.getWorldPosition(new THREE.Vector3());
      Object.assign(fixture.walker, { x: p.x - 0.8, y: p.y + 0.8, z: p.z });
      fixture.ctx.camera.position.set(p.x - 0.8, p.y + 0.8, p.z);
      window.__qaCameraLookTarget = [p.x, p.y, p.z];
      fixture.ctx.camera.lookAt(p);
      fixture.ctx.renderer.render(fixture.ctx.scene, fixture.ctx.camera);
    });
    await page.screenshot({ path: output + '/' + id + '-desk.png' });
    await page.evaluate(() => fixture.state.ui.setOpen(true));
    report.checks.push(id + ' selected physical plate, one homecoming, duplicate, three layouts');
  }
  if (recovery) {
    await page
      .locator('[data-home-lunar-record]')
      .selectOption('event:destination-mission:moon:planned-return');
    await page.locator('[data-home-action="lunar-display"]').click();
    await page.waitForFunction(
      () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy,
    );
    report.checks.push(
      'Only reload/disposal boundary, saved six-event controlled checkpoint reused; no field or homecoming replay',
    );
  }
  const saved = await page.evaluate(async () => fixture.store.exportData());
  await fs.writeFile(output + '/qa-controlled-home-backup.json', JSON.stringify(saved), {
    mode: 0o600,
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      window.fixture &&
      fixture.runtime.snapshot().furnitureReady &&
      !fixture.runtime.snapshot().busy,
  );
  assert.equal(
    await page.evaluate(() => fixture.runtime.snapshot().workspace.recordId),
    'event:destination-mission:moon:planned-return',
  );
  report.events = await page.evaluate(async () => {
    const { lunarStudyEventIds, lunarStudyState } = await import(
      '/app/js/planetary/lunar-study-records.js'
    );
    const rows = await fixture.store.getEventsById(lunarStudyEventIds),
      s = lunarStudyState(rows);
    return {
      reports: Object.keys(s.reports).filter((k) => s.reports[k]),
      displays: Object.keys(s.displays).filter((k) => s.displays[k]),
      count: rows.length,
    };
  });
  assert.equal(report.events.count, 6);
  assert.equal(await page.evaluate(() => fixture.ctx.dynamicBuildingColliders.length), 2);
  await page.evaluate(() => fixture.runtime.dispose());
  assert.equal(await page.evaluate(() => fixture.ctx.dynamicBuildingColliders.length), 0);
  assert.equal(
    await page.evaluate(
      () => fixture.active.group.getObjectByName('Personal research workspace') === undefined,
    ),
    true,
  );
  report.checks.push(
    'targeted real IDB homecoming failure/retry, reload, selected plate, two proxies released',
  );
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
