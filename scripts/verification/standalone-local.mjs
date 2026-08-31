import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.WE3D_STANDALONE_VERIFY_PORT || 4272);
const origin = `http://127.0.0.1:${port}`;
const normalOrigin = `http://127.0.0.1:${port + 1}`;
const outputDir = path.join(repoRoot, 'output', 'standalone-verification');
const forbiddenFirebaseHosts = [
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'google-analytics.com',
  'googletagmanager.com',
  'www.gstatic.com/firebasejs/'
];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/standalone/status`);
      if (response.ok) return response;
    } catch (_) {
      // The child process may still be binding its socket.
    }
    await wait(100);
  }
  throw new Error('Standalone server did not become ready.');
}

async function waitForUrl(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (_) {
      // The child process may still be binding its socket.
    }
    await wait(100);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

const server = spawn(process.execPath, [
  'scripts/serve-local-preview.mjs',
  '--standalone',
  '--port',
  String(port)
], {
  cwd: repoRoot,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe']
});

let browser;
let normalServer;
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

try {
  const statusResponse = await waitForServer();
  assert.equal(statusResponse.headers.get('x-worldexplorer-mode'), 'standalone');
  assert.deepEqual(await statusResponse.json(), {
    mode: 'standalone',
    firebaseEnabled: false,
    cloudFeatures: false,
    geospatialProxy: true
  });

  const configResponse = await fetch(`${origin}/js/firebase-project-config.js`);
  const configText = await configResponse.text();
  assert.match(configText, /WORLD_EXPLORER_STANDALONE/);
  assert.match(configText, /firebaseEnabled:\s*false/);
  assert.doesNotMatch(configText, /measurementId|projectId|apiKey/);

  const initResponse = await fetch(`${origin}/js/firebase-init.js?v=55`);
  const initText = await initResponse.text();
  assert.match(initText, /Firebase services are disabled/);
  assert.doesNotMatch(initText, /initializeApp|connectFirestoreEmulator/);

  normalServer = spawn(process.execPath, [
    'scripts/serve-local-preview.mjs',
    '--port',
    String(port + 1)
  ], { cwd: repoRoot, env: { ...process.env }, stdio: 'ignore' });
  const normalConfigResponse = await waitForUrl(`${normalOrigin}/js/firebase-project-config.js`);
  const sourceConfig = await fs.readFile(path.join(repoRoot, 'js', 'firebase-project-config.js'), 'utf8');
  assert.equal(await normalConfigResponse.text(), sourceConfig);
  assert.equal(normalConfigResponse.headers.get('x-worldexplorer-mode'), null);

  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('worldExplorer3D.analyticsConsent.v1', 'denied');
  });
  const page = await context.newPage();
  const firebaseRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  page.on('request', (request) => {
    const url = request.url();
    if (forbiddenFirebaseHosts.some((host) => url.includes(host))) firebaseRequests.push(url);
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'request failed' });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await fs.mkdir(outputDir, { recursive: true });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  assert.equal(await page.locator('.hero-notes a', { hasText: 'Run locally' }).count(), 0);
  const localRunLink = page.locator('.footer-project-links a', { hasText: 'Run locally' });
  await localRunLink.waitFor({ state: 'visible' });
  assert.equal(
    await localRunLink.getAttribute('href'),
    'https://github.com/RRG314/WorldExplorer3D/blob/steven/local-standalone-5.1.0/docs/LOCAL_STANDALONE.md'
  );
  assert.equal(await localRunLink.getAttribute('target'), '_blank');
  await localRunLink.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, 'standalone-landing-link.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await localRunLink.scrollIntoViewIfNeeded();
  const mobileLinkBox = await localRunLink.boundingBox();
  assert.ok(mobileLinkBox, 'Run locally link is not visible at 390×844.');
  assert.ok(mobileLinkBox.x >= 0 && mobileLinkBox.x + mobileLinkBox.width <= 390, 'Run locally link overflows the mobile viewport.');
  await page.screenshot({ path: path.join(outputDir, 'standalone-landing-link-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => document.documentElement.dataset.runtimeMode === 'standalone');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const titleButton = document.getElementById('startBtn');
    const globeButton = document.getElementById('globeSelectorStartBtn');
    return (titleButton && !titleButton.disabled) || (globeButton && !globeButton.disabled);
  }, null, { timeout: 120_000 });

  const runtime = await page.evaluate(async () => {
    const config = await import('/js/firebase-init.js?v=55');
    return {
      standalone: globalThis.WORLD_EXPLORER_STANDALONE,
      hasFirebaseConfig: config.hasFirebaseConfig(),
      firebaseServices: config.initFirebase()
    };
  });
  assert.equal(runtime.standalone?.enabled, true);
  assert.equal(runtime.hasFirebaseConfig, false);
  assert.equal(runtime.firebaseServices, null);

  const startControl = await page.evaluate(() => {
    const controls = [
      document.getElementById('globeSelectorStartBtn'),
      document.getElementById('startBtn')
    ].filter(Boolean);
    const control = controls.find((candidate) => {
      const style = getComputedStyle(candidate);
      return !candidate.disabled && style.display !== 'none' && style.visibility !== 'hidden';
    }) || controls.find((candidate) => !candidate.disabled);
    control?.click();
    return control?.id || null;
  });
  assert.ok(startControl, 'No enabled Explore control was available.');
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== 'function') return false;
    return JSON.parse(window.render_game_to_text()).worldLoading === true;
  }, null, { timeout: 30_000 });
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== 'function') return false;
    const state = JSON.parse(window.render_game_to_text());
    return state.gameStarted === true && state.titleVisible === false && state.worldLoading === false;
  }, null, {
    timeout: 120_000
  });
  await page.waitForTimeout(1_000);

  const gameStateText = await page.evaluate(() => window.render_game_to_text());
  const gameState = JSON.parse(gameStateText);
  assert.equal(gameState.gameStarted, true);
  assert.equal(gameState.titleVisible, false);
  assert.equal(gameState.worldLoading, false);
  assert.ok(gameState.environment, 'The playable world did not report an environment.');
  const localRequestFailures = failedRequests.filter((failure) => failure.url.startsWith(origin));
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.startsWith('Failed to load resource:'));
  assert.equal(firebaseRequests.length, 0, `Unexpected Firebase requests:\n${firebaseRequests.join('\n')}`);
  assert.equal(localRequestFailures.length, 0, `Local request failures:\n${JSON.stringify(localRequestFailures, null, 2)}`);
  assert.equal(pageErrors.length, 0, `Page errors:\n${pageErrors.join('\n')}`);
  assert.equal(unexpectedConsoleErrors.length, 0, `Console errors:\n${unexpectedConsoleErrors.join('\n')}`);

  await page.screenshot({ path: path.join(outputDir, 'standalone-gameplay.png'), fullPage: false });
  await fs.writeFile(
    path.join(outputDir, 'standalone-game-state.json'),
    `${JSON.stringify(gameState, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(outputDir, 'standalone-network-diagnostics.json'),
    `${JSON.stringify({ failedRequests, consoleErrors }, null, 2)}\n`
  );

  console.log('PASS standalone server identity and Firebase isolation');
  console.log('PASS ordinary preview keeps its existing Firebase bootstrap');
  console.log('PASS landing page exposes the standalone branch');
  console.log('PASS standalone game reached a playable world');
  console.log('PASS no Firebase or Google Analytics request left the browser');
  if (failedRequests.length) console.log(`NOTE ${failedRequests.length} external provider request(s) used the game fallback path`);
  console.log(`Screenshot: ${path.join(outputDir, 'standalone-gameplay.png')}`);
} catch (error) {
  if (serverOutput.trim()) process.stderr.write(`\nStandalone server output:\n${serverOutput}`);
  throw error;
} finally {
  await browser?.close().catch(() => {});
  normalServer?.kill('SIGTERM');
  server.kill('SIGTERM');
}
