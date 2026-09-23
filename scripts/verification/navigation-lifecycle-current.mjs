import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';

// Isolated real WebGL resource lifetime, not an Earth journey or FPS claim.
const output = 'output/verification/navigation-lifecycle';
await mkdir(output, { recursive: true });
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4496, 4497] });
let browser;
const errors = [];
let report = { ok: false, scope: 'source navigation GPU resource lifetime' };
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
  collectBrowserGraphicsErrors(page, errors);
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/navigation-fixture', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><title>Navigation lifecycle</title><link rel="icon" href="/favicon.svg"><style>body{margin:0}</style><div id="navigationHud" hidden></div><script src="/node_modules/three/build/three.min.js"></script>' }));
  await page.goto(`http://127.0.0.1:${server.port}/navigation-fixture`);
  const state = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { createNavigationRoute, clearNavigation } = await import('/app/js/game/navigation-ui.js?v=2');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(480, 320); document.body.append(renderer.domElement);
    ctx.scene = new THREE.Scene(); ctx.scene.background = new THREE.Color(0x10202b);
    ctx.car = { x: 0, z: 0 }; ctx.showNavigation = true;
    const camera = new THREE.PerspectiveCamera(50, 1.5, .1, 300);
    camera.position.set(60, 70, 80); camera.lookAt(20, 0, 20);
    const samples = [];
    for (let index = 0; index < 20; index++) {
      createNavigationRoute(0, 0, 30 + index, 35 + index, true);
      renderer.render(ctx.scene, camera);
      samples.push({ ...renderer.info.memory });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const beforeClear = ctx.scene.children.length;
    clearNavigation(); renderer.render(ctx.scene, camera);
    const afterClear = { children: ctx.scene.children.length, ...renderer.info.memory };
    // Leave one ordinary route visible for review; cleanup is explicit afterward.
    createNavigationRoute(0, 0, 40, 45, true); renderer.render(ctx.scene, camera);
    globalThis.cleanupNavigationFixture = () => { clearNavigation(); renderer.dispose(); };
    return { samples, beforeClear, afterClear, contextLost: renderer.getContext().isContextLost() };
  });
  await page.screenshot({ path: `${output}/route.png` });
  await page.evaluate(() => globalThis.cleanupNavigationFixture());
  report = { ...report, state, errors };
  assert.ok(state.samples.every(sample => sample.geometries === 3 && sample.textures === 0));
  assert.equal(state.beforeClear, 2);
  assert.equal(state.afterClear.children, 0);
  assert.equal(state.afterClear.geometries, 0);
  assert.equal(state.contextLost, false);
  assert.deepEqual(errors, []);
  report.ok = true;
} catch (error) {
  report.error = String(error?.stack || error);
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
console.log('20 route replacements retain three GPU geometries; clearing releases all three.');
