import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4524, 4525, 4526] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/aviation-mobile-current';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  hasTouch: true,
  deviceScaleFactor: 1
});
const page = await context.newPage();
const pageErrors = [];
const localFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) localFailures.push({ status: response.status(), url: response.url() });
});

async function pressAndHold(selector) {
  await page.locator(selector).dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
}

async function release(selector) {
  await page.locator(selector).dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true });
}

async function visibleRect(selector) {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height
    };
  });
}

function overlaps(a, b) {
  return a.visible && b.visible && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

try {
  const params = new URLSearchParams({
    loc: 'custom', lat: '39.1774', lon: '-76.6684', lname: 'BWI Airport',
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.aviation?.fleetCount >= 5;
  }, null, { timeout: 360_000 });

  const initial = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const aircraft = initial.aviation.vehicles.find(({ catalogId }) => catalogId === 'expedition-prop');
  assert.ok(aircraft, 'The expedition aircraft was not published on mobile.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_AVIATION_SUPPORT__?.moveNear(id), aircraft.id), true);
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().aviation?.interaction?.action === 'aircraft_options');
  await page.locator('#urbanVehiclePromptButton').click();
  await page.locator('dialog.airport-hub[open] .airport-hub__primary').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.plane === true);

  const planeActionLabel = (await page.locator('#mobileActionPrimary').textContent())?.trim();
  await pressAndHold('#mobileActionPrimary');
  await pressAndHold('#mobileMoveDown');
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.aviation?.interaction?.action === 'exit_aircraft' &&
      diagnostics.aviation.interaction.data?.canJump === true && diagnostics.aviation.interaction.data?.autoEquip === true;
  }, null, { timeout: 30_000 });
  await release('#mobileMoveDown');
  await release('#mobileActionPrimary');
  await page.screenshot({ path: `${outputDir}/bwi-mobile-flight.png`, fullPage: true });

  const flightPromptRect = await visibleRect('#urbanVehiclePrompt');
  const flightDockRect = await visibleRect('#floatMenuContainer');
  const flightControlsRect = await visibleRect('#mobileTouchControls');
  const viewport = page.viewportSize();
  await page.locator('#urbanVehiclePromptButton').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.walking === true && diagnostics.urbanSandbox?.parachute?.skydiving === true;
  });
  const deployLabel = (await page.locator('#mobileActionPrimary').textContent())?.trim();
  await pressAndHold('#mobileActionPrimary');
  await page.waitForTimeout(120);
  await release('#mobileActionPrimary');
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().urbanSandbox?.parachute?.deployed === true);
  await page.waitForFunction(() => document.getElementById('mobileActionPrimary')?.textContent?.trim() === 'Flare');
  const flareBefore = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.velocity?.y);
  await pressAndHold('#mobileActionPrimary');
  await page.waitForTimeout(500);
  await release('#mobileActionPrimary');
  const flareAfter = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.velocity?.y);
  await pressAndHold('#mobileMoveUp');
  await pressAndHold('#mobileMoveLeft');
  await page.waitForTimeout(900);
  await release('#mobileMoveLeft');
  await release('#mobileMoveUp');
  await page.screenshot({ path: `${outputDir}/bwi-mobile-canopy.png`, fullPage: true });
  const afterDeploy = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());

  const controlsInsideViewport = [flightPromptRect, flightDockRect, flightControlsRect].every((rect) =>
    !rect.visible || (rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1)
  );
  const checks = Object.freeze({
    mobileProfileDetected: flightControlsRect.visible,
    enteredThroughVisibleTouchPrompt: planeActionLabel === 'Throttle +',
    mobileManualTakeoff: afterDeploy.urbanSandbox?.parachute?.skydiving === true,
    jumpPromptDoesNotCoverBottomDock: !overlaps(flightPromptRect, flightDockRect),
    controlsFitViewport: controlsInsideViewport,
    deployActionPublished: deployLabel === 'Deploy',
    parachuteDeployed: afterDeploy.urbanSandbox?.parachute?.deployed === true,
    flareActionPublished: (await page.locator('#mobileActionPrimary').textContent())?.trim() === 'Flare',
    flareReducedDescent: Math.abs(Number(flareAfter)) < Math.abs(Number(flareBefore)),
    noRuntimeErrors: (afterDeploy.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = {
    ok: Object.values(checks).every(Boolean),
    viewport,
    checks,
    labels: { planeActionLabel, deployLabel, deployedActionLabel: (await page.locator('#mobileActionPrimary').textContent())?.trim() },
    flare: { beforeVerticalSpeed: flareBefore, afterVerticalSpeed: flareAfter },
    layout: { flightPromptRect, flightDockRect, flightControlsRect },
    pageErrors,
    localFailures,
    screenshotPaths: [`${outputDir}/bwi-mobile-flight.png`, `${outputDir}/bwi-mobile-canopy.png`]
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mobile aviation or skydiving journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
