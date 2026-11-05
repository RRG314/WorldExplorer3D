import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const output = path.resolve(`output/verification/player-journey-20261105/final-ui-${Date.now()}`),
  base = new URL('/app/', process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').href;
const qa = await createFieldworkQaSession({ output, maximumDurationMs: 150000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected final native Journey/phone career-board count, guest save controls and starter-home globe entry. Prior accepted Continue/reselection, world modes and domain procedures reused.';
  await configureStagingAppCheck(page, base, { proxyGeospatial: false });
  await page.goto(base);
  await page.locator('#playerEntryScreen').waitFor({ state: 'visible', timeout: 90000 });
  await page.evaluate(async () => {
    window.__finalJourneyCtx = (await import('/app/js/shared-context.js?v=55')).ctx;
  });
  await page.waitForFunction(() => __finalJourneyCtx.canStartPlayerJourney?.() === true);
  const backup = JSON.parse(
    await fs.readFile(
      'output/verification/cinematic-app-20261105/journey-1793890040223/qa-fieldwork-backup.json',
      'utf8'
    )
  );
  await page.evaluate(async (backup) => {
    await __finalJourneyCtx.discoveryProfileStore.importData(backup);
  }, backup);
  await page.locator('#playerEntryScreen [data-entry=progress]').click();
  await page.waitForFunction(
    () => document.querySelector('#playerJourney')?.getAttribute('aria-busy') === 'false'
  );
  report.portfolio = await page.evaluate(() => __finalJourneyCtx.readCareerPortfolio());
  assert.equal(report.portfolio.careers.length, 19);
  assert.equal(
    report.portfolio.careers.find((c) => c.id === 'career:planetary-scientist').completedStudies,
    0
  );
  assert.ok(report.portfolio.careers.every((c) => c.total > 0 && !c.unavailable));
  await page.screenshot({ path: path.join(output, 'journey-desktop.png') });
  await page.locator('[data-journey=homes]').click();
  await page.locator('#globeSelectorScreen').waitFor({ state: 'visible' });
  await page.locator('#globeSelectorBackBtn').click();
  await page.locator('#playerEntryScreen [data-entry=progress]').click();
  await page.waitForFunction(
    () => document.querySelector('#playerJourney')?.getAttribute('aria-busy') === 'false'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'journey-phone.png') });
  await page.locator('[data-journey=leaderboard]').click();
  await page.waitForFunction(() => document.querySelectorAll('.career-board-row').length === 19);
  assert.doesNotMatch(
    (await page.locator('.career-board-row').allTextContents()).join(' '),
    /3 saved studies/
  );
  await page.screenshot({ path: path.join(output, 'career-board-phone.png') });
  await page.locator('#leaderboardCloseBtn').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#globeSelectorBackBtn').click();
  await page.locator('#playerEntryScreen [data-entry=progress]').click();
  await page.waitForFunction(
    () => document.querySelector('#playerJourney')?.getAttribute('aria-busy') === 'false'
  );
  await page.locator('[data-journey=sync]').click();
  assert.equal(await page.locator('[data-sync-action=retry]').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'guest-account-phone.png') });
  assert.equal(
    (await page.evaluate(() => __finalJourneyCtx.discoveryProfileStore.exportData())).events.length,
    backup.events.length
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  process.exitCode = 1;
} finally {
  await qa.close();
}
