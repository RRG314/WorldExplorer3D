import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4542, 4543, 4544] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const outputDir = 'output/verification/maritime-mobile-current';
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

async function pressAndHold(selector, pointerId) {
  await page.locator(selector).dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1 });
}

async function release(selector, pointerId) {
  await page.locator(selector).dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1 });
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
    loc: 'custom', lat: '51.948', lon: '4.14', lname: 'Port of Rotterdam',
    launch: 'earth', gm: 'free', mode: 'walking', diagnostics: '1'
  });
  await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120_000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.gameStarted && !diagnostics.worldLoading && diagnostics.maritime?.fleetCount > 0;
  }, null, { timeout: 360_000 });

  const initial = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.());
  const runabout = initial.vessels.find(({ catalogId }) => catalogId === 'marina-runabout');
  assert.ok(runabout, 'The marina runabout was not published on mobile.');
  assert.equal(await page.evaluate((id) => globalThis.__WE3D_MARITIME_SUPPORT__?.moveNear(id), runabout.id), true);
  await page.waitForFunction(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().interaction?.action === 'enter_vessel');
  const enterLabel = (await page.locator('#urbanVehiclePromptButton').textContent())?.trim();
  await page.locator('#urbanVehiclePromptButton').click();
  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.();
    return diagnostics?.modes?.boat === true && diagnostics.activeActor?.identity?.catalogId === 'marina-runabout';
  }, null, { timeout: 30_000 });

  const entered = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const enteredBoat = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().activeBoat);
  const start = entered.activeActor.position;
  await pressAndHold('#mobileMoveUp', 1);
  await page.waitForTimeout(1400);
  await pressAndHold('#mobileMoveRight', 2);
  await page.waitForTimeout(900);
  await release('#mobileMoveRight', 2);
  await page.waitForTimeout(550);
  await release('#mobileMoveUp', 1);
  await page.waitForTimeout(250);

  const underway = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const underwayBoat = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().activeBoat);
  const travel = Math.hypot(
    Number(underway.activeActor.position.x) - Number(start.x),
    Number(underway.activeActor.position.z) - Number(start.z)
  );
  const promptRect = await visibleRect('#urbanVehiclePrompt');
  const dockRect = await visibleRect('#floatMenuContainer');
  const controlsRect = await visibleRect('#mobileTouchControls');
  const boatPromptRect = await visibleRect('#boatPrompt');
  const viewport = page.viewportSize();
  await page.screenshot({ path: `${outputDir}/rotterdam-runabout-underway.png`, fullPage: true });
  console.log(JSON.stringify({ enteredBoat, underwayBoat, travel }, null, 2));

  await page.waitForFunction(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.().interaction?.action === 'exit_vessel');
  const exitLabel = (await page.locator('#urbanVehiclePromptButton').textContent())?.trim();
  await page.locator('#urbanVehiclePromptButton').click();
  await page.waitForFunction(() => globalThis.getWorldExplorerRuntimeDiagnostics?.().modes?.walking === true, null, { timeout: 30_000 });
  const exited = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
  const maritimeAfterExit = await page.evaluate(() => globalThis.__WE3D_MARITIME_SUPPORT__?.snapshot?.());
  const returned = maritimeAfterExit.vessels.find(({ id }) => id === runabout.id);

  const controlsInsideViewport = [promptRect, dockRect, controlsRect, boatPromptRect].every((rect) =>
    !rect.visible || (rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1)
  );
  const checks = Object.freeze({
    sevenClassFleetPublished: initial.fleetCount === 7 && initial.playableCount === 7,
    enteredThroughVisiblePrompt: enterLabel.toLowerCase().includes('pilot') || enterLabel.toLowerCase().includes('enter'),
    existingBoatAuthorityActive: entered.modes?.boat === true && entered.activeActor?.identity?.catalogId === 'marina-runabout',
    touchThrottleAndSteeringMovedVessel: travel > 1,
    mobileControlsPublished: controlsRect.visible && underway.mobileControls?.enabled === true,
    promptDoesNotCoverBottomDock: !overlaps(promptRect, dockRect) && !overlaps(boatPromptRect, dockRect),
    controlsFitViewport: controlsInsideViewport,
    exitedThroughVisiblePrompt: exitLabel.toLowerCase().includes('exit') && exited.modes?.walking === true,
    vesselPersistedForReentry: returned?.available === true,
    noRuntimeErrors: (exited.runtimeErrors || []).length === 0,
    noPageErrors: pageErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  });
  const report = {
    ok: Object.values(checks).every(Boolean),
    viewport,
    checks,
    labels: { enterLabel, exitLabel },
    travel,
    layout: { promptRect, dockRect, controlsRect, boatPromptRect },
    initial,
    entered: { actor: entered.activeActor, boat: enteredBoat, mobileControls: entered.mobileControls },
    underway: { actor: underway.activeActor, boat: underwayBoat, mobileControls: underway.mobileControls },
    returned,
    pageErrors,
    localFailures,
    screenshotPath: `${outputDir}/rotterdam-runabout-underway.png`
  };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Mobile maritime boarding, control, layout, or persistence journey failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
