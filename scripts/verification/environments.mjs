import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({
  rootDir: servedRoot,
  ports: [4370, 4371, 4372, 4373]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const reportPath = path.join(root, 'output', 'verification', 'environments', 'report.json');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

const destinations = Object.freeze([
  Object.freeze({ id: 'moon', selector: '#globeSelectorMoonBtn', environment: 'MOON', flag: 'onMoon' }),
  Object.freeze({ id: 'mars', selector: '#globeSelectorMarsBtn', environment: 'MARS', flag: 'onMars' }),
  Object.freeze({ id: 'space', selector: '#globeSelectorSpaceBtn', environment: 'SPACE_FLIGHT', mode: 'space' }),
  Object.freeze({ id: 'ocean', selector: '#globeSelectorOceanBtn', environment: 'OCEAN', mode: 'ocean' })
]);

async function verifyDestination(destination) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const browserErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ kind: 'response', url: response.url(), status: response.status() });
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) {
      localFailures.push({ kind: 'request', url: request.url(), reason: request.failure()?.errorText || 'failed' });
    }
  });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120000 });
    await page.locator('#landingPrimaryCta').click();
    await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
    await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60000 });
    await page.locator(destination.selector).click();
    await page.waitForFunction((expected) => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      if (diagnostics.environment !== expected.environment || diagnostics.gameStarted !== true || diagnostics.titleVisible === true) return false;
      if (expected.flag && diagnostics.planetary?.[expected.flag] !== true) return false;
      if (expected.mode && diagnostics.modes?.[expected.mode] !== true) return false;
      return true;
    }, destination, { timeout: 180000 });
    await page.waitForTimeout(3500);

    const snapshot = await page.evaluate(() => {
      const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
      const visiblePrimaryCanvases = [...document.querySelectorAll('canvas')].filter((canvas) => {
        const bounds = canvas.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width >= 600 && bounds.height >= 400;
      }).length;
      return {
        environment: diagnostics.environment,
        gameStarted: diagnostics.gameStarted === true,
        titleVisible: diagnostics.titleVisible === true,
        modes: diagnostics.modes || {},
        planetary: diagnostics.planetary || {},
        runtimeErrors: diagnostics.runtimeErrors || [],
        visiblePrimaryCanvases
      };
    });

    const exclusiveAuxiliaryOwners = ['space', 'ocean'].filter((mode) => snapshot.modes?.[mode] === true);
    const checks = {
      correctEnvironment: snapshot.environment === destination.environment,
      enteredPlayableRuntime: snapshot.gameStarted && !snapshot.titleVisible,
      destinationFlag: destination.flag ? snapshot.planetary?.[destination.flag] === true : true,
      destinationMode: destination.mode ? snapshot.modes?.[destination.mode] === true : true,
      oneAuxiliaryRendererOwner: destination.mode
        ? exclusiveAuxiliaryOwners.length === 1 && exclusiveAuxiliaryOwners[0] === destination.mode
        : exclusiveAuxiliaryOwners.length === 0,
      visiblePrimaryRenderer: snapshot.visiblePrimaryCanvases === 1,
      noRuntimeErrors: snapshot.runtimeErrors.length === 0,
      noBrowserErrors: browserErrors.length === 0,
      noFailedLocalResources: localFailures.length === 0
    };
    assert.ok(Object.values(checks).every(Boolean), `${destination.id} destination verification failed`);
    return { id: destination.id, ok: true, checks, snapshot, browserErrors, localFailures };
  } finally {
    await context.close();
  }
}

const results = [];
try {
  for (const destination of destinations) results.push(await verifyDestination(destination));
  const report = {
    ok: results.every((result) => result.ok),
    contract: 'assembled-destination-environment-ownership',
    generatedAt: new Date().toISOString(),
    destinations: results
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close().catch(() => {});
  await server?.close().catch(() => {});
}
