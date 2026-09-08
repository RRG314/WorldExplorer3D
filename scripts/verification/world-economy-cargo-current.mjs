import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const verifyRoot = process.env.WE3D_VERIFY_ROOT || '';
const staticServer = verifyRoot ? await startStaticServer({ rootDir: verifyRoot, ports: [4444, 4445, 4446] }) : null;
const baseUrl = staticServer
  ? `http://127.0.0.1:${staticServer.port}`
  : String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/world-economy-cargo');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function state(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

function observePage(page) {
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`);
  });
}

async function buyEarthMaterial(context) {
  const page = await context.newPage();
  observePage(page);
  try {
    await page.goto(`${baseUrl}/app/?diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
    if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
    await page.locator('#globeLocationSearch').fill('Baltimore, Maryland');
    await page.locator('#globeLocationSearchBtn').click();
    const searchResult = page.locator('#globeLocationSearchResults [role="option"]').first();
    await searchResult.waitFor({ state: 'visible', timeout: 30_000 });
    await searchResult.click();
    await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.gameStarted && !snapshot.worldLoading && snapshot.urbanSandbox?.active;
    }, null, { timeout: 120_000 });

    const places = await page.evaluate(() => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.urbanSandbox?.commerce?.stores || [];
    });
    const materialStorePriority = new Map([['hardware', 0], ['mechanic', 1], ['pawn', 2], ['fuel', 3]]);
    const materialStores = places
      .filter((place) => materialStorePriority.has(place.kind))
      .sort((left, right) => materialStorePriority.get(left.kind) - materialStorePriority.get(right.kind));
    assert.ok(materialStores.length > 0, 'The built Earth world did not publish a mapped material seller.');
    const opened = await page.evaluate(async (orderedPlaces) => {
      for (const place of orderedPlaces) {
        if (!globalThis.__WE3D_STORE_SUPPORT__?.moveNear(place.id)) continue;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const candidate = globalThis.__WE3D_STORE_SUPPORT__?.context?.()?.active;
        if (candidate?.action !== 'visit_store' || candidate?.data?.storeId !== place.id) continue;
        if (await globalThis.__WE3D_STORE_SUPPORT__?.perform?.() === true) return place;
      }
      return null;
    }, materialStores);
    assert.ok(opened, 'No mapped material seller opened through its published player interaction.');
    await page.locator('#urbanStore.show').waitFor({ state: 'visible' });
    const openStoreState = await state(page);
    const materialCatalogId = openStoreState.urbanSandbox?.commerce?.current?.standard
      ?.find((item) => item.category === 'material')?.id || '';
    assert.ok(materialCatalogId, `Mapped material seller ${opened.name} did not publish a transferable material in today's stock.`);
    const buy = page.locator(`#urbanStoreStock [data-store-action="buy"][data-store-item="${materialCatalogId}"]`);
    await buy.waitFor({ state: 'visible' });
    const before = await state(page);
    await buy.click();
    await page.waitForFunction((catalogId) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.backpack?.items?.some((item) => item.catalogId === catalogId);
    }, materialCatalogId);
    const after = await state(page);
    const item = after.backpack.items.find((entry) => entry.catalogId === materialCatalogId);
    assert.ok(item, JSON.stringify(after.backpack));
    assert.ok(after.urbanSandbox.commerce.current.credits < before.urbanSandbox.commerce.current.credits);
    await page.screenshot({ path: path.join(outputDir, 'earth-material-purchased.png'), fullPage: true });
    return { store: opened, item, credits: after.urbanSandbox.commerce.current.credits };
  } finally {
    await page.close();
  }
}

async function loadMaterialAboard(context, purchase) {
  const page = await context.newPage();
  observePage(page);
  try {
    await page.goto(`${baseUrl}/app/?launch=space&diagnostics=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
    await page.evaluate(() => {
      document.getElementById('spaceLaunchToggle')?.click();
      document.getElementById('startBtn')?.click();
    });
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionPlan').click();
    await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    const positioned = await page.evaluate(() => globalThis.__WE3D_SHIP_INTERIOR_SUPPORT__?.moveToStation?.('cargo-status') || false);
    assert.ok(positioned, 'The built ship interior did not publish its diagnostics-only Cargo Hold position.');
    await page.waitForTimeout(250);
    await page.keyboard.press('KeyE');
    const transfer = page.locator('#shipStationPanel [data-ship-action="load-backpack-materials"]');
    await transfer.waitFor({ state: 'visible' });
    const before = await state(page);
    await page.screenshot({ path: path.join(outputDir, 'cargo-transfer-ready.png'), fullPage: true });
    await transfer.click();
    await page.waitForFunction((feedstock) => {
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return snapshot.interstellarExpedition?.resources?.feedstockKg > feedstock;
    }, before.interstellarExpedition.resources.feedstockKg);
    const after = await state(page);
    const result = {
      feedstockKg: after.interstellarExpedition.resources.feedstockKg,
      beforeFeedstockKg: before.interstellarExpedition.resources.feedstockKg,
      earthLoadedKg: after.interstellarExpedition.materialLedger?.earthLoadedKg,
      materialStillCarried: after.backpack?.items?.some((item) => item.catalogId === purchase.item.catalogId) === true,
      stationTitle: await page.locator('#shipStationTitle').textContent()
    };
    assert.equal(result.materialStillCarried, false, JSON.stringify(result));
    assert.equal(result.feedstockKg - result.beforeFeedstockKg, result.earthLoadedKg, JSON.stringify(result));
    assert.equal(result.stationTitle, 'Cargo Hold');
    await page.screenshot({ path: path.join(outputDir, 'cargo-transfer-complete.png'), fullPage: true });
    return result;
  } finally {
    await page.close();
  }
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const purchase = await buyEarthMaterial(context);
    const result = await loadMaterialAboard(context, purchase);
    return { purchase, result };
  } finally {
    await context.close();
  }
}

let result = null;
try {
  result = await run();
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser.close();
  await staticServer?.close();
}
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
