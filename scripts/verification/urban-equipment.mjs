import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const captureRequested = process.env.WE3D_CAPTURE_RELEASE_EVIDENCE === '1';
const policy = JSON.parse(await fs.readFile(path.join(root, 'config', 'verification-policy.json'), 'utf8'));
const reportPath = path.join(root, 'output', 'verification', 'urban-equipment', 'report.json');
const evidenceDir = path.join(root, policy.visualEvidence.outputDirectory);
const server = externalUrl ? null : await startStaticServer({
  rootDir: servedRoot,
  ports: [4400, 4401, 4402, 4403]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];
const visualEvidence = [];

page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
page.on('response', (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    localFailures.push({ kind: 'response', status: response.status(), url: response.url() });
  }
});
page.on('requestfailed', (request) => {
  if (request.url().startsWith(baseUrl)) {
    localFailures.push({
      kind: 'request',
      reason: request.failure()?.errorText || 'failed',
      url: request.url()
    });
  }
});

async function snapshot() {
  return page.evaluate(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    const equipment = diagnostics.urbanSandbox?.equipment || {};
    const equipmentRoot = document.querySelector('#urbanEquipment');
    const status = document.querySelector('#urbanEquipmentStatus');
    return {
      environment: diagnostics.environment,
      gameStarted: diagnostics.gameStarted === true,
      worldLoading: diagnostics.worldLoading === true,
      worldCounts: diagnostics.worldCounts || {},
      livingWorldActive: diagnostics.livingWorld?.active === true,
      urbanSandboxActive: diagnostics.urbanSandbox?.active === true,
      discovery: diagnostics.worldDiscovery || { active: false },
      runtimeErrors: diagnostics.runtimeErrors || [],
      capturedErrors: Number(diagnostics.developerDiagnostics?.capturedErrors || 0),
      equipment,
      equipmentPresentation: diagnostics.urbanSandbox?.equipmentPresentation || null,
      backpackMigration: diagnostics.urbanSandbox?.backpackMigration || null,
      projectile: diagnostics.urbanSandbox?.projectileRuntime || null,
      ui: {
        open: equipmentRoot?.classList.contains('show') === true,
        ariaHidden: equipmentRoot?.getAttribute('aria-hidden') || '',
        status: status?.textContent?.trim() || '',
        itemButtonCount: equipmentRoot?.querySelectorAll('[data-equipment-id]').length || 0,
        equippedButtonCount: equipmentRoot?.querySelectorAll('[data-equipment-id][aria-pressed="true"]').length || 0
      },
      visiblePrimaryCanvasCount: [...document.querySelectorAll('canvas')].filter((canvas) => {
        const style = getComputedStyle(canvas);
        const rect = canvas.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 600 && rect.height >= 400;
      }).length
    };
  });
}

function item(snapshotValue, catalogId) {
  return snapshotValue.equipment?.items?.find((entry) => entry.id === catalogId) || null;
}

function identitySet(snapshotValue) {
  return new Set((snapshotValue.equipment?.items || []).map((entry) => entry.instanceId));
}

let report = null;
try {
  await page.addInitScript(() => {
    localStorage.removeItem('world-explorer:character-backpack:v2');
    localStorage.removeItem('world-explorer:character-backpack:migration-backup:v1');
    localStorage.setItem('world-explorer:character-backpack:v1', JSON.stringify({
      schemaVersion: 1,
      revision: 4,
      equippedInstanceId: 'legacy:flashlight:retry',
      hotbar: [null, 'legacy:flashlight:retry', null, null, null, null],
      items: [
        { instanceId: 'legacy:flashlight', catalogId: 'flashlight', sourceEventId: 'event:starter:flashlight', authority: 'anonymous-local' },
        { instanceId: 'legacy:flashlight:retry', catalogId: 'flashlight', sourceEventId: 'event:starter:flashlight', authority: 'anonymous-local' }
      ]
    }));
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120000 });
  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60000 });
  await page.getByRole('button', { name: 'Featured Cities' }).click();
  await page.locator('#globeCityList').getByText('Baltimore', { exact: true }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();

  await page.waitForFunction(() => {
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return diagnostics.gameStarted === true && diagnostics.worldLoading === false &&
      diagnostics.environment === 'EARTH' &&
      Number(diagnostics.worldCounts?.roads || 0) > 0 &&
      Number(diagnostics.worldCounts?.buildingMeshes || 0) > 0 &&
      diagnostics.livingWorld?.active === true &&
      diagnostics.urbanSandbox?.active === true &&
      diagnostics.worldDiscovery?.active === true;
  }, null, { timeout: 360000 });
  await page.waitForTimeout(500);

  const ready = await snapshot();
  const migratedStorage = await page.evaluate(() => ({
    current: JSON.parse(localStorage.getItem('world-explorer:character-backpack:v2') || 'null'),
    backup: JSON.parse(localStorage.getItem('world-explorer:character-backpack:migration-backup:v1') || 'null')
  }));
  const readyItems = ready.equipment?.items || [];
  const expectedStarterEquipment = [
    'hands', 'flashlight', 'baton', 'pulse-sidearm',
    'concussion-charge', 'parachute', 'laser-gun', 'paintball-gun'
  ];
  const expectedStartingFieldTools = [
    'field-lens', 'field-camera', 'metal-detector', 'hand-trowel', 'fishing-rod'
  ];

  await page.keyboard.press('KeyI');
  await page.waitForSelector('#urbanEquipment.show', { timeout: 5000 });
  const opened = await snapshot();

  const laserItem = page.locator('#urbanBackpackContents [data-equipment-id]').filter({ hasText: 'Laser gun' });
  await laserItem.click();
  await page.waitForFunction(() => {
    const detail = document.querySelector('#urbanBackpackDetail');
    const selected = document.querySelector('#urbanBackpackContents [data-equipment-id][aria-current="true"]');
    return detail?.querySelector('strong')?.textContent?.trim() === 'Laser gun' &&
      selected?.textContent?.includes('Laser gun') === true;
  }, null, { timeout: 30000 });
  await page.locator('#urbanBackpackDetail').getByRole('button', { name: 'Equip', exact: true }).click();
  await page.waitForFunction(() => {
    const sandbox = globalThis.getWorldExplorerRuntimeDiagnostics?.()?.urbanSandbox;
    return sandbox?.equipment?.equippedId === 'laser-gun';
  }, null, { timeout: 5000 });
  await page.waitForTimeout(4000);
  const laserEquipped = await snapshot();
  if (captureRequested) {
    await fs.mkdir(evidenceDir, { recursive: true });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#urbanEquipment')?.classList.contains('show') !== true);
    const laserImage = path.join(evidenceDir, 'urban-equipment-laser-pose.png');
    await page.screenshot({ path: laserImage, fullPage: false, timeout: 120000 });
    visualEvidence.push(path.relative(root, laserImage));
    await page.keyboard.press('KeyI');
    await page.waitForSelector('#urbanEquipment.show', { timeout: 5000 });
  }
  const laserMagazineBefore = Number(item(laserEquipped, 'laser-gun')?.magazine);

  await page.keyboard.press('KeyV');
  await page.waitForFunction((before) => {
    const sandbox = globalThis.getWorldExplorerRuntimeDiagnostics?.()?.urbanSandbox;
    const laser = sandbox?.equipment?.items?.find((entry) => entry.id === 'laser-gun');
    return Number(laser?.magazine) === before - 1 &&
      sandbox?.projectileRuntime?.lastProjectileAction?.equipmentId === 'laser-gun';
  }, laserMagazineBefore, { timeout: 5000 });
  const laserUsed = await snapshot();

  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => {
    return globalThis.getWorldExplorerRuntimeDiagnostics?.()?.urbanSandbox?.equipment?.equippedId === 'flashlight';
  }, null, { timeout: 5000 });
  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => {
    return globalThis.getWorldExplorerRuntimeDiagnostics?.()?.urbanSandbox?.equipment?.flashlightEnabled === true;
  }, null, { timeout: 5000 });
  const flashlightUsed = await snapshot();

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#urbanEquipment')?.classList.contains('show') !== true, null, { timeout: 5000 });
  const closed = await snapshot();

  const finalItems = closed.equipment?.items || [];
  const expectedCatalogIds = [...expectedStarterEquipment, ...expectedStartingFieldTools];
  const checks = {
    completeEarthWorldBehindJourney:
      ready.environment === 'EARTH' && ready.gameStarted && !ready.worldLoading &&
      Number(ready.worldCounts.roads || 0) > 0 &&
      Number(ready.worldCounts.buildingMeshes || 0) > 0 &&
      ready.visiblePrimaryCanvasCount === 1,
    dependentSystemsReadyBeforeInventoryRead:
      ready.livingWorldActive && ready.urbanSandboxActive && ready.discovery.active === true,
    oneBackpackContainsExpectedCurrentItems:
      ready.equipment?.type === 'BackpackSnapshot' &&
      readyItems.length === expectedCatalogIds.length &&
      expectedCatalogIds.every((catalogId) => readyItems.some((entry) => entry.id === catalogId)),
    stableUniqueInstanceIdentity:
      identitySet(ready).size === readyItems.length &&
      identitySet(closed).size === finalItems.length &&
      finalItems.length === readyItems.length &&
      [...identitySet(ready)].every((instanceId) => identitySet(closed).has(instanceId)),
    legacyMigrationIsIdempotentAndBackedUp:
      ready.backpackMigration?.version === 2 && ready.backpackMigration?.sourceVersion === 1 &&
      ready.backpackMigration?.duplicateEventRewardsRemoved === 1 && ready.backpackMigration?.backupAvailable === true &&
      migratedStorage.current?.items?.filter((entry) => entry.sourceEventId === 'event:starter:flashlight').length === 1 &&
      migratedStorage.backup?.state?.items?.length === 2,
    keyboardOpensAccessibleBackpack:
      opened.ui.open && opened.ui.ariaHidden === 'false' &&
      opened.ui.itemButtonCount === readyItems.length && opened.ui.equippedButtonCount === 1,
    pointerInspectsThenExplicitlyEquipsExistingLooseItem:
      laserEquipped.equipment?.equippedId === 'laser-gun' &&
      item(laserEquipped, 'laser-gun')?.equipped === true &&
      laserEquipped.equipment?.items?.length === readyItems.length &&
      laserEquipped.equipmentPresentation?.attachment === 'curated-right-wrist' &&
      laserEquipped.equipmentPresentation?.curatedAssetId === 'equipment-explorer-laser-rifle-v1' &&
      laserEquipped.equipmentPresentation?.fallbackVisible === false,
    equipmentUseConsumesOneAuthoritativeRound:
      Number(item(laserUsed, 'laser-gun')?.magazine) === laserMagazineBefore - 1 &&
      Number(item(laserUsed, 'laser-gun')?.reserve) === Number(item(laserEquipped, 'laser-gun')?.reserve) &&
      laserUsed.projectile?.lastProjectileAction?.equipmentId === 'laser-gun',
    quickSlotAndUtilityUseShareBackpack:
      flashlightUsed.equipment?.equippedId === 'flashlight' &&
      flashlightUsed.equipment?.flashlightEnabled === true &&
      flashlightUsed.equipment?.items?.length === readyItems.length,
    escapeClosesWithoutLosingState:
      !closed.ui.open && closed.ui.ariaHidden === 'true' &&
      closed.equipment?.equippedId === 'flashlight' &&
      closed.equipment?.flashlightEnabled === true &&
      Number(item(closed, 'laser-gun')?.magazine) === laserMagazineBefore - 1,
    worldRemainsAssembled:
      closed.environment === 'EARTH' && closed.gameStarted && !closed.worldLoading &&
      closed.livingWorldActive && closed.urbanSandboxActive && closed.discovery.active === true,
    noRuntimeErrors:
      closed.runtimeErrors.length === 0 && closed.capturedErrors === 0,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };

  report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    contract: 'assembled-world-shared-backpack-equipment-normal-input',
    baseUrl,
    servedRoot,
    captureRequested,
    screenshotsWritten: visualEvidence,
    checks,
    expectedCatalogIds,
    ready,
    migratedStorage,
    opened,
    laserEquipped,
    laserUsed,
    flashlightUsed,
    closed,
    browserErrors,
    localFailures
  };

  assert.equal(report.ok, true, `Urban equipment verification failed; see ${path.relative(root, reportPath)}`);

  if (captureRequested) {
    if (path.basename(servedRoot) === 'dist') {
      const manifest = JSON.parse(await fs.readFile(path.join(servedRoot, 'build-manifest.json'), 'utf8'));
      assert.equal(manifest.sourceDirty, false, 'release evidence requires a clean immutable artifact');
    }
    await fs.mkdir(evidenceDir, { recursive: true });
    const worldImage = path.join(evidenceDir, 'urban-equipment-complete-world.png');
    await page.screenshot({ path: worldImage, fullPage: false, timeout: 120000 });
    report.screenshotsWritten.push(path.relative(root, worldImage));

    await page.keyboard.press('KeyI');
    await page.waitForSelector('#urbanEquipment.show', { timeout: 5000 });
    const backpackImage = path.join(evidenceDir, 'urban-equipment-backpack.png');
    await page.screenshot({ path: backpackImage, fullPage: false, timeout: 120000 });
    report.screenshotsWritten.push(path.relative(root, backpackImage));
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: report.ok,
    contract: report.contract,
    checks: report.checks,
    readyItemCount: readyItems.length,
    finalItemCount: finalItems.length,
    laserMagazineBefore,
    laserMagazineAfter: Number(item(closed, 'laser-gun')?.magazine),
    screenshotsWritten: report.screenshotsWritten
  }, null, 2));
} catch (error) {
  if (!report) {
    report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      contract: 'assembled-world-shared-backpack-equipment-normal-input',
      baseUrl,
      servedRoot,
      captureRequested,
      screenshotsWritten: [],
      error: String(error?.stack || error),
      browserErrors,
      localFailures
    };
  } else {
    report.ok = false;
    report.error = String(error?.stack || error);
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  // Closing the browser owns all of its contexts. Closing this context first can
  // hang indefinitely after a long assembled-world run even though Chromium has
  // already exited, which leaves the release runner blocked after a valid report.
  await browser.close().catch(() => {});
  await server?.close().catch(() => {});
}
