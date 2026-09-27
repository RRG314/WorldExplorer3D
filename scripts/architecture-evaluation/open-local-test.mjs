import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { configureStagingAppCheck } from '../verification/staging-app-check.mjs';

// An owned test window keeps temporary staging credentials out of HTTP, URLs,
// build artifacts and reports. The calling credential wrapper revokes on exit.
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE, 'Run through the local staging App Check wrapper.');
const root = process.cwd();
const id = (await readFile('.local-candidates/latest', 'utf8')).trim();
assert.match(id, /^[a-zA-Z0-9._+-]+$/);
const directory = path.join(root, '.local-candidates', id);
const manifest = JSON.parse(await readFile(path.join(directory, 'build-manifest.json'), 'utf8'));
assert.equal(manifest.candidateId, id);
assert.equal(manifest.sourceDirty, false);
const port = Number(process.env.PORT || 4195);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const baseUrl = `http://127.0.0.1:${port}`;
const url = `${baseUrl}/app/?candidate=${encodeURIComponent(id)}`;
const credential = JSON.parse(await readFile(process.env.WE3D_STAGING_APP_CHECK_FILE, 'utf8'));
const remaining = Date.parse(credential.expiresAt) - Date.now() - 30000;
assert.ok(remaining > 60000, 'A fresh staging credential is required.');
let browser, expiry;
const server = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), WE3D_PREVIEW_ROOT: directory },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverFailure;
server.on('error', error => { serverFailure = error; });
server.on('exit', code => { serverFailure ||= new Error(`Local server exited (${code})`); });
// Do not stream child output into reports: an error may include provider details.
server.stderr.resume();
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (serverFailure) throw serverFailure;
    try {
      const response = await fetch(`${baseUrl}/build-manifest.json`);
      const served = await response.json();
      if (served.candidateId === id) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready && !serverFailure, 'Local candidate server did not start.');
  browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  await configureStagingAppCheck(page, baseUrl);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
  assert.equal(pageErrors.length, 0, 'Candidate raised a startup exception.');
  await mkdir('output/architecture-evaluation/local-test', { recursive: true });
  await page.screenshot({ path: 'output/architecture-evaluation/local-test/menu.png' });
  await writeFile('output/architecture-evaluation/local-test/session.json', JSON.stringify({
    candidateId: id, commit: manifest.commit, url, ready: true,
    expiresAt: credential.expiresAt, backend: 'staging', pageErrors
  }, null, 2) + '\n');
  console.log(JSON.stringify({ ready: true, url, commit: manifest.commit, expiresAt: credential.expiresAt }));
  expiry = setTimeout(() => browser.close().catch(() => {}), Math.max(0, Date.parse(credential.expiresAt) - Date.now() - 30000));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => browser.close().catch(() => {}));
  page.once('close', () => browser.close().catch(() => {}));
  await new Promise(resolve => browser.once('disconnected', resolve));
} finally {
  clearTimeout(expiry);
  await browser?.close().catch(() => {});
  if (server.exitCode === null && !server.killed) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
}
