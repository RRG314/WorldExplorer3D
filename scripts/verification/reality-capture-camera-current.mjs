import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Chromium's synthetic camera exercises real getUserMedia/video/canvas/dialog
// APIs. It does not replace acceptance on a physical iPhone or Android camera.
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4490, 4491] });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: devices['iPhone 13'].userAgent, hasTouch: true });
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
  await page.evaluate(async () => {
    const { setupEngineInputHandlers } = await import('/app/js/engine/input-handlers.js');
    globalThis.inputProbe = { captureFocused: true, keys: {}, gameStarted: true, calls: 0,
      hasPauseReason(reason) { return reason === 'reality_capture' && this.captureFocused; }, onKey() { this.calls++; } };
    globalThis.inputProbeScope = setupEngineInputHandlers(inputProbe);
    document.body.tabIndex = -1; document.body.focus();
  });
  await page.keyboard.press('w');
  assert.equal(await page.evaluate(() => inputProbe.calls), 0);
  await page.evaluate(() => { inputProbe.captureFocused = false; });
  await page.keyboard.press('w');
  assert.equal(await page.evaluate(() => inputProbe.calls), 1);
  await page.evaluate(async () => {
    inputProbeScope.dispose();
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { updateControlInput } = await import('/app/js/controls/action-input.js');
    let focused = true, calls = 0;
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    ctx.hasPauseReason = reason => reason === 'reality_capture' && focused;
    ctx.handlePrimaryContextInteraction = () => { calls++; return true; };
    pad.buttons[2].value = 1; updateControlInput();
    if (calls) throw Error('Gamepad action leaked behind capture');
    focused = false; updateControlInput();
    if (calls) throw Error('Held gamepad action fired after closing capture');
    pad.buttons[2].value = 0; updateControlInput();
    pad.buttons[2].value = 1; updateControlInput();
    if (calls !== 1) throw Error('Gamepad did not resume after release and press');
  });
  assert.deepEqual(errors, []);
  console.log('Guided camera: media/canvas, overlay, mobile fit, track cleanup, permission fallback and keyboard/gamepad isolation passed; synthetic camera/gamepad only.');
} finally { await browser.close(); await server.close(); }
