import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_FOSSIL_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/palaeontology-career-20261102') + path.sep) &&
    path.basename(source) === 'qa-fieldwork-backup.json',
  'Supply the accepted source-world backup'
);
const backup = JSON.parse(await fs.readFile(source, 'utf8'));
assert.equal(Object.keys(backup.profile.researchCareers.palaeontology.completed).length, 3);
const output = `output/verification/palaeontology-career-20261102/exhibition-${Date.now()}`;
const qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 120000
  }),
  { page, report } = qa;
report.scope =
  'Actual home runtime, WebGL furniture/plate, GUI selection, housing persistence and IndexedDB in the existing controlled-room fixture. Completed fossil records come from the accepted source-world backup. Controlled actor placement; not a new home ownership or city-traversal claim.';
report.source = source;
try {
  await page.addInitScript((data) => {
    window.__fieldworkBackup = data;
  }, backup);
  const url =
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
    '/scripts/verification/fixtures/personal-workspace.html';
  await page.goto(url);
  await page.waitForFunction(() => window.fixture && !fixture.runtime.snapshot().busy);
  await page.locator('[data-home-action=place]').click();
  await page.waitForFunction(
    () => fixture.runtime.snapshot().furnitureReady && !fixture.runtime.snapshot().busy
  );
  await page.evaluate(async () => {
    const { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js'),
      g = workspaceGeometry(fixture.active, fixture.runtime.snapshot().workspace.pose);
    Object.assign(fixture.walker, { ...g.use, y: g.use.y + 1.7 });
    fixture.state.ui.setOpen(true);
  });
  await page.locator('[data-home-archaeology-record]').waitFor();
  assert.equal(await page.locator('[data-home-archaeology-record] option').count(), 3);
  const records = await page
    .locator('[data-home-archaeology-record] option')
    .evaluateAll((rows) => rows.map((row) => ({ id: row.value, label: row.textContent })));
  for (const record of records) {
    await page.locator('[data-home-archaeology-record]').selectOption(record.id);
    await page.locator('[data-home-action=archaeology-display]').click();
    await page.waitForFunction(
      (id) =>
        fixture.runtime.snapshot().workspace.recordId === id &&
        fixture.runtime.snapshot().furnitureReady &&
        !fixture.runtime.snapshot().busy,
      record.id
    );
    const scene = await page.evaluate(() => ({
      groups: fixture.active.group.children.filter(
        (row) => row.name === 'Personal research workspace'
      ).length,
      colliders: fixture.ctx.dynamicBuildingColliders.length
    }));
    assert.deepEqual(scene, { groups: 1, colliders: 2 });
    report.checks.push({
      name: 'Completed fossil plate displayed through existing home owner: ' + record.label,
      recordId: record.id,
      scene
    });
  }
  await page.screenshot({ path: `${output}/exhibition-controls.png` });
  await page.evaluate(async () => {
    const { workspaceGeometry } = await import('/app/js/campaign/personal-workspace.js'),
      g = workspaceGeometry(fixture.active, fixture.runtime.snapshot().workspace.pose);
    Object.assign(fixture.walker, { ...g.use, y: g.use.y + 1.7 });
    fixture.state.ui.setOpen(false);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${output}/exhibition-on-desk.png` });
  const last = records.at(-1).id;
  await page.reload();
  await page.waitForFunction(
    () =>
      window.fixture &&
      fixture.runtime.snapshot().furnitureReady &&
      !fixture.runtime.snapshot().busy
  );
  assert.equal(await page.evaluate(() => fixture.runtime.snapshot().workspace.recordId), last);
  assert.equal(await page.locator('[data-home-archaeology-record]').inputValue(), last);
  report.checks.push({
    name: 'Displayed plate and matching exhibition selection survive room reload',
    recordId: last
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-home-action=archaeology-display]').scrollIntoViewIfNeeded();
  assert.equal(
    await page.locator('aside').evaluate((el) => el.scrollWidth > el.clientWidth + 1),
    false
  );
  const action = await page.locator('[data-home-action=archaeology-display]').boundingBox();
  assert.ok(action.height >= 44 && action.y >= 0 && action.y + action.height <= 844);
  await page.screenshot({ path: `${output}/390-home-controls.png` });
  report.checks.push({
    name: 'New exhibition selector and display action fit the portrait home panel'
  });
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
