import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/world-economy-cargo');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function state(page) {
  return page.evaluate(() => JSON.parse(globalThis.render_game_to_text?.() || '{}'));
}

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
  try {
    await page.goto(`${baseUrl}/app/?launch=space`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
    if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
    await page.evaluate(() => {
      document.getElementById('spaceLaunchToggle')?.click();
      document.getElementById('startBtn')?.click();
    });
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').modes?.space === true, null, { timeout: 120_000 });
    await page.locator('#sfExpeditionBtn').click();
    await page.locator('#expeditionPlan').click();
    await page.waitForFunction(() => document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));

    const purchase = await page.evaluate(async () => {
      const [{ ctx }, equipment, commerce] = await Promise.all([
        import('/app/js/shared-context.js?v=55'),
        import('/app/js/urban-sandbox/equipment-model.js?v=9'),
        import('/app/js/urban-sandbox/commerce-model.js?v=2')
      ]);
      const inventory = equipment.ensurePlayerBackpackInventory(ctx);
      const economy = commerce.createLocalCommerceModel({ inventory, now: () => Date.parse('2026-08-31T12:00:00Z') });
      const store = { id: 'verification:hardware', name: 'Mapped Hardware', kind: 'hardware', provenance: 'loaded-map-poi' };
      const view = economy.snapshot(store);
      const item = view.standard.find((entry) => entry.id === 'reclaimed-aluminum-stock')
        || view.standard.find((entry) => entry.category === 'material');
      const bought = economy.buy(store, item.id);
      ctx.playerBackpackStore.save(inventory.exportState());
      return { bought, credits: economy.snapshot(store).credits, item: inventory.snapshot().items.find((entry) => entry.catalogId === item.id) };
    });
    assert.equal(purchase.bought.ok, true, JSON.stringify(purchase));
    assert.ok(purchase.item, JSON.stringify(purchase));

    await page.locator('#expeditionEnterShip').click();
    await page.waitForFunction(() => JSON.parse(globalThis.render_game_to_text?.() || '{}').expeditionShipInterior?.active === true);
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 0, z: 0.6, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.keyboard.press('KeyE');
    await page.locator('#shipDeckPicker [data-deck="engineering"]').click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      Object.assign(ctx.Walk.state.walker, { x: 4.3, z: 0.5, angle: 0, yaw: 0, lookYawOffset: 0, pitch: 0, vy: 0, onGround: true });
    });
    await page.waitForTimeout(250);
    await page.keyboard.press('KeyE');
    await page.locator('#shipStationPanel [data-ship-action="load-backpack-materials"]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outputDir, 'cargo-transfer-ready.png'), fullPage: true });
    const before = await state(page);
    await page.locator('#shipStationPanel [data-ship-action="load-backpack-materials"]').click();
    await page.waitForFunction((feedstock) => JSON.parse(globalThis.render_game_to_text?.() || '{}').interstellarExpedition?.resources?.feedstockKg > feedstock, before.interstellarExpedition.resources.feedstockKg);
    const result = await page.evaluate(async (catalogId) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const snapshot = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return {
        feedstockKg: snapshot.interstellarExpedition.resources.feedstockKg,
        beforeFeedstockKg: Number(snapshot.interstellarExpedition.resources.feedstockKg) - Number(snapshot.interstellarExpedition.materialLedger?.earthLoadedKg || 0),
        earthLoadedKg: snapshot.interstellarExpedition.materialLedger?.earthLoadedKg,
        materialStillCarried: ctx.playerBackpackInventory.snapshot().items.some((item) => item.catalogId === catalogId),
        stationTitle: document.getElementById('shipStationTitle')?.textContent || ''
      };
    }, purchase.item.catalogId);
    assert.equal(result.materialStillCarried, false, JSON.stringify(result));
    assert.equal(result.feedstockKg - result.beforeFeedstockKg, result.earthLoadedKg, JSON.stringify(result));
    assert.equal(result.stationTitle, 'Cargo Hold');
    await page.screenshot({ path: path.join(outputDir, 'cargo-transfer-complete.png'), fullPage: true });
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
}
const report = { ok: failures.length === 0, baseUrl, result, failures };
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
