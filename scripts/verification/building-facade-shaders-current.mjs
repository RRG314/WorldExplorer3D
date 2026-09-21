import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// A small source fixture compiles the actual near and merged-mid shader paths.
// This is visual/shader evidence, not whole-world or hardware performance evidence.
const output = 'output/verification/building-facade-shaders';
await mkdir(output, { recursive: true });
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4437, 4438] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const tier of ['near', 'mid']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    try {
      await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/building-facade-layout.html${tier === 'mid' ? '?mid=1' : ''}`);
      await page.waitForFunction(() => window.ready === true, null, { timeout: 20_000 });
      await page.evaluate(() => window.advanceTime(16));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      await page.screenshot({ path: `${output}/${tier}.png` });
      results.push({ tier, state, errors });
      assert.deepEqual(errors, [], `${tier} shader or asset failure`);
      assert.equal(state.cases.length, 4);
      assert.ok(state.renderer.calls > 0);
      assert.equal(state.renderer.glError, 0);
      assert.equal(state.renderer.contextLost, false);
      assert.ok(state.renderer.attributeCounts.every(count => count <= 8), "Facade exceeds the WebGL minimum vertex attribute budget");
      assert.ok(state.textures.textures.every(texture => texture.status === 'ready'));
    } finally { await page.close(); }
  }
  for (let i=0;i<4;i++) {
    const near=results[0].state.windowSamples[i].rgba;
    const mid=results[1].state.windowSamples[i].rgba;
    assert.ok(near.slice(0,3).every((channel,k)=>Math.abs(channel-mid[k])<=12), `Window glass changes color across LOD: ${near} vs ${mid}`);
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ evidenceScope: 'source-fixture-shader-compilation', results }, null, 2));
  await browser.close();
  await server.close();
}
console.log('Near and merged-mid facade shaders compiled and rendered all four fixtures.');
