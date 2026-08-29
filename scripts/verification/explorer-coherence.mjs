import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const evidenceDir = 'output/verification/explorer-coherence';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const browserErrors = [];
const failedLocalResources = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    failedLocalResources.push({ status: response.status(), url: response.url() });
  }
});

async function dismissSectionGuide() {
  const guide = page.locator('#discoverySectionTutorial:not([hidden])');
  if (await guide.isVisible().catch(() => false)) {
    await page.locator('#discoverySectionTutorialDoneBtn').click();
  }
}

async function openExplorer() {
  if (await page.locator('#discoveryPanel.show').isVisible().catch(() => false)) return;
  if (await page.locator('#discoveryQuickToolBtn').isVisible().catch(() => false)) {
    await page.locator('#discoveryQuickToolBtn').click();
  } else {
    await page.locator('#exploreBtn').click();
    await page.waitForSelector('#exploreMenu.open');
    await page.locator('#fWorldDiscovery').click();
  }
  await page.waitForSelector('#discoveryPanel.show');
  await dismissSectionGuide();
}

async function chooseTab(tab) {
  await page.locator(`[data-discovery-tab="${tab}"]`).click();
  await page.waitForSelector(`.discoveryPane[data-discovery-pane="${tab}"].active`);
}

async function chooseProfile() {
  await page.locator('#discoveryProfileBtn').click();
  await page.waitForSelector('.discoveryPane[data-discovery-pane="profile"].active');
}

try {
  await mkdir(evidenceDir, { recursive: true });
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted === true && diagnostics.worldLoading === false &&
      diagnostics.environment === 'EARTH' && diagnostics.worldDiscovery?.active === true &&
      diagnostics.urbanSandbox?.active === true && Number(diagnostics.worldCounts?.roads || 0) > 0;
  }, null, { timeout: 360_000 });
  await page.waitForTimeout(750);

  await openExplorer();
  await page.waitForFunction(() => /Explored/i.test(document.querySelector('#discoveryJournalList')?.textContent || ''), null, { timeout: 10_000 });
  const explorerCopy = await page.locator('#discoveryPanel').textContent();
  const progressDisclosureOpen = await page.locator('.discoveryTodayDetails').evaluate((element) => element.open);
  assert.equal(progressDisclosureOpen, false);
  assert.equal(await page.locator('#discoveryPanelTitle').textContent(), 'Today');
  assert.equal(await page.locator('[data-discovery-tab]').count(), 3);
  assert.deepEqual(await page.locator('.discoveryTabs > button').allTextContents(), ['⌖Today', '≡Journal', '▤Guide', '▣Pack']);
  assert.equal(await page.locator('#discoverySectionTutorial').isVisible(), false, 'Help must not block the Explorer when it opens.');
  assert.doesNotMatch(explorerCopy || '', /procedural encounter|deployable artifact|pipeline status|schema version|generated encounter/i);
  await page.screenshot({ path: `${evidenceDir}/desktop-explorer.png` });

  await chooseTab('journal');
  const journalCopy = await page.locator('.discoveryPane[data-discovery-pane="journal"]').textContent();
  assert.match(journalCopy || '', /Explored Baltimore/i);
  assert.match(journalCopy || '', /Travel/i);
  assert.equal(await page.locator('.discoveryJournalPlaces').evaluate((element) => element.open), false);
  await page.locator('#discoveryJournalCategory').selectOption('travel');
  assert.match(await page.locator('#discoveryJournalList').textContent(), /Explored Baltimore/i);
  await page.screenshot({ path: `${evidenceDir}/desktop-journal.png` });
  await page.locator('#discoveryJournalCategory').selectOption('all');

  await chooseTab('guide');
  await page.waitForFunction(() => /60/.test(document.querySelector('#discoveryLifeList')?.textContent || ''));
  const guideCopy = await page.locator('.discoveryPane[data-discovery-pane="guide"]').textContent();
  assert.match(guideCopy || '', /0\s*\/\s*60/);
  assert.match(guideCopy || '', /Baltimore/i);
  assert.match(guideCopy || '', /5 mammals left to identify/i);
  assert.equal(await page.locator('.discoveryGuideLifeDetails').evaluate((element) => element.open), false);
  assert.equal(await page.locator('#discoveryLifeList').isVisible(), false);
  assert.doesNotMatch(guideCopy || '', /Unknown Mammal Taxon|pilot|Creature Quality|reference fallbacks|procedural encounter|pipeline/i);
  await page.screenshot({ path: `${evidenceDir}/desktop-guide.png` });

  await chooseProfile();
  await page.waitForFunction(() => /Specialties/i.test(document.querySelector('#discoveryProgress')?.textContent || ''));
  const profileCopy = await page.locator('.discoveryPane[data-discovery-pane="profile"]').textContent();
  assert.match(profileCopy || '', /Specialties/i);
  assert.match(profileCopy || '', /Companions/i);
  assert.match(profileCopy || '', /Baltimore/i);
  assert.equal(await page.locator('#discoveryProfileBtn').getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${evidenceDir}/desktop-profile.png` });
  await page.locator('.discoveryOnlineService summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#discoveryExportBtn').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^world-explorer-journal-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(await page.locator('#discoveryBackupStatus').textContent(), /downloaded/i);

  await page.locator('[data-discovery-destination="pack"]').click();
  await page.waitForSelector('#urbanEquipment.show');
  assert.equal(await page.locator('#discoveryPanel.show').isVisible().catch(() => false), false);
  await page.locator('[data-backpack-filter="field-tool"]').click();
  const fieldLens = page.locator('#urbanBackpackContents [data-equipment-id]').filter({ hasText: 'Field Lens' });
  await fieldLens.click();
  assert.match(await page.locator('#urbanBackpackDetail').textContent(), /Field Lens.*Inspect plants.*Useful for/is);
  assert.equal(await page.locator('#urbanBackpackDetail [data-backpack-action="field"]').isVisible(), true);
  await page.locator('#urbanBackpackDetail [data-backpack-slot="6"]').click();
  await page.waitForFunction(() => /Field Lens/i.test(document.querySelector('#urbanEquipmentSlots')?.textContent || ''));
  await page.screenshot({ path: `${evidenceDir}/desktop-backpack.png` });

  await page.locator('#urbanEquipmentCloseBtn').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await openExplorer();
  await chooseTab('today');
  const mobileExplorerOverflow = await page.locator('#discoveryPanel').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileExplorerOverflow, false);
  await page.screenshot({ path: `${evidenceDir}/mobile-explorer.png` });

  await chooseTab('journal');
  const mobileJournalOverflow = await page.locator('#discoveryPanel').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileJournalOverflow, false);
  await page.screenshot({ path: `${evidenceDir}/mobile-journal.png` });

  await chooseTab('guide');
  const mobileGuideOverflow = await page.locator('#discoveryPanel').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileGuideOverflow, false);
  await page.screenshot({ path: `${evidenceDir}/mobile-guide.png` });

  await chooseProfile();
  const mobileProfileOverflow = await page.locator('#discoveryPanel').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileProfileOverflow, false);
  await page.screenshot({ path: `${evidenceDir}/mobile-profile.png` });

  await page.locator('[data-discovery-destination="pack"]').click();
  await page.waitForSelector('#urbanEquipment.show');
  const mobileBackpackOverflow = await page.locator('#urbanEquipment').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileBackpackOverflow, false);
  await page.screenshot({ path: `${evidenceDir}/mobile-backpack.png` });

  const diagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
  const report = {
    ok: browserErrors.length === 0 && failedLocalResources.length === 0,
    journey: 'fresh-current-explorer-coherence',
    checks: {
      actualBaltimoreWorld: diagnostics.gameStarted === true && diagnostics.environment === 'EARTH' && diagnostics.worldLoading === false,
      journalPlaceMemory: /Explored Baltimore/i.test(journalCopy || '') && /Travel/i.test(journalCopy || ''),
      currentRegionalGuide: /0\s*\/\s*60/.test(guideCopy || ''),
      groupedExplorerProfile: /Specialties/i.test(profileCopy || '') && /Companions/i.test(profileCopy || ''),
      journalBackup: /world-explorer-journal-/.test(download.suggestedFilename()),
      workingBackpackDetailAndSlot: true,
      fourPrimaryDestinations: true,
      desktopAndMobileNoHorizontalOverflow: true,
      noInternalExplorerCopy: !/procedural encounter|deployable artifact|pipeline status|schema version|generated encounter/i.test(`${explorerCopy} ${guideCopy}`),
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: failedLocalResources.length === 0
    },
    browserErrors,
    failedLocalResources
  };
  report.ok = report.ok && Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
} finally {
  await context.close();
  await browser.close();
}
