import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const buildManifest = JSON.parse(
  await fs.readFile(path.join(distRoot, 'build-manifest.json'), 'utf8')
);
const server = await startStaticRootServer({
  rootDir: distRoot,
  candidatePorts: [4290, 4291, 4292, 4293]
});
const baseUrl = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
const localFailures = [];
const scriptPaths = [];

page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
page.on('request', (request) => {
  if (request.resourceType() === 'script' && request.url().startsWith(baseUrl)) {
    scriptPaths.push(new URL(request.url()).pathname);
  }
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({
      path: new URL(request.url()).pathname,
      reason: request.failure()?.errorText || 'request failed'
    });
  }
});

try {
  await page.goto(`${baseUrl}/app/?hosting-artifact-browser=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, {
    timeout: 120000
  });
  await page.waitForTimeout(500);
  const state = await page.evaluate(async () => {
    const production = globalThis.__WORLD_EXPLORER_PRODUCTION__ || null;
    const catalogResponse = await fetch(production?.groundCatalogUrl || '');
    const catalog = catalogResponse.ok ? await catalogResponse.json() : null;
    return {
      production,
      runtimeReady: globalThis.__WE3D_RUNTIME_READY__ === true,
      titleVisible: JSON.parse(globalThis.render_game_to_text?.() || '{}').titleVisible,
      startButtonReady: document.getElementById('startBtn')?.getAttribute('aria-busy') === 'false',
      catalogOk: catalogResponse.ok,
      catalogSchemaVersion: Number(catalog?.schemaVersion || 0),
      catalogManifestCount: Array.isArray(catalog?.manifests) ? catalog.manifests.length : 0
    };
  });
  const unbundledGameScripts = scriptPaths.filter((requestPath) =>
    requestPath.startsWith('/app/js/') && !requestPath.startsWith('/app/js/bundles/')
  );

  assert.equal(state.runtimeReady, true);
  assert.equal(state.titleVisible, true);
  assert.equal(state.startButtonReady, true);
  assert.equal(state.catalogOk, true);
  assert.equal(state.catalogSchemaVersion, 1);
  assert.equal(state.catalogManifestCount, buildManifest.sourceReleaseManifestCount - 1);
  assert.equal(state.production?.groundReleaseId, buildManifest.groundData.releaseId);
  assert.equal(state.production?.groundCatalogUrl, buildManifest.groundData.catalogUrl);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(localFailures, []);
  assert.deepEqual(unbundledGameScripts, []);

  console.log(JSON.stringify({
    ok: true,
    contract: 'browser-loads-immutable-bundled-hosting-artifact',
    runtimeBundleFiles: buildManifest.runtimePackaging.fileCount,
    groundReleaseId: buildManifest.groundData.releaseId,
    groundManifests: state.catalogManifestCount,
    initialLocalScripts: scriptPaths.length
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
