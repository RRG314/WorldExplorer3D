import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_FIELD_BACKUP || ''),
  careerId = process.env.WE3D_FIELD_CAREER,
  badgeId = process.env.WE3D_FIELD_BADGE,
  label = process.env.WE3D_FIELD_BADGE_LABEL;
assert.ok(source.startsWith(path.resolve('output/verification') + path.sep));
assert.match(careerId, /^[a-z-]+$/);
assert.match(badgeId, /^[a-z-]+$/);
assert.ok(label);
const data = JSON.parse(await fs.readFile(source)),
  output = `output/verification/${careerId}-career-20261102/profile-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId, maximumDurationMs: 240000 }),
  { page, report } = qa;
try {
  report.scope =
    'Changed earned badge label in the actual native Profile only. Actual source history imported; no repeated field procedure, report, corrupted import or revisit.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/app/?lat=39.3173&lon=-76.64044&name=Druid%20Hill%20Park&diagnostics=1'
  );
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, data);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaFieldProfileReady = () =>
      ctx.gameStarted &&
      !ctx.worldLoading &&
      !!ctx.worldDiscoveryRuntime &&
      !!ctx.worldPublication?.requestId &&
      !document.querySelector('#loading')?.classList.contains('show');
  });
  await page.waitForFunction(() => window.__qaFieldProfileReady(), {}, { timeout: 180000 });
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator(`[data-explorer-badge="${badgeId}"]`);
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  assert.ok((await badge.innerText()).includes(label));
  report.badge = await badge.innerText();
  await page.screenshot({ path: output + '/named-badge.png' });
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
