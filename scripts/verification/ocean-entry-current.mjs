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
 const guard = await page.evaluate(async () => {
   const { ctx } = await import('/app/js/shared-context.js?v=55');
   const before = ctx.oceanMode.launchSite;
   const result = await ctx.startOceanMode({ launchSite: { lat: 39.2898, lon: -76.6122 } });
   return { rejected: result === false, retained: ctx.oceanMode.launchSite === before && ctx.oceanMode.active };
 });
 assert.deepEqual(guard, { rejected: true, retained: true });
 report.cases.push({ id: 'runtime-rejects-unchecked-site-preserving-session', passed: true });
 assert.deepEqual(report.errors, []);
 report.passed = true;
} finally {
 await fs.writeFile(`${dir}/entry-browser.json`, JSON.stringify(report, null, 2));
 await browser.close(); await server.close();
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, errors: report.errors }));
