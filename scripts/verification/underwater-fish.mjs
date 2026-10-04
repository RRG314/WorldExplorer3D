import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: servedRoot, ports: [4431, 4432, 4433] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: devices['iPhone 13'].userAgent });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
const providerDegradations = [];
page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    const endpoint = new URL(response.url()).pathname;
    if (['/api/geospatial/search', '/api/geospatial/reverse'].includes(endpoint) && [429, 502, 503, 504].includes(response.status())) {
      providerDegradations.push({endpoint, status: response.status()});
    } else localFailures.push({url: response.url(), status: response.status()});
  }
});

try {
  await configureStagingAppCheck(page,baseUrl);
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120_000 });
  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  const analytics = page.locator('#analyticsConsentDenyBtn');
  if (await analytics.isVisible()) await analytics.click();
  await page.locator('#globeCustomLat').fill('-18.2861');
  await page.locator('#globeCustomLon').fill('147.7');
  await page.locator('#globeCustomLon').press('Tab');
  await page.locator('#globeSelectorOceanBtn').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const ocean = globalThis.getOceanModeDebugState?.() || {};
    return diagnostics.environment === 'OCEAN' && diagnostics.modes?.ocean === true &&
      ocean.active === true && ocean.underwaterSchoolCount > 0 && ocean.underwaterFishCount > 0;
  }, null, { timeout: 180_000 });
  const fishPose=()=>page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.oceanMode.fishEntities.map(f=>({id:f.mesh.uuid,x:f.mesh.position.x,y:f.mesh.position.y,z:f.mesh.position.z,tail:f.tail?.rotation.y??null}));});
  const fishBefore=await fishPose();
  await page.waitForTimeout(2_000);
  const fishAfter=await fishPose();
  const animatedFish=fishAfter.filter((f,i)=>f.id===fishBefore[i]?.id&&Math.hypot(f.x-fishBefore[i].x,f.y-fishBefore[i].y,f.z-fishBefore[i].z)>.05).length;
  const underwater = await page.evaluate(() => ({
    diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || {},
    ocean: globalThis.getOceanModeDebugState?.() || {},
    visibleCanvas: (() => {
      const canvas = document.getElementById('oceanModeCanvas');
      const bounds = canvas?.getBoundingClientRect?.();
      return !!canvas && getComputedStyle(canvas).display !== 'none' && Number(bounds?.width || 0) > 300 && Number(bounds?.height || 0) > 600;
    })()
  }));
  await mkdir('output/release-evidence/current', { recursive: true });
  await page.screenshot({ path: 'output/release-evidence/current/underwater-authority-mobile.png', fullPage: true });

  await page.locator('#travelBtn').click();
  await page.waitForSelector('#travelMenu.open #fEarthMode', { timeout: 10_000 });
  await page.locator('#fEarthMode').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.environment === 'EARTH' && diagnostics.modes?.ocean !== true;
  }, null, { timeout: 120_000 });
  const recovered = await page.evaluate(() => ({
    diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || {},
    ocean: globalThis.getOceanModeDebugState?.() || {},
    oceanCanvasVisible: getComputedStyle(document.getElementById('oceanModeCanvas')).display !== 'none'
  }));

  const checks = {
    enteredOceanByNormalTouchPath: underwater.diagnostics.environment === 'OCEAN' && underwater.diagnostics.modes?.ocean === true,
    sharedFishAuthority: underwater.ocean.fishAuthorityVersion === 'water-fish-authority-v2' &&
      /^water-fish-authority-v2:/.test(underwater.ocean.fishPopulationContextId || ''),
    deterministicAuthorityBackedSchools: underwater.ocean.underwaterSchoolCount >= 1 &&
      underwater.ocean.underwaterSchoolCount <= 5 &&
      underwater.ocean.underwaterSpeciesIds.length === underwater.ocean.underwaterSchoolCount &&
      new Set(underwater.ocean.underwaterSpeciesIds).size === underwater.ocean.underwaterSpeciesIds.length,
    fishActuallySwim: animatedFish>0,
    visibleFishUseSchoolPlan: underwater.ocean.underwaterFishCount > underwater.ocean.underwaterSchoolCount,
    honestPopulationTruth: underwater.ocean.fishPopulationEvidence === 'gameplay-model-only' &&
      underwater.ocean.fishLivePresenceClaim === false,
    visibleMobileOceanCanvas: underwater.visibleCanvas === true,
    normalEarthExitRecovers: recovered.diagnostics.environment === 'EARTH' &&
      recovered.diagnostics.modes?.ocean !== true && recovered.ocean.active === false && recovered.oceanCanvasVisible === false,
    underwaterTeardownClearsFish: recovered.ocean.underwaterSchoolCount === 0 && recovered.ocean.underwaterFishCount === 0,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };
  const report = { ok: Object.values(checks).every(Boolean), contract: 'underwater-water-fish-authority-v2', checks, animatedFish, underwater, recovered, browserErrors, localFailures, providerDegradations };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Underwater fish authority journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
