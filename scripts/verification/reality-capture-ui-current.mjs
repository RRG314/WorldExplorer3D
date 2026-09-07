import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const server = await startStaticServer({ rootDir: root, ports: [4487, 4488, 4489] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const evidenceDir = path.join(root, 'output', 'verification', 'reality-capture-ui');
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];

async function openPanel(page) {
  await page.goto(`${baseUrl}/app/?character-test=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.getElementById('startBtn')?.disabled === false, null, { timeout: 120_000 });
  await page.evaluate(async () => {
    const { openRealityCaptureForBuilding } = await import('/app/js/reality-capture/ui.js?v=1');
    await openRealityCaptureForBuilding({
      LOC: { lat: 39.2904, lon: -76.6122, name: 'Baltimore, Maryland' },
      worldToLatLon: () => ({ lat: 39.2904, lon: -76.6122 }),
      showWorldSelectionNotice: () => {}
    }, {
      id: 'osm:way:424242',
      label: 'Test mapped building',
      position: { x: 12, y: 0, z: -8 },
      object: { userData: { sourceBuildingId: 'osm:way:424242', geometrySource: 'osm' } }
    });
  });
  await page.locator('#realityCapturePanel.show').waitFor();
}

async function run(viewport, name, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const localFailures = [];
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push(`${response.status()} ${response.url()}`);
  });
  try {
    await openPanel(page);
    const panel = page.locator('#realityCapturePanel');
    assert.match(await panel.innerText(), /Capture only from places you may legally access/i);
    assert.match(await panel.innerText(), /remove EXIF and GPS metadata/i);
    assert.equal(await panel.locator('[data-capture-id]').innerText(), 'osm:way:424242');
    assert.equal(await panel.locator('[data-capture-input]').getAttribute('capture'), 'environment');
    assert.equal(await panel.locator('[data-capture-sectors] button').count(), 8);
    assert.equal(await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }), true);

    await panel.locator('[data-capture-kind="interior_room"]').click();
    await panel.locator('.realityCaptureRoom').waitFor({ state: 'visible' });
    assert.equal(await panel.locator('.realityCaptureRoom').isVisible(), true);
    assert.match(await panel.innerText(), /permission to capture and upload this interior/i);
    assert.match(await panel.innerText(), /never makes a residential interior public/i);
    assert.equal(await panel.locator('[data-capture-sectors] button').count(), 6);

    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await panel.locator('[data-capture-input]').setInputFiles({ name: 'too-small.png', mimeType: 'image/png', buffer: onePixelPng });
    await page.waitForFunction(() => /(too small|could not decode)/i.test(document.querySelector('[data-capture-status]')?.textContent || ''));
    assert.match(await panel.locator('[data-capture-status]').innerText(), /(too small|could not decode)/i);

    if (mobile) {
      const touchTargets = await panel.locator('button, .realityCaptureCamera').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      assert.ok(touchTargets.every((target) => target.width >= 44 && target.height >= 44), JSON.stringify(touchTargets));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }

    const screenshot = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    const report = {
      name,
      viewport,
      panelFits: true,
      privateInteriorCopy: true,
      environmentCameraHint: true,
      badCaptureRejected: true,
      errors,
      localFailures,
      screenshot
    };
    assert.deepEqual(errors, []);
    assert.deepEqual(localFailures, []);
    reports.push(report);
  } finally {
    await context.close();
  }
}

try {
  await run({ width: 1440, height: 900 }, 'desktop-capture-panel');
  await run({ width: 390, height: 844 }, 'mobile-capture-panel', true);
  const report = { ok: true, reports };
  await writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
