import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = String(process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4192').replace(/\/$/, '');
const outputDir = path.resolve('output/verification/world-economy-earth');
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const failures = [];

async function run() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.stack || error}`));
  page.on('requestfailed', (request) => { if (request.url().startsWith(baseUrl)) failures.push(`request failed: ${request.url()}`); });
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
      const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
      return state.gameStarted && !state.worldLoading && state.urbanSandbox?.active;
    }, null, { timeout: 120_000 });
    const places = await page.evaluate(async () => {
      const [{ ctx }, commerce] = await Promise.all([
        import('/app/js/shared-context.js?v=55'),
        import('/app/js/urban-sandbox/commerce-model.js?v=3')
      ]);
      const published = new Map((ctx.urbanSandboxRuntimeSnapshot?.().commerce?.stores || []).map((store) => [store.id, store]));
      return commerce.mappedCommercePlaces(ctx.pois).map((place) => ({
        id: place.id, name: place.name, kind: place.kind, mappedType: place.mappedType,
        x: place.x, z: place.z,
        interactionX: published.get(place.id)?.interactionX ?? place.x,
        interactionZ: published.get(place.id)?.interactionZ ?? place.z
      }));
    });
    assert.ok(places.length > 0, 'The loaded Earth world did not publish an eligible mapped business.');
    const preferred = places.find((place) => place.kind === 'hardware' || place.kind === 'mechanic') || places[0];
    const openedStoreId = await page.evaluate(async (orderedPlaces) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      ctx.setTravelMode?.('walk', { source: 'world-economy-verification', emitTutorial: false });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (const place of orderedPlaces) {
        if (!globalThis.__WE3D_STORE_SUPPORT__?.moveNear(place.id)) continue;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const candidate = ctx.resolvePrimaryContextInteraction?.();
        if (candidate?.action !== 'visit_store' || candidate?.data?.storeId !== place.id) continue;
        if (await ctx.handlePrimaryContextInteraction?.() === true) return place.id;
      }
      return '';
    }, [preferred, ...places.filter((place) => place.id !== preferred.id)]);
    assert.ok(openedStoreId, 'No mapped business produced a player store interaction from its safe published approach.');
    const target = places.find((place) => place.id === openedStoreId);
    await page.locator('#urbanStore.show').waitFor({ state: 'visible' });
    const ui = await page.evaluate(() => ({
      name: document.getElementById('urbanStoreName')?.textContent || '',
      source: document.getElementById('urbanStoreSource')?.textContent || '',
      credits: document.getElementById('urbanStoreCredits')?.textContent || '',
      buyCount: document.querySelectorAll('#urbanStoreStock [data-store-action="buy"]').length
    }));
    assert.equal(ui.name, target.name);
    assert.match(ui.source, /game stock/i);
    assert.match(ui.source, /OpenStreetMap/i);
    assert.ok(ui.buyCount > 0);
    await page.screenshot({ path: path.join(outputDir, 'mapped-business-open.png'), fullPage: true });
    const beforeCredits = Number(ui.credits.match(/\d+/)?.[0] || 0);
    const buy = page.locator('#urbanStoreStock [data-store-action="buy"]:not([disabled])').first();
    const itemLabel = String(await buy.locator('xpath=..').locator('strong').textContent());
    await buy.click();
    const after = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        credits: Number((document.getElementById('urbanStoreCredits')?.textContent || '').match(/\d+/)?.[0] || 0),
        backpackLabels: ctx.playerBackpackInventory.snapshot().items.map((item) => item.label)
      };
    });
    assert.ok(after.credits < beforeCredits, JSON.stringify({ beforeCredits, after }));
    assert.ok(after.backpackLabels.includes(itemLabel), JSON.stringify({ itemLabel, after }));
    return { placeCount: places.length, kinds: [...new Set(places.map((place) => place.kind))], target, ui, itemLabel, afterCredits: after.credits };
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
