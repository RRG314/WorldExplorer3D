import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Real markup, CSS and panel controller; no world or graphics context required.
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4498, 4499] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const directory = 'output/verification/hub-dialog-layout';
const results = [];
try {
  const html = (await fs.readFile('app/index.html', 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const { width, height, touch } of [
    { width: 390, height: 844, touch: true },
    { width: 1280, height: 800, touch: true },
    { width: 1440, height: 900, touch: false }
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.port}/404.html`);
    await page.setContent(html.replace('<head>', `<head><base href="http://127.0.0.1:${server.port}/app/">`), { waitUntil: 'load' });
    await page.evaluate(async () => {
      document.body.className = 'start-hub-open globe-selector-open';
      document.getElementById('globeSelectorScreen').classList.add('show');
      const { setupGlobeHub } = await import('./js/ui/title-screen/globe-hub.js');
      setupGlobeHub({});
      document.querySelector('[data-globe-destination="games"]').click();
      await document.fonts.ready;
    });
    const checks = [];
    for (const mode of ['free', 'painttown', 'flower']) {
      const target = page.locator(`.mode[data-mode="${mode}"]`);
      await target.evaluate(element => element.scrollIntoView({ block: 'center' }));
      checks.push(await target.evaluate(element => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { mode: element.dataset.mode, hit: hit === element || element.contains(hit), inBounds: r.top >= 0 && r.bottom <= innerHeight };
      }));
    }
    results.push({ width, height, touch, checks, errors, ok: errors.length === 0 && checks.every(check => check.hit && check.inBounds) });
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({ path: `${directory}/${width}-${touch ? 'touch' : 'mouse'}.png` });
    await context.close();
  }
  await fs.writeFile(`${directory}/report.json`, JSON.stringify({ ok: results.every(result => result.ok), evidenceScope: 'actual hub DOM/CSS/controller hit testing; no world or performance claim', results }, null, 2));
  console.log(JSON.stringify(results));
  assert.ok(results.every(result => result.ok), 'Every game choice must remain visible and reachable above the footer.');
} finally {
  await browser.close();
  await server.close();
}
