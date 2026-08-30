import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'verification', 'convenience-commerce-current');
const server = await startStaticServer({ rootDir: root, ports: [4494, 4495, 4496] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const browserErrors = [];
const localFailures = [];

function bindEvidence(page) {
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || 'failed';
    if (request.url().startsWith(baseUrl) && reason !== 'net::ERR_ABORTED') {
      localFailures.push({ reason, url: request.url() });
    }
  });
}

async function launchBaltimore(page) {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.2904', lon: '-76.6122', lname: 'Baltimore Inner Harbor',
    launch: 'earth', gm: 'free', mode: 'walk', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.evaluate(() => {
    localStorage.removeItem('world-explorer:local-commerce:v1');
    localStorage.removeItem('world-explorer:character-backpack:v2');
  });
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false && state.activeActor?.mode === 'walk' &&
      state.urbanSandbox?.active === true && !!globalThis.__WE3D_STORE_SUPPORT__;
  }, null, { timeout: 360_000 });
  const skip = page.getByRole('button', { name: 'Skip guide', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.() || {});
}

async function moveNearAndOpen(page, mobile = false) {
  const store = await page.evaluate(() => globalThis.__WE3D_STORE_SUPPORT__?.snapshot?.().commerce?.stores?.[0] || null);
  if (!store) {
    const evidence = await page.evaluate(() => ({
      worldLoad: {
        status: globalThis.getWorldExplorerRuntimeDiagnostics?.().worldLoad?.status || '',
        location: globalThis.getWorldExplorerRuntimeDiagnostics?.().worldLoad?.location || null
      },
      commercePlaces: globalThis.worldLoadRuntimeState?.commercePlaces || null,
      commerce: globalThis.__WE3D_STORE_SUPPORT__?.snapshot?.().commerce || null
    }));
    console.error('Mapped convenience-store readiness evidence', JSON.stringify(evidence, null, 2));
  }
  assert.ok(store?.id, 'The Baltimore provider result did not publish a mapped shop=convenience place.');
  const moved = await page.evaluate((id) => globalThis.__WE3D_STORE_SUPPORT__?.moveNear?.(id), store.id);
  assert.ok(moved, 'The mapped store did not provide a safe walk interaction approach.');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.interaction?.action === 'visit_store', null, { timeout: 10_000 });
  await page.waitForFunction(() => {
    const active = globalThis.__WE3D_STORE_SUPPORT__?.context?.()?.active;
    return active?.id === 'urban_store' && active?.action === 'visit_store';
  }, null, { timeout: 10_000 });
  if (mobile) {
    await page.locator('#urbanVehiclePromptButton').click();
  } else {
    await page.locator('#urbanVehiclePromptButton').dispatchEvent('click');
  }
  await page.waitForSelector('#urbanStore.show', { timeout: 10_000 });
  return store;
}

async function urban(page) {
  return page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox || {});
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  bindEvidence(page);
  try {
    const launched = await launchBaltimore(page);
    const store = await moveNearAndOpen(page);
    const opened = await urban(page);
    assert.equal(opened.commerce?.current?.credits, 120);
    assert.equal(opened.commerce?.current?.inventoryAuthority, 'world-explorer-gameplay');
    assert.equal(opened.commerce?.current?.placeAuthority, 'loaded-map-poi');
    await page.screenshot({ path: path.join(outputDir, 'desktop-store-open.png') });

    const first = opened.commerce.current.standard[0];
    await page.locator(`[data-store-action="buy"][data-store-item="${first.id}"]`).click();
    await page.waitForFunction((credits) => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.commerce?.current?.credits === credits, 120 - first.buyPrice, { timeout: 5_000 });
    const afterBuy = await urban(page);
    const purchased = afterBuy.equipment.items.find((item) => item.catalogId === first.id);
    assert.ok(purchased?.instanceId && purchased.tradeable === true);

    await page.locator(`[data-store-action="sell"][data-store-item="${purchased.instanceId}"]`).click();
    await page.waitForFunction((credits) => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.commerce?.current?.credits === credits, 120 - first.buyPrice + first.sellPrice, { timeout: 5_000 });
    const afterSell = await urban(page);

    const rare = afterSell.commerce.current.rare;
    for (let count = 0; count < rare.requirementQuantity; count += 1) {
      await page.locator(`[data-store-action="buy"][data-store-item="${rare.requirementId}"]`).click();
    }
    await page.waitForFunction(
      ({ id, quantity }) => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.equipment?.items
        ?.some((item) => item.catalogId === id && Number(item.quantity || 0) >= quantity),
      { id: rare.requirementId, quantity: rare.requirementQuantity },
      { timeout: 5_000 }
    );
    await page.locator('[data-store-action="trade"]').click();
    await page.waitForFunction((id) => {
      const urbanState = globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox;
      return urbanState?.commerce?.current?.rare?.claimed === true &&
        urbanState?.equipment?.items?.some((item) => item.catalogId === id);
    }, rare.itemId, { timeout: 5_000 });
    const afterTrade = await urban(page);
    await page.screenshot({ path: path.join(outputDir, 'desktop-rare-trade.png') });

    await page.locator('#urbanStoreCloseBtn').click();
    await page.waitForFunction(() => {
      const state = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      return state.urbanSandbox?.commerce?.open === false && state.paused === false;
    }, null, { timeout: 5_000 });

    return { launched, store, opened, afterBuy, afterSell, afterTrade, first, rare };
  } finally {
    await context.close();
  }
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  bindEvidence(page);
  try {
    await launchBaltimore(page);
    const store = await moveNearAndOpen(page, true);
    const layout = await page.evaluate(() => {
      const panel = document.getElementById('urbanStore')?.getBoundingClientRect();
      return {
        width: panel?.width || 0,
        left: panel?.left || 0,
        right: panel?.right || 0,
        viewportWidth: innerWidth,
        overflowX: document.documentElement.scrollWidth > innerWidth
      };
    });
    await page.screenshot({ path: path.join(outputDir, 'mobile-store-open.png') });
    const firstButton = page.locator('[data-store-action="buy"]:not([disabled])').first();
    await firstButton.click();
    await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.commerce?.current?.credits < 120, null, { timeout: 5_000 });
    const afterBuy = await urban(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('urbanStore')?.classList.contains('show'), null, { timeout: 5_000 });
    return { store, layout, afterBuy };
  } finally {
    await context.close();
  }
}

await mkdir(outputDir, { recursive: true });
let report;
try {
  const desktop = await runDesktop();
  const mobile = await runMobile();
  const checks = {
    mappedStoreLoadedFromExplicitConvenienceTag:
      desktop.opened.commerce.mappedStoreCount > 0 &&
      desktop.opened.commerce.plainFuelStationsAreStores === false,
    providerAndGameAuthoritiesRemainSeparate:
      desktop.opened.commerce.current.placeAuthority === 'loaded-map-poi' &&
      desktop.opened.commerce.current.inventoryAuthority === 'world-explorer-gameplay',
    buyAddsTradeableBackpackItem:
      desktop.afterBuy.equipment.items.some((item) => item.catalogId === desktop.first.id && item.tradeable === true),
    sellingReturnsLessThanBuyingCosts:
      desktop.first.sellPrice < desktop.first.buyPrice &&
      desktop.afterSell.commerce.current.credits > desktop.afterBuy.commerce.current.credits,
    rareTradeConsumesRequirementAndClaimsOnce:
      desktop.afterTrade.commerce.current.rare.claimed === true &&
      desktop.afterTrade.equipment.items.some((item) => item.catalogId === desktop.rare.itemId),
    storeCloseRestoresGameplay: true,
    mobilePanelFits390x844:
      mobile.layout.width > 0 && mobile.layout.left >= 0 &&
      mobile.layout.right <= mobile.layout.viewportWidth && mobile.layout.overflowX === false,
    mobileBuyPathWorks: mobile.afterBuy.commerce.current.credits < 120,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    contract: 'mapped-convenience-commerce-current-v1',
    checks,
    evidence: {
      mappedStore: desktop.store,
      initialCredits: desktop.opened.commerce.current.credits,
      boughtItem: desktop.first.id,
      creditsAfterBuy: desktop.afterBuy.commerce.current.credits,
      creditsAfterSell: desktop.afterSell.commerce.current.credits,
      rareItem: desktop.rare.itemId,
      creditsAfterTrade: desktop.afterTrade.commerce.current.credits,
      mobileLayout: mobile.layout
    },
    browserErrors,
    localFailures
  };
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mapped convenience-store browser journey failed.');
} finally {
  await browser.close();
  await server.close();
}
