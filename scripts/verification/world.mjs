import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const captureRequested = process.env.WE3D_CAPTURE_RELEASE_EVIDENCE === '1';
const policy = JSON.parse(await fs.readFile(path.join(root, 'config', 'verification-policy.json'), 'utf8'));
const captureManifest = JSON.parse(await fs.readFile(path.join(root, 'config', 'public-capture-manifest.json'), 'utf8'));
const captureByFile = new Map(captureManifest.captures.map((capture) => [capture.file, capture]));
const requiredGalleryFiles = new Set([
  'assets/landing/current/world-entry-5.0.png',
  'assets/landing/current/street-walk-5.0.png',
  'assets/landing/current/driving-5.0.png',
  'assets/landing/current/drone-5.0.png',
  'assets/landing/current/plane-5.0.png',
  'assets/landing/current/ocean-5.0.png'
]);
const reportPath = path.join(root, 'output', 'verification', 'world', 'report.json');
const evidenceDir = path.join(root, policy.visualEvidence.outputDirectory);
const server = externalUrl ? null : await startStaticServer({
  rootDir: servedRoot,
  ports: [4360, 4361, 4362, 4363]
});
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
const localFailures = [];

function attachDiagnostics(targetPage) {
  targetPage.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
  targetPage.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      localFailures.push({ kind: 'response', url: response.url(), status: response.status() });
    }
  });
  targetPage.on('requestfailed', (request) => {
    if (request.url().startsWith(baseUrl)) {
      localFailures.push({ kind: 'request', url: request.url(), reason: request.failure()?.errorText || 'failed' });
    }
  });
}

attachDiagnostics(page);

async function verifyPlatformSurfaces() {
  const platformPage = await context.newPage();
  attachDiagnostics(platformPage);
  try {
    await platformPage.goto(`${baseUrl}/account/`, { waitUntil: 'load', timeout: 120000 });
    const account = await platformPage.evaluate(() => ({
      heading: document.querySelector('#accountPageTitle')?.textContent?.trim() || '',
      gateVisible: !document.querySelector('#authPrompt')?.hidden,
      accountVisible: !document.querySelector('#accountPanel')?.hidden,
      navigationCount: document.querySelectorAll('[data-account-target]').length,
      viewCount: document.querySelectorAll('[data-account-view]').length,
      hasCreatorProfile: !!document.querySelector('#creatorAvatarPreview'),
      hasAdminEntry: !!document.querySelector('#moderationPanelLink')
    }));
    await platformPage.goto(`${baseUrl}/account/admin.html`, { waitUntil: 'load', timeout: 120000 });
    const admin = await platformPage.evaluate(() => ({
      heading: document.querySelector('#pageTitle')?.textContent?.trim() || '',
      gateVisible: !document.querySelector('#authGate')?.hidden,
      workspaceVisible: !document.querySelector('#adminWorkspace')?.hidden,
      navigationCount: document.querySelectorAll('[data-view]').length,
      analyticsPanel: !!document.querySelector('[data-view-panel="analytics"]'),
      analyticsLink: document.querySelector('[data-view-panel="analytics"] .analytics-link')?.getAttribute('href') || '',
      hasAuditLog: !!document.querySelector('[data-view="activity"]')
    }));
    return Object.freeze({
      account,
      admin,
      accountOperational:
        account.heading === 'Overview' &&
        (account.gateVisible || account.accountVisible) &&
        account.navigationCount >= 5 &&
        account.viewCount >= 5 &&
        account.hasCreatorProfile &&
        account.hasAdminEntry,
      adminOperational:
        admin.heading === 'Operations Overview' &&
        (admin.gateVisible || admin.workspaceVisible) &&
        admin.navigationCount >= 8 &&
        admin.analyticsPanel &&
        /^https:\/\/analytics\.google\.com\//.test(admin.analyticsLink) &&
        admin.hasAuditLog
    });
  } finally {
    await platformPage.close();
  }
}

function intersections(snapshot) {
  const pairs = [
    ['tutorial', 'gameplayBar'],
    ['minimap', 'gameplayBar'],
    ['hud', 'gameplayBar']
  ];
  return pairs.filter(([leftName, rightName]) => {
    const left = snapshot[leftName];
    const right = snapshot[rightName];
    return left?.visible && right?.visible && left.left < right.right && left.right > right.left &&
      left.top < right.bottom && left.bottom > right.top;
  }).map((pair) => pair.join(':'));
}

async function publicSnapshot() {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        visible: !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0,
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom
      };
    };
    const canvas = document.querySelector('canvas');
    const canvasBounds = canvas?.getBoundingClientRect?.();
    return {
      state: JSON.parse(globalThis.render_game_to_text?.() || '{}'),
      diagnostics: globalThis.getWorldExplorerRuntimeDiagnostics?.() || {},
      canvas: canvasBounds ? { width: canvasBounds.width, height: canvasBounds.height } : null,
      layout: {
        tutorial: rect('#tutorialHintCard'),
        gameplayBar: rect('#floatMenuContainer'),
        minimap: rect('#minimap'),
        hud: rect('#hud')
      },
      ui: {
        backpack: !!document.querySelector('#urbanEquipment'),
        conditionMeter: !!document.querySelector('#urbanPlayerConditionFill'),
        journal: !!document.querySelector('#discoveryWorkspace')
      }
    };
  });
}

let report = null;
try {
  const platformSurfaces = await verifyPlatformSurfaces();
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 120000 });
  const landingHero = String(await page.locator('.hero-frame img').getAttribute('src') || '').replace(/^\.\//, '');
  await page.locator('.gallery').scrollIntoViewIfNeeded();
  await page.locator('.gallery img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  const landingGallery = await page.locator('.gallery img').evaluateAll((images) => images.map((image) => ({
    src: String(image.getAttribute('src') || '').replace(/^\.\//, ''),
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  })));
  const landingGalleryEvidence = await Promise.all(landingGallery.map(async (entry) => {
    const manifestEntry = captureByFile.get(entry.src) || null;
    const bytes = await fs.readFile(path.join(root, entry.src)).catch(() => null);
    const sha256 = bytes ? createHash('sha256').update(bytes).digest('hex') : '';
    return {
      file: entry.src,
      manifestEntry,
      sha256,
      valid:
        captureManifest.release === '5.0.0' &&
        manifestEntry?.sha256 === sha256 &&
        manifestEntry?.width === entry.naturalWidth &&
        manifestEntry?.height === entry.naturalHeight &&
        /normal-input browser runtime capture/i.test(manifestEntry?.provenance || '') &&
        /no synthetic camera or test-only scene/i.test(manifestEntry?.provenance || '')
    };
  }));
  assert.ok(await page.locator('#landingPrimaryCta').isVisible(), 'public landing CTA is not visible');
  const landingUsesApprovedAsset = !policy.blockedLandingAssets.includes(landingHero);
  const landingGalleryUsesCurrentGameplay = landingGallery.length === requiredGalleryFiles.size && landingGallery.every((entry) =>
    entry.src.startsWith('assets/landing/current/') &&
    !policy.blockedLandingAssets.includes(entry.src) &&
    entry.complete && entry.naturalWidth > 0 && entry.naturalHeight > 0
  ) && landingGalleryEvidence.every((entry) => entry.valid) &&
    [...requiredGalleryFiles].every((file) => landingGallery.some((entry) => entry.src === file));

  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
  await page.waitForSelector('#globeSelectorScreen.show', { timeout: 60000 });
  await page.getByRole('button', { name: 'Featured Cities' }).click();
  await page.locator('#globeCityList').getByText('Baltimore', { exact: true }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();

  await page.waitForFunction(() => {
    const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
    const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
    return state.gameStarted === true && state.worldLoading === false &&
      diagnostics.surfaceChain?.surfaces?.terrain?.kind === 'terrain' &&
      Number.isFinite(Number(diagnostics.surfaceChain?.surfaces?.terrain?.y)) &&
      Number(diagnostics.worldCounts?.roads || 0) > 0 &&
      Number(diagnostics.worldCounts?.buildingMeshes || 0) > 0 &&
      Number(diagnostics.transportStructures?.publishedBodies || 0) > 0 &&
      Number(diagnostics.visualOwners?.water?.surfaceCount || 0) > 0 &&
      diagnostics.livingWorld?.active === true &&
      diagnostics.urbanSandbox?.active === true &&
      diagnostics.worldDiscovery?.active === true;
  }, null, { timeout: 240000 });
  await page.waitForTimeout(4500);

  const beforeInput = await publicSnapshot();
  const continuity = beforeInput.diagnostics.transportStructures?.junctionContinuity || {};
  const layoutIntersections = intersections(beforeInput.layout);
  const initialMode = String(beforeInput.diagnostics.activeActor?.mode || '');
  const livingWorld = beforeInput.diagnostics.livingWorld || {};
  const population = livingWorld.population || {};
  const pedestrianGraph = livingWorld.pedestrianGraph || {};
  const activePedestrianCount = Number(livingWorld.activePopulation?.pedestrians || 0) +
    Number(livingWorld.activePopulation?.promotedPedestrians || 0);
  const urbanSandbox = beforeInput.diagnostics.urbanSandbox || {};
  const equipmentItems = Array.isArray(urbanSandbox.equipment?.items)
    ? urbanSandbox.equipment.items
    : [];
  const vehicleDimensions = Array.isArray(population.vehicleDimensions)
    ? population.vehicleDimensions
    : [];

  const checks = {
    accountSurfaceOperational: platformSurfaces.accountOperational,
    adminAnalyticsSurfaceOperational: platformSurfaces.adminOperational,
    landingUsesApprovedAsset,
    landingGalleryUsesCurrentGameplay,
    completeCanvas: Number(beforeInput.canvas?.width || 0) >= 1200 && Number(beforeInput.canvas?.height || 0) >= 700,
    productionDebugHidden: beforeInput.diagnostics.developerDiagnosticsEnabled !== true,
    visibleBuildings: Number(beforeInput.diagnostics.worldCounts?.visibleBuildingMeshes || 0) > 0,
    pitchedRoofsPublished: Number(beforeInput.diagnostics.worldCounts?.pitchedRoofMeshes || 0) > 0,
    facadeEntrancesIntegrated:
      Number(livingWorld.entrances?.published || 0) > 0 &&
      Number(livingWorld.facades?.published || 0) > 0 &&
      Number(livingWorld.facades?.addedDrawCalls || 0) === 0 &&
      livingWorld.facades?.facadeIntegration === 'shader-integrated-wall-face',
    pedestrianPopulationRequiresSafePaths:
      Number(pedestrianGraph.provenance?.mappedPaths || 0) + Number(pedestrianGraph.provenance?.inferredSidewalks || 0) > 0
        ? Number(population.pedestrians || 0) > 0 &&
          Number(population.pedestrianRenderedParts || 0) >= 17 &&
          population.pedestrianRepresentation === 'articulated-instanced-character-v2' &&
          population.pedestrianLegacyBlockFallback === false
        : Number(population.pedestrians || 0) === 0 &&
          activePedestrianCount === 0 &&
          Number(pedestrianGraph.vehicleTransportEdges || 0) === 0 &&
          Number(pedestrianGraph.engineeredTransportEdges || 0) === 0 &&
          Number(pedestrianGraph.provenance?.inferredCrossings || 0) === 0,
    noPedestriansOnVehicleTransport:
      Number(pedestrianGraph.vehicleTransportEdges || 0) === 0 &&
      Number(pedestrianGraph.engineeredTransportEdges || 0) === 0 &&
      Number(pedestrianGraph.provenance?.inferredCrossings || 0) === 0,
    npcDetailLoadsBeforeInteraction:
      Number(urbanSandbox.lodPolicy?.npcPreloadDistance || 0) >= 120 &&
      Number(urbanSandbox.lodPolicy?.npcPreloadDistance || 0) >
        Number(urbanSandbox.lodPolicy?.npcInteractionDistance || Infinity) &&
      Number(urbanSandbox.lodPolicy?.npcReleaseDistance || 0) >
        Number(urbanSandbox.lodPolicy?.npcPreloadDistance || Infinity),
    trafficUsesRecognizablePersistentLod:
      Number(population.vehicleRenderedParts || 0) >= 16 &&
      Number(population.visibilityPolicy?.enterDistance || 0) >= 900 &&
      Number(population.visibilityPolicy?.exitDistance || 0) >
        Number(population.visibilityPolicy?.enterDistance || Infinity) &&
      Number(urbanSandbox.lodPolicy?.vehicleReleaseDistance || 0) >
        Number(urbanSandbox.lodPolicy?.vehiclePreloadDistance || Infinity),
    trafficVehicleScaleIsPlausible:
      vehicleDimensions.length >= 4 && vehicleDimensions.every((vehicle) =>
        Number(vehicle.width) >= 1.5 && Number(vehicle.width) <= 2.6 &&
        Number(vehicle.height) >= 1.3 && Number(vehicle.height) <= 3.2 &&
        Number(vehicle.length) >= 3.4 && Number(vehicle.length) <= 10.8
      ),
    oneBackpackOwnsEquipment:
      beforeInput.ui.backpack && beforeInput.ui.conditionMeter &&
      urbanSandbox.equipment?.type === 'BackpackSnapshot' &&
      equipmentItems.some((item) => item.id === 'laser-gun' && Number(item.reserve) >= 0) &&
      equipmentItems.some((item) => item.id === 'paintball-gun' && Number(item.reserve) >= 0),
    discoveryAndBackpackReadyTogether:
      beforeInput.diagnostics.worldDiscovery?.active === true &&
      equipmentItems.some((item) => item.id === 'field-lens' && item.instanceId === 'field-tool:field-lens') &&
      equipmentItems.some((item) => item.id === 'field-camera' && item.instanceId === 'field-tool:field-camera'),
    peopleAndVehiclesHaveCollisionAuthority:
      urbanSandbox.collisionPolicy?.actorResolver === 'urban-actor-swept-collision' &&
      urbanSandbox.collisionPolicy?.segmentContinuous === true &&
      urbanSandbox.collisionPolicy?.peopleAndVehiclesCollidable === true &&
      urbanSandbox.collisionPolicy?.vehicleImpactsApplyCondition === true,
    conditionRecoveryAndAmmoAreCoherent:
      urbanSandbox.recoveryPolicy?.arrestDestination === 'nearest-mapped-police-facility' &&
      urbanSandbox.recoveryPolicy?.incapacitationDestination === 'nearest-mapped-hospital' &&
      urbanSandbox.recoveryPolicy?.fabricatedFacilitiesAllowed === false &&
      urbanSandbox.recoveryPolicy?.caughtScreenAuthority === 'urban-sandbox-runtime' &&
      urbanSandbox.ammunitionPolicy?.inventoryAuthority === 'character-backpack' &&
      urbanSandbox.ammunitionPolicy?.reloadFromReserve === true &&
      urbanSandbox.ammunitionPolicy?.recoverFromFallenActors === true,
    oneAtmosphereOwner: beforeInput.diagnostics.visualOwners?.atmosphere?.meshCount === 1,
    atmosphereAttached: beforeInput.diagnostics.visualOwners?.atmosphere?.attached === true,
    waterHasOneRenderOwner:
      Number(beforeInput.diagnostics.visualOwners?.water?.animationLoopCount || 0) === 0 &&
      Number(beforeInput.diagnostics.visualOwners?.water?.renderTargetCount || 0) === 0,
    // This general-world journey may contain only generalized provider roads,
    // which deliberately have no exact vertical authority. Require every
    // authoritative connection that is present to be sampled and continuous;
    // the immediately following Jones Falls release gate independently
    // requires a nonzero lossless OSM connection set.
    exactTransportContinuity:
      Number(continuity.sampledConnectionCount || 0) ===
        Number(continuity.authoritativeConnectionCount || 0) &&
      Number(continuity.discontinuityCount || 0) === 0,
    generalizedRoadsHaveNoVerticalAuthority:
      Number(continuity.generalizedEngineeredApproachCount || 0) === 0,
    gameplayLayoutHasNoProtectedOverlap: layoutIntersections.length === 0,
    noRuntimeErrors: Number(beforeInput.state.developerDiagnostics?.capturedErrors || 0) === 0,
    noBrowserErrors: browserErrors.length === 0,
    noFailedLocalResources: localFailures.length === 0
  };

  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1800);
  const afterInput = await publicSnapshot();
  checks.realPlayerModeInput = String(afterInput.diagnostics.activeActor?.mode || '') !== initialMode;
  checks.worldRemainedLoaded = afterInput.state.worldLoading === false;

  report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    contract: 'public-landing-to-complete-live-world',
    baseUrl,
    servedRoot,
    captureRequested,
    screenshotsWritten: [],
    landingHero,
    landingGallery,
    landingGalleryEvidence,
    captureManifest: {
      release: captureManifest.release,
      generatedAt: captureManifest.generatedAt,
      captureCommand: captureManifest.captureCommand,
      writesProduction: captureManifest.writesProduction
    },
    platformSurfaces,
    checks,
    continuity,
    continuityRepair: beforeInput.diagnostics.transportStructures?.junctionProfile?.continuityRepair ||
      beforeInput.diagnostics.transportStructures?.continuityRepair || null,
    layoutIntersections,
    worldCounts: beforeInput.diagnostics.worldCounts,
    visualOwners: {
      atmosphere: beforeInput.diagnostics.visualOwners?.atmosphere || null,
      water: {
        surfaceCount: Number(beforeInput.diagnostics.visualOwners?.water?.surfaceCount || 0),
        materialCount: Number(beforeInput.diagnostics.visualOwners?.water?.materialCount || 0),
        shaderCount: Number(beforeInput.diagnostics.visualOwners?.water?.shaderCount || 0),
        renderTargetCount: Number(beforeInput.diagnostics.visualOwners?.water?.renderTargetCount || 0),
        animationLoopCount: Number(beforeInput.diagnostics.visualOwners?.water?.animationLoopCount || 0),
        waveEvidence: beforeInput.diagnostics.visualOwners?.water?.waveEvidence || null
      }
    },
    initialMode,
    modeAfterInput: afterInput.diagnostics.activeActor?.mode || null,
    browserErrors,
    localFailures
  };

  if (report.ok && captureRequested) {
    const manifest = JSON.parse(await fs.readFile(path.join(servedRoot, 'build-manifest.json'), 'utf8'));
    assert.equal(manifest.sourceDirty, false, 'release evidence requires a clean immutable artifact');
    await fs.rm(evidenceDir, { recursive: true, force: true });
    await fs.mkdir(evidenceDir, { recursive: true });
    const worldImage = path.join(evidenceDir, 'complete-baltimore-world.png');
    await page.screenshot({ path: worldImage, fullPage: false, timeout: 120000 });
    report.screenshotsWritten.push(path.relative(root, worldImage));
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: report.ok,
    contract: report.contract,
    checks: report.checks,
    transportContinuity: {
      authoritativeConnectionCount: Number(report.continuity?.authoritativeConnectionCount || 0),
      discontinuityCount: Number(report.continuity?.discontinuityCount || 0),
      maximumVerticalDeltaMeters: Number(report.continuity?.maximumVerticalDeltaMeters || 0)
    },
    worldCounts: report.worldCounts,
    screenshotsWritten: report.screenshotsWritten
  }, null, 2));
  assert.equal(report.ok, true, `Complete-world verification failed; see ${path.relative(root, reportPath)}`);
} catch (error) {
  if (!report) {
    report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      contract: 'public-landing-to-complete-live-world',
      baseUrl,
      servedRoot,
      captureRequested,
      screenshotsWritten: [],
      error: String(error?.stack || error),
      browserErrors,
      localFailures
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
