import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const externalBaseUrl = String(process.env.TEST_BASE_URL || '').replace(/\/$/, '');
const server = externalBaseUrl ? null : await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4192, 4194, 4195, 4196]
});
const baseUrl = externalBaseUrl || `http://127.0.0.1:${server.port}`;
const outputDir = path.join(process.cwd(), 'output', 'playwright', 'loading-transition');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${baseUrl}/app/?candidate=loading-transition-browser-contract`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading', { state: 'attached' });
  const result = await page.evaluate(async () => {
    const { showLoad } = await import('/app/js/main.js?v=70');
    document.body.style.background = '#ff00ff';
    showLoad('Loading next location...', {
      background: '/assets/landing/intentionally-missing-transition-image.jpg',
      overlay: 0.22
    });
    const loading = document.getElementById('loading');
    const style = getComputedStyle(loading);
    return {
      display: style.display,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      zIndex: Number(style.zIndex)
    };
  });
  assert.equal(result.display, 'flex');
  assert.equal(result.backgroundColor, 'rgb(0, 0, 0)', 'missing or undecoded transition image must remain opaque');
  assert.match(result.backgroundImage, /intentionally-missing-transition-image/);
  assert.ok(result.zIndex >= 300, 'transition must remain above the rendered world');
  await page.screenshot({ path: path.join(outputDir, 'opaque-image-fallback.png') });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await browser.close();
  await server?.close();
}
