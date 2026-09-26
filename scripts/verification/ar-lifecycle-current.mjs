import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, devices } from 'playwright';

const baseUrl = process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4195';
const out = 'output/playwright/ar-lifecycle-current';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: devices['iPhone 13'].userAgent, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
try {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => !!globalThis.THREE && !!document.getElementById('arExperience'), null, { timeout: 30_000 });
  const checks = await page.evaluate(async () => {
    const { createArPlatform } = await import('/app/js/ar/session-service.js?v=10');
    const { runtimePublicationState } = await import('/app/js/reality-capture/runtime-contract.js?v=2');
    const ctx = { Walk: { state: { mode: 'walk', walker: { x: 0, z: 0 } } }, getEnv: () => 'EARTH' };
    const request = { type: 'specimen', record: { catalogId: 'quartz-vein-sample', name: 'Quartz sample' } };
    const checks = [];
    function check(name, condition) { if (!condition) throw Error(name); checks.push(name); }
    check('capture presentation has no staging-only unlock', runtimePublicationState({}).enabled === true);
    function deferred() { let resolve; return { promise: new Promise((r) => { resolve = r; }), resolve: (v) => resolve(v) }; }
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const stub = () => ({ dispose() {}, renderer: { xr: { setSession: async () => {} }, setAnimationLoop() {} },
      setSpatialMode() {}, update() {}, snapshot: () => ({}) });

    const media = deferred();
    let stops = 0;
    let calls = 0;
    let ar = createArPlatform(ctx, { createPresentation: stub,
      navigatorObject: { mediaDevices: { getUserMedia() { calls++; return media.promise; } } } });
    await ar.open(request);
    const starting = ar.begin();
    await tick();
    check('permission request started once', calls === 1);
    await ar.end('cancel-pending');
    media.resolve({ getTracks: () => [{ stop() { stops++; } }] });
    check('cancelled start returns false', await starting === false);
    check('late camera track stopped', stops === 1);
    check('cancelled UI stays closed', ar.snapshot().phase === 'idle' && !ctx.arSessionActive);
    ar.dispose();

    const probe = deferred();
    ar = createArPlatform(ctx, { createPresentation: stub, navigatorObject: { xr: { isSessionSupported: () => probe.promise } } });
    const opening = ar.open(request);
    await tick();
    await ar.end('cancel-probe');
    probe.resolve(false);
    check('late capability probe cannot reopen UI', (await opening).opened === false && ar.snapshot().phase === 'idle');
    ar.dispose();

    const oldMedia = deferred();
    ar = createArPlatform(ctx, { createPresentation: stub, navigatorObject: { mediaDevices: { getUserMedia: () => oldMedia.promise } } });
    await ar.open(request);
    const oldBegin = ar.begin();
    await tick();
    await ar.open({ ...request, record: { ...request.record, name: 'Replacement' } });
    oldMedia.resolve({ getTracks: () => [{ stop() { stops++; } }] });
    await oldBegin;
    check('old request cannot replace new preview', ar.snapshot().phase === 'preview' && document.getElementById('arTitle').textContent === 'Replacement');
    ar.dispose();

    let ended = 0;
    ar = createArPlatform(ctx, { createPresentation: stub, navigatorObject: { xr: {
      isSessionSupported: async () => true,
      requestSession: async () => ({ requestReferenceSpace: async () => ({}), end: async () => { ended++; } })
    } } });
    await ar.open(request);
    check('XR without surface placement is not an invisible active view', await ar.begin() === false && ar.snapshot().phase === 'error');
    check('failed spatial session ends', ended === 1 && !ctx.arSessionActive);
    check('missing hit test offers explicit 3D fallback', ar.snapshot().capability.level === 'interactive-3d');
    ar.dispose();

    // Real presentation/renderer and the actual app's UI, not a fixture screenshot.
    ar = createArPlatform(ctx, { navigatorObject: {} });
    await ar.open(request);
    window.__arLifecycle = { ar, ctx, checks };
    window.render_game_to_text = () => JSON.stringify(ar.snapshot());
    return checks;
  });
  await page.locator('#arContinueBtn').click();
  await page.waitForFunction(() => window.__arLifecycle.ar.snapshot().phase === 'active');
  await page.screenshot({ path: `${out}/phone-3d-viewer.png` });
  const before = await page.evaluate(() => window.__arLifecycle.ar.snapshot());
  assert.equal(before.cameraFramesUploaded, false);
  await page.locator('#arLargerBtn').click();
  await page.locator('#arCloseBtn').click();
  assert.equal(await page.evaluate(() => window.__arLifecycle.ar.snapshot().phase), 'idle');
  assert.equal(await page.evaluate(() => window.__arLifecycle.ctx.arSessionActive), false);
  await page.evaluate(() => window.__arLifecycle.ar.dispose());
  const report = { checks, actualViewerOpenedAndClosed: true, errors,
    limitation: 'Synthetic permission/XR race scenarios; real Three.js phone-width viewer. No physical-device or house reconstruction acceptance.' };
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
