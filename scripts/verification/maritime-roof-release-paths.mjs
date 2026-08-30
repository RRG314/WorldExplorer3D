import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4561, 4562, 4563] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/maritime-roof-release-paths';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const localFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ status: response.status(), url: response.url() });
  }
});

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.28305', lon: '-76.61270',
    lname: 'Baltimore Inner Harbor', launch: 'earth', gm: 'free',
    mode: 'walk', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading &&
      globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.()?.active === true &&
      globalThis.__WE3D_ROOF_SUPPORT__?.list?.()?.length > 0;
  }, null, { timeout: 360_000 });

  const initial = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__.snapshot());
  await fs.writeFile(`${outputDir}/initial.json`, JSON.stringify({ initial, pageErrors, localFailures }, null, 2));
  const constellation = initial.mappedVessels.find((vessel) => /USS Constellation/i.test(vessel.name));
  assert.ok(constellation, 'Baltimore did not publish the mapped USS Constellation identity.');
  assert.equal(constellation.typeId, 'sloop-of-war');
  assert.match(constellation.label, /Sloop-of-war museum ship/);
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_MARITIME_SUPPORT__.moveNearMapped(id), constellation.id), true);
  await page.waitForFunction(() => globalThis.__WE3D_MARITIME_SUPPORT__.snapshot().interaction?.action === 'inspect_mapped_vessel');
  const mappedPrompt = await page.locator('#urbanVehiclePrompt').textContent();
  assert.match(mappedPrompt, /USS Constellation/i);
  assert.match(mappedPrompt, /Sloop-of-war museum ship/i);
  await page.screenshot({ path: `${outputDir}/baltimore-constellation.png`, fullPage: true });

  const roof = await page.evaluate(() => {
    const candidate = globalThis.__WE3D_ROOF_SUPPORT__.list()[0];
    return candidate ? globalThis.__WE3D_ROOF_SUPPORT__.landOn(candidate.id) : null;
  });
  assert.ok(roof?.id, 'No stable mapped roof was available for the landing path.');
  await page.waitForFunction(() => {
    const walker = globalThis.__WE3D_ROOF_SUPPORT__.snapshot();
    return walker?.onGround === true && walker?.onBuilding === true;
  }, null, { timeout: 20_000 });
  const landed = await page.evaluate(() => globalThis.__WE3D_ROOF_SUPPORT__.snapshot());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(250);
  const walked = await page.evaluate(() => globalThis.__WE3D_ROOF_SUPPORT__.snapshot());
  const roofTravel = Math.hypot(walked.x - landed.x, walked.z - landed.z);
  assert.ok(roofTravel > 1, `The explorer did not cross the landed roof (${roofTravel.toFixed(2)} m).`);
  assert.equal(walked.onGround, true);
  assert.equal(walked.onBuilding, true);
  await page.screenshot({ path: `${outputDir}/baltimore-roof-walk.png`, fullPage: true });

  const finalDiagnostics = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const checks = {
    mappedIdentityCorrect: constellation.typeId === 'sloop-of-war' && /Sloop-of-war museum ship/.test(constellation.label),
    mappedIdentityVisible: /USS Constellation/.test(mappedPrompt || '') && /Sloop-of-war museum ship/.test(mappedPrompt || ''),
    generatedFleetSeparated: initial.vessels.every((vessel) => {
      const catalogRadius = vessel.catalogId === 'container-cargo-ship' ? 109.2 : 0;
      return catalogRadius === 0 || Math.hypot(vessel.x - constellation.x, vessel.z - constellation.z) >= catalogRadius + constellation.radius + 12;
    }),
    roofLandingHeld: landed.onGround === true && landed.onBuilding === true,
    roofWalkHeld: walked.onGround === true && walked.onBuilding === true && roofTravel > 1,
    noRuntimeErrors: (finalDiagnostics?.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = {
    ok: Object.values(checks).every(Boolean), checks, constellation,
    mappedPrompt: String(mappedPrompt || '').trim(), roof, landed, walked, roofTravel,
    runtimeErrors: finalDiagnostics?.runtimeErrors || [], pageErrors, localFailures,
    screenshots: [
      `${outputDir}/baltimore-constellation.png`,
      `${outputDir}/baltimore-roof-walk.png`
    ]
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Maritime identity or rooftop traversal release path failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
