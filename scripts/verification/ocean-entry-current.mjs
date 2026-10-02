import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4396] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'output/verification/ocean-plan';
await fs.mkdir(dir, { recursive: true });
const report = { scope: 'Mutable source, real UI and ocean renderer; controlled provider responses for entry boundary cases', cases: [], errors: [] };
try {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
 let elevation = 50, delay = 0;
 await context.route('**/reverse?**', route => route.fulfill({ json: { display_name: 'Entry check fixture', lat: '39.2898', lon: '-76.6122', address: { city: 'Entry check fixture' } } }));
 await context.route('https://api-bdc.io/**', route => route.fulfill({ json: { locality: 'Entry check fixture' } }));
 await context.route('https://wms.gebco.net/**', async route => {
   const captured = elevation, wait = delay;
   if (wait) await new Promise(r => setTimeout(r, wait));
   await route.fulfill({ status: captured === null ? 503 : 200, contentType: 'text/plain', body: captured === null ? 'unavailable' : `value_list = '${captured}'` }).catch(() => {});
 });
 const page = await context.newPage();
 page.on('pageerror', error => report.errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
 await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
 await page.waitForSelector('#globeSelectorScreen.show');
 if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
 const select = async (lat, lon) => {
   await page.locator('#globeCustomLat').fill(String(lat));
   await page.locator('#globeCustomLon').fill(String(lon));
   await page.locator('#globeCustomLon').press('Tab');
 };
 const click = () => page.locator('#globeSelectorOceanBtn').click();
 const rejected = async (id, pattern) => {
   await page.waitForFunction(pattern => new RegExp(pattern).test(document.querySelector('#globeLocationSearchStatus').textContent), pattern, { timeout: 25000 });
   assert.equal(await page.locator('#globeSelectorScreen').evaluate(el => el.classList.contains('show')), true);
   assert.equal(await page.evaluate(() => !!window.getWorldExplorerRuntimeDiagnostics?.().modes?.ocean), false);
   await page.screenshot({ path: `${dir}/${id}.png` });
   report.cases.push({ id, passed: true, message: await page.locator('#globeLocationSearchStatus').textContent() });
 };
 await select(39.2898, -76.6122); await click(); await rejected('land-blocked', 'on land|too shallow');
 elevation = null;
 await select(39.2901, -76.6124); await click(); await rejected('provider-outage-blocked', 'could not be checked');
 elevation = -80; delay = 1500;
 await select(-18.2861, 147.7); await click();
 await select(39.29, -76.61);
 await rejected('stale-selection-blocked', 'location changed');
 delay = 0; elevation = -30;
 await select(-18.2862, 147.7001); await click();
 await page.waitForFunction(() => window.getWorldExplorerRuntimeDiagnostics?.().modes?.ocean === true, null, { timeout: 90000 });
 await page.waitForTimeout(2000);
 report.before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
 await page.screenshot({ path: `${dir}/coastal-water-arrival.png` });
 await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
 report.after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
 await page.screenshot({ path: `${dir}/coastal-water-moved.png` });
 assert.notEqual(report.after.ocean.position.z, report.before.ocean.position.z);
 assert.ok(report.after.ocean.speed > 0);
 report.cases.push({ id: 'coastal-water-entry-and-controls', passed: true });
 const mapBefore = report.after.ocean.navigationMap;
 assert.ok(mapBefore.widthMeters > 0);
 assert.equal(mapBefore.headingDegrees, 180);
 await page.locator('#minimapZoomIn').click();
 await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
 const turned = await page.evaluate(() => window.getOceanModeDebugState());
 report.turned = turned;
 assert.equal(turned.navigationMap.widthMeters, mapBefore.widthMeters / 2);
 assert.ok(Math.abs(turned.navigationMap.headingDegrees - 180) > 1);
 assert.ok(Math.abs(turned.navigationMap.gameplaySeabedWorldY - turned.seabed.presentationWorldY) < 1);
 assert.match(await page.locator('#minimap').getAttribute('aria-label'), /North-up gameplay seabed/);
 await page.screenshot({ path: `${dir}/seabed-map-zoom-heading.png` });
 await page.locator('#minimap').click();
 assert.equal(await page.evaluate(() => window.getWorldExplorerRuntimeDiagnostics().paused), false);
 assert.equal(await page.locator('#largeMap').evaluate(el => el.classList.contains('show')), false);
 report.cases.push({ id: 'sampled-map-zoom-heading-depth-labels', passed: true });
 const guard = await page.evaluate(async () => {
   const { ctx } = await import('/app/js/shared-context.js?v=55');
   const before = ctx.oceanMode.launchSite;
   const result = await ctx.startOceanMode({ launchSite: { lat: 39.2898, lon: -76.6122 } });
   return { rejected: result === false, retained: ctx.oceanMode.launchSite === before && ctx.oceanMode.active };
 });
 assert.deepEqual(guard, { rejected: true, retained: true });
 report.cases.push({ id: 'runtime-rejects-unchecked-site-preserving-session', passed: true });
 // P02: a previously admitted site must remain playable when later depth
 // requests fail. This uses the real runtime and provider request path.
 elevation = null;
 const outage = await page.evaluate(async () => {
   const { ctx } = await import('/app/js/shared-context.js?v=55');
   const site = { lat: 0, lon: -140, name: 'Provider outage fixture', region: 'Pacific' };
   const started = await ctx.startOceanMode({ launchSite: site, entry: {
     ...site, source: 'gebco-elevation-sample', kind: 'modeled-ocean', elevationMeters: -80
   } });
   await ctx.oceanMode.bathymetryPromise;
   return { started, state: window.getOceanModeDebugState() };
 });
 assert.equal(outage.started, true);
 assert.equal(outage.state.seabed.bathymetry.truthType, 'unknown');
 assert.equal(outage.state.seabed.presentationMode, 'procedural-only');
 await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
 report.outageAfter = await page.evaluate(() => window.getOceanModeDebugState());
 assert.notEqual(report.outageAfter.position.z, outage.state.position.z);
 assert.ok(Number.isFinite(report.outageAfter.position.y));
 assert.equal(report.outageAfter.navigationMap.geographicDepthMeters, null);
 assert.equal(report.outageAfter.navigationMap.coverageFraction, 0);
 assert.match(await page.locator('#minimap').getAttribute('aria-label'), /Depth data unknown/);
 await page.screenshot({ path: `${dir}/outage-playable.png` });
 report.cases.push({ id: 'provider-outage-preserves-playable-procedural-fallback', passed: true });
 assert.deepEqual(report.errors, []);
 report.passed = true;
} finally {
 await fs.writeFile(`${dir}/entry-browser.json`, JSON.stringify(report, null, 2));
 await browser.close(); await server.close();
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, errors: report.errors }));
