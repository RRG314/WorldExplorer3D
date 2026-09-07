import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Chromium's synthetic camera exercises real getUserMedia/video/canvas/dialog
// APIs. It does not replace acceptance on a physical iPhone or Android camera.
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4490, 4491] });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await mkdir('output/verification/reality-capture-camera', { recursive: true });
try {
  await page.route('**/camera-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/styles/reality-capture.css"><body></body>' }));
  await page.goto(`http://localhost:${server.port}/camera-harness`);
  await page.evaluate(async () => {
    document.body.innerHTML = '<button id="start">Start test camera</button>';
    const { openCaptureCamera } = await import('/app/js/reality-capture/live-camera.js');
    globalThis.cameraAbort = new AbortController(); globalThis.cameraPhotos = [];
    document.querySelector('#start').onclick = () => openCaptureCamera({ kind: 'exterior', viewLabel: 'Front', signal: cameraAbort.signal,
      onPhoto: async file => { cameraPhotos.push({ size: file.size, type: file.type }); return { accepted: 1, id: 'local-test-photo', quality: { focus: 'soft' } }; },
      onRetake: async id => { if (id !== 'local-test-photo') throw Error('Wrong retake target'); cameraPhotos.pop(); } });
  });
  await page.click('#start');
  await page.locator('[data-camera-shutter]:enabled').waitFor();
  await page.click('[data-camera-shutter]');
  await page.waitForFunction(() => document.querySelector('[data-camera-status]').textContent.includes('1 photo saved'));
  assert.match(await page.locator('[data-camera-status]').textContent(), /soft or blurry/);
  assert.ok(await page.evaluate(() => cameraPhotos[0].size > 1000 && cameraPhotos[0].type === 'image/jpeg'));
  await page.check('[data-camera-ghost]');
  assert.equal(await page.locator('.capturePreviousFrame').isVisible(), true);
  assert.equal(await page.locator('dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1), true);
  await page.screenshot({ path: 'output/verification/reality-capture-camera/live-camera-phone.png' });
  await page.evaluate(() => { globalThis.testTracks = document.querySelector('video').srcObject.getTracks(); });
  await page.click('[data-camera-done]');
  assert.equal(await page.locator('dialog').count(), 0);
  assert.ok(await page.evaluate(() => testTracks.every(track => track.readyState === 'ended')));
  await page.click('#start'); await page.locator('[data-camera-shutter]:enabled').waitFor();
  await page.evaluate(() => cameraAbort.abort());
  assert.equal(await page.locator('dialog').count(), 0);
  await page.evaluate(async () => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
    const { openCaptureCamera } = await import('/app/js/reality-capture/live-camera.js');
    await openCaptureCamera({ kind: 'interior_room', viewLabel: 'Door', signal: new AbortController().signal, onPhoto: () => 0 });
  });
  assert.match(await page.locator('[data-camera-status]').textContent(), /permission was not granted/);
  assert.equal(await page.locator('[data-camera-shutter]').isDisabled(), true);
  await page.click('[data-camera-close]');
  assert.deepEqual(errors, []);
  console.log('Guided camera: real media/canvas capture, overlay, mobile fit, stop tracks, abort and denied-permission fallback passed; synthetic camera only.');
} finally { await browser.close(); await server.close(); }
