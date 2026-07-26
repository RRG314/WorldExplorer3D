import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const artifactDir = path.join(rootDir, 'dist');
const MIB = 1024 * 1024;
const budgets = Object.freeze({
  artifactBytes: 64 * MIB,
  generalFileBytes: 4 * MIB,
  titleRawBytes: Math.round(8.5 * MIB),
  titleRequests: 410
});
const onDemandFileBudgets = Object.freeze({
  'app/assets/models/mars-exploration-rover.glb': 12 * MIB
});
const forbiddenTitleRequests = new Set([
  '/app/assets/models/mars-exploration-rover.glb',
  '/app/assets/textures/mars_viking_4096.jpg',
  '/app/assets/textures/moon_lroc_2048.jpg',
  '/app/assets/textures/universe/andromeda-galex-spitzer.jpg',
  '/app/assets/textures/universe/orion-nebula-nasa.jpg',
  '/app/vendor/colyseus-sdk.js',
  '/app/vendor/firebase-12.16.0/firebase-firestore.js',
  '/app/vendor/three-r128/shaders/CopyShader.js',
  '/app/vendor/three-r128/shaders/LuminosityHighPassShader.js',
  '/app/vendor/three-r128/shaders/SSAOShader.js',
  '/app/vendor/three-r128/shaders/DepthLimitedBlurShader.js',
  '/app/vendor/three-r128/shaders/SMAAShader.js',
  '/app/vendor/three-r128/math/SimplexNoise.js',
  '/app/vendor/three-r128/postprocessing/EffectComposer.js',
  '/app/vendor/three-r128/postprocessing/RenderPass.js',
  '/app/vendor/three-r128/postprocessing/ShaderPass.js',
  '/app/vendor/three-r128/postprocessing/SSAOPass.js',
  '/app/vendor/three-r128/postprocessing/SMAAPass.js',
  '/app/vendor/three-r128/postprocessing/UnrealBloomPass.js'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listFiles(directory, base = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = base ? path.join(base, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative.split(path.sep).join('/'));
  }
  return files;
}

const artifactFiles = await listFiles(artifactDir);
const fileRows = await Promise.all(artifactFiles.map(async (relative) => ({
  relative,
  bytes: (await fs.stat(path.join(artifactDir, relative))).size
})));
const artifactBytes = fileRows.reduce((total, row) => total + row.bytes, 0);
assert(
  artifactBytes <= budgets.artifactBytes,
  `Hosting artifact is ${(artifactBytes / MIB).toFixed(2)} MiB; budget is ${budgets.artifactBytes / MIB} MiB.`
);
for (const row of fileRows) {
  const limit = onDemandFileBudgets[row.relative] || budgets.generalFileBytes;
  assert(
    row.bytes <= limit,
    `${row.relative} is ${(row.bytes / MIB).toFixed(2)} MiB; budget is ${(limit / MIB).toFixed(2)} MiB.`
  );
}

const server = await startServer({
  rootDir: artifactDir,
  host: '127.0.0.1',
  candidatePorts: [4191, 4192, 4193]
});
const browser = await chromium.launch({ headless: true });
const responseTasks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname !== '127.0.0.1' || !response.ok()) return;
    responseTasks.push((async () => {
      try {
        return {
          path: url.pathname,
          bytes: (await response.body()).length,
          type: response.request().resourceType()
        };
      } catch {
        return null;
      }
    })());
  });
  await page.goto(`http://127.0.0.1:${server.port}/app/?hosting-size-budget=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 90000 });
  await page.waitForTimeout(2500);

  const responses = (await Promise.all(responseTasks)).filter(Boolean);
  const uniqueResponses = [...new Map(responses.map((row) => [row.path, row])).values()];
  const titleRawBytes = uniqueResponses.reduce((total, row) => total + row.bytes, 0);
  const requestedPaths = new Set(uniqueResponses.map((row) => row.path));
  assert(
    titleRawBytes <= budgets.titleRawBytes,
    `Cold title route is ${(titleRawBytes / MIB).toFixed(2)} MiB raw; budget is ${(budgets.titleRawBytes / MIB).toFixed(2)} MiB.`
  );
  assert(
    uniqueResponses.length <= budgets.titleRequests,
    `Cold title route made ${uniqueResponses.length} hosted requests; budget is ${budgets.titleRequests}.`
  );
  for (const forbidden of forbiddenTitleRequests) {
    assert(!requestedPaths.has(forbidden), `Cold title route eagerly requested destination-only asset ${forbidden}.`);
  }

  await page.evaluate(() => {
    globalThis.dispatchEvent(new CustomEvent('we3d:game-started'));
  });
  await page.waitForFunction(
    () => typeof globalThis.THREE?.EffectComposer === 'function' &&
      typeof globalThis.THREE?.SSAOPass === 'function',
    { timeout: 30000 }
  );

  const byType = {};
  for (const row of uniqueResponses) byType[row.type] = (byType[row.type] || 0) + row.bytes;
  console.log(JSON.stringify({
    ok: true,
    budgets,
    artifact: {
      bytes: artifactBytes,
      files: fileRows.length,
      largest: fileRows.sort((a, b) => b.bytes - a.bytes).slice(0, 8)
    },
    coldTitle: {
      bytes: titleRawBytes,
      byType,
      requests: uniqueResponses.length,
      largest: uniqueResponses.sort((a, b) => b.bytes - a.bytes).slice(0, 8)
    }
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
