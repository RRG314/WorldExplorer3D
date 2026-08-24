import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const verifyRoot = process.env.WE3D_VERIFY_ROOT || process.cwd();
const externalBaseUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalBaseUrl
  ? null
  : await startStaticServer({ rootDir: verifyRoot, ports: [4415, 4416, 4417] });
const baseUrl = externalBaseUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ url: response.url(), status: response.status() });
  }
});

try {
  await mkdir('output/verification/retention-ui', { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });

  const consentBanner = page.locator('#analyticsConsentBanner');
  assert.equal(await consentBanner.isVisible(), true, 'Analytics choice must be visible before play.');
  await page.locator('#analyticsConsentDenyBtn').click();
  assert.equal(await consentBanner.isVisible(), false, 'Essential-only choice must dismiss the banner.');

  const legalStrip = page.locator('.globe-legal-strip');
  assert.equal(await legalStrip.isVisible(), true, 'The active globe hub must expose legal and attribution controls.');
  assert.match(await legalStrip.textContent(), /OpenStreetMap contributors/);
  await legalStrip.locator('[data-open-data-licenses]').click();
  await page.waitForFunction(() => document.getElementById('dataLicensesDialog')?.open === true);
  assert.match(await page.locator('#dataLicensesDialog').textContent(), /Data, licenses & credits/i);
  await page.locator('#dataLicensesCloseBtn').click();

  await page.evaluate(() => {
    localStorage.setItem('worldExplorer3D.flowerChallenge.localLeaderboard.v1', JSON.stringify([{
      id: 'verification-device-result',
      challenge: 'flower',
      player: 'Release Check',
      timeMs: 12_345,
      paintedPct: null,
      paintedBuildings: 0,
      totalBuildings: 0,
      location: 'Device Test',
      lat: 39.2904,
      lon: -76.6122,
      mode: 'walking',
      foundAt: new Date().toISOString()
    }]));
  });

  await page.locator('[data-globe-destination="games"]').click();
  await page.waitForSelector('#globeHubOverlay:not([hidden])');
  await page.locator('#flowerChallengeToggleBtn').click();
  await page.waitForSelector('#flowerChallengePanel.open');
  await page.waitForFunction(() => !/Loading/i.test(document.getElementById('flowerChallengeStatus')?.textContent || ''), null, { timeout: 30_000 });
  assert.equal(await page.locator('.flowerLeaderboardSource', { hasText: 'This device' }).count() > 0, true, 'Device results must remain visible beside cloud results.');

  const boardChecks = [];
  for (const [id, label] of [
    ['leaderboardTabFlower', 'Flower Sprint'],
    ['leaderboardTabPaintTown', 'Paint Town'],
    ['leaderboardTabFishing', 'Fishing'],
    ['leaderboardTabExplorer', 'Explorer League'],
    ['leaderboardTabDeFlock', 'DeFlock Hunt']
  ]) {
    await page.locator(`#${id}`).click();
    await page.waitForFunction(() => !/Loading/i.test(document.getElementById('flowerChallengeStatus')?.textContent || ''), null, { timeout: 30_000 });
    const heading = await page.locator('#gameLeaderboardBadge').textContent();
    const scope = await page.locator('#gameLeaderboardScope').textContent();
    boardChecks.push({ id, heading, scope });
    assert.equal(heading?.trim(), label);
    assert.match(scope || '', /Global.*All time/i);
  }

  await page.locator('#flowerChallengeToggleBtn').click();
  await page.locator('[data-globe-destination="multiplayer"]').click();
  await page.waitForSelector('#tab-multiplayer.active');
  await page.waitForFunction(() => !/Loading public Explorer League/i.test(document.getElementById('mpLeaderboardList')?.textContent || ''), null, { timeout: 30_000 });
  const signedOutExplorerText = (await page.locator('#mpLeaderboardList').textContent())?.replace(/\s+/g, ' ').trim() || '';
  assert.ok(signedOutExplorerText.length > 0, 'Signed-out Explorer League must resolve to results or a useful empty state.');

  await page.screenshot({ path: 'output/verification/retention-ui/globe-legal-and-retention.png', fullPage: true });
  const report = {
    ok: browserErrors.length === 0 && localFailures.length === 0,
    contract: 'visible-attribution-consent-and-shared-leaderboards',
    consent: await page.evaluate(() => localStorage.getItem('worldExplorer3D.analyticsConsent.v1')),
    boardChecks,
    signedOutExplorerText,
    browserErrors,
    localFailures
  };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
