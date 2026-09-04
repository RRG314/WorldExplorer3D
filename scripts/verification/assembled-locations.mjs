import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4394, 4395, 4396, 4397] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const evidenceDir = path.join(root, 'output', 'release-evidence', 'current');
const capture = process.env.WE3D_CAPTURE_RELEASE_EVIDENCE === '1';
const forceTransportFallback = process.env.WE3D_FORCE_TRANSPORT_FALLBACK === '1';
const reportPath = path.join(
  root,
  'output',
  'verification',
  'assembled-locations',
  forceTransportFallback ? 'report-fallback.json' : 'report.json'
);

// These are product-owned catalog/audit anchors, selected by current release
// requirements rather than inherited legacy screenshots.
const allLocations = [
  { id: 'baltimore-jfx', name: 'Jones Falls Expressway', lat: 39.309728, lon: -76.621428, class: 'urban-structure', driveOnLeft: false, expectsStructureArrival: true },
  { id: 'golden-gate', name: 'Golden Gate Bridge', lat: 37.8115, lon: -122.4774, class: 'coastal-structure', driveOnLeft: false, expectsStructureArrival: true },
  { id: 'london', name: 'London', lat: 51.5074, lon: -0.1278, class: 'coastal-urban', driveOnLeft: true },
  { id: 'monaco', name: 'Monaco', lat: 43.7384, lon: 7.4246, class: 'terrain-structure', driveOnLeft: false },
  { id: 'manhattan', name: 'Manhattan', lat: 40.7580, lon: -73.9855, class: 'dense-urban', driveOnLeft: false },
  { id: 'iowa-rural', name: 'Iowa Rural', lat: 42.08, lon: -93.87, class: 'rural', driveOnLeft: false },
  { id: 'tokyo', name: 'Tokyo', lat: 35.6762, lon: 139.6503, class: 'dense-urban', driveOnLeft: true }
];
const requestedLocations = new Set(String(process.env.WE3D_VERIFY_LOCATIONS || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const locations = requestedLocations.size > 0
  ? allLocations.filter((location) => requestedLocations.has(location.id))
  : allLocations;
assert.ok(locations.length > 0, 'No assembled verification locations matched WE3D_VERIFY_LOCATIONS.');

await fs.mkdir(path.dirname(reportPath), { recursive: true });
if (capture) await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];

try {
  for (const location of locations) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    const browserConsole = [];
    const localFailures = [];
    page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return;
      if (browserConsole.length < 120) {
        browserConsole.push({ type: message.type(), text: message.text() });
      }
    });
    page.on('response', (response) => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        localFailures.push({ kind: 'response', status: response.status(), url: response.url() });
      }
    });
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(baseUrl)) {
        localFailures.push({ kind: 'request', reason: request.failure()?.errorText || 'failed', url: request.url() });
      }
    });
    if (forceTransportFallback) {
      await page.route(/https:\/\/[^/]*overpass[^/]*\/api\/interpreter/i, (route) =>
        route.abort('failed'));
    }

    try {
      const params = new URLSearchParams({
        loc: 'custom', lat: String(location.lat), lon: String(location.lon), lname: location.name,
        launch: 'earth', gm: 'free', mode: 'walking'
      });
      await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
      const consent = page.locator('#analyticsConsentDenyBtn');
      if (await consent.isVisible()) await consent.click();
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.waitForFunction(() => {
        const state = JSON.parse(globalThis.render_game_to_text?.() || '{}');
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return state.gameStarted === true && state.worldLoading === false &&
          diagnostics.surfaceChain?.surfaces?.terrain?.kind === 'terrain' &&
          Number.isFinite(Number(diagnostics.surfaceChain?.surfaces?.terrain?.y)) &&
          Number(diagnostics.worldCounts?.roads || 0) > 0 &&
          diagnostics.livingWorld?.active === true && diagnostics.urbanSandbox?.active === true;
      }, null, { timeout: 360000 });
      await page.waitForTimeout(3000);

      const snapshot = await page.evaluate(() => {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return {
          environment: diagnostics.environment,
          worldCounts: diagnostics.worldCounts || {},
          transportContinuity: diagnostics.transportStructures?.junctionContinuity || null,
          transportNetwork: diagnostics.transportStructures?.transportNetwork || null,
          generalizedEndpointIntegrity:
            diagnostics.transportStructures?.generalizedEndpointIntegrity || null,
          transportGradeProfile: diagnostics.transportStructures?.gradeProfile || null,
          roadSurfaceIntegrity: diagnostics.transportStructures?.roadSurfaceIntegrity || null,
          atGradeTerrainAuthority: diagnostics.transportStructures?.atGradeTerrainAuthority || null,
          publishedVerticalControls: diagnostics.transportStructures?.publishedVerticalControls || [],
          sharedPhysicalSurfaces: diagnostics.transportStructures?.sharedPhysicalSurfaces || [],
          mappedLandmarks: diagnostics.mappedLandmarks || null,
          mappedTallBuildingVisuals: diagnostics.mappedTallBuildingVisuals || null,
          farTerrainClipmap: diagnostics.farTerrainClipmap || null,
          livingWorld: diagnostics.livingWorld || null,
          urbanSandbox: diagnostics.urbanSandbox || null,
          surfaceChain: diagnostics.surfaceChain || null,
          worldLoad: {
            providers: diagnostics.worldLoad?.session?.providers || {},
            regionalStructures: diagnostics.worldLoad?.regionalStructures || null,
            regionalTransportSelection: diagnostics.worldLoad?.regionalTransportSelection || null,
            reviewedStructureSelection: diagnostics.worldLoad?.reviewedStructureSelection || null,
            transportProviderDecision: diagnostics.worldLoad?.transportProviderDecision || null,
            transportSource: diagnostics.worldLoad?.layerProducts?.transport?.source || null,
            buildingSource: diagnostics.worldLoad?.layerProducts?.buildings?.source || null,
            buildingProviderDecision: diagnostics.worldLoad?.buildingProviderDecision || null,
            acceptedGroundSelection: diagnostics.worldLoad?.acceptedGroundSelection || null,
            buildingRoadAuthority: diagnostics.worldLoad?.layerProducts?.buildings?.record?.compilation || null,
            buildingDetail: diagnostics.worldDetail?.buildings || null
          },
          runtimeErrors: diagnostics.runtimeErrors || [],
          visiblePrimaryCanvasCount: [...document.querySelectorAll('canvas')].filter((canvas) => {
            const style = getComputedStyle(canvas);
            const rect = canvas.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 600 && rect.height >= 400;
          }).length
        };
      });
      const directAtGradeContactAligned =
        snapshot.surfaceChain?.actor?.contact?.kind === 'road' &&
        snapshot.surfaceChain?.surfaces?.walk?.kind === 'road' &&
        snapshot.surfaceChain?.surfaces?.walk?.feature?.structureKind === 'at_grade' &&
        Number.isFinite(Number(snapshot.surfaceChain?.deltas?.feetMinusRenderedTerrain)) &&
        Math.abs(Number(snapshot.surfaceChain?.deltas?.feetMinusRenderedTerrain)) <= 0.35 &&
        Number.isFinite(Number(snapshot.surfaceChain?.deltas?.renderedMinusSourceWorld)) &&
        Math.abs(Number(snapshot.surfaceChain?.deltas?.renderedMinusSourceWorld)) <= 0.1;
      const atGradeTerrainOutcomeObserved =
        Number(snapshot.atGradeTerrainAuthority?.adjustedTerrainVertices || 0) > 0 ||
        directAtGradeContactAligned;
      const checks = {
        earthOwnsRuntime: snapshot.environment === 'EARTH',
        terrainAndRoadsPublished:
          snapshot.surfaceChain?.surfaces?.terrain?.kind === 'terrain' &&
          Number.isFinite(Number(snapshot.surfaceChain?.surfaces?.terrain?.y)) &&
          Number(snapshot.worldCounts.roads || 0) > 0,
        oneVisibleGameplayCanvas: snapshot.visiblePrimaryCanvasCount === 1,
        livingAndUrbanSystemsActive: snapshot.livingWorld?.active === true && snapshot.urbanSandbox?.active === true,
        correctJurisdictionLaneSide:
          snapshot.livingWorld?.trafficGraph?.provenance?.driveOnLeft === location.driveOnLeft,
        noTrafficDirectionViolations:
          Number(snapshot.livingWorld?.trafficGraph?.directionViolations || 0) === 0,
        noTrafficLaneSideViolations:
          Number(snapshot.livingWorld?.trafficGraph?.laneSideViolations || 0) === 0,
        noPedestriansOnVehicleTransport:
          Number(snapshot.livingWorld?.pedestrianGraph?.vehicleTransportEdges || 0) === 0 &&
          Number(snapshot.livingWorld?.pedestrianGraph?.engineeredTransportEdges || 0) === 0 &&
          Number(snapshot.livingWorld?.pedestrianGraph?.provenance?.inferredCrossings || 0) === 0,
        oneAtGradeBuildingRoadAuthority:
          snapshot.worldLoad?.buildingRoadAuthority !== null &&
          Number(snapshot.worldLoad?.buildingRoadAuthority?.unresolvedAtGradeConflicts || 0) === 0 &&
          Number(snapshot.worldLoad?.buildingRoadAuthority?.newlyNonDriveableRoads || 0) === 0 &&
          (
            Number(snapshot.worldLoad?.buildingRoadAuthority?.constrainedRoads || 0) === 0 ||
            (
              snapshot.worldLoad?.buildingRoadAuthority?.crossSectionAuthority ===
                'mapped_building_clearance_by_source_interval' &&
              Number(snapshot.worldLoad?.buildingRoadAuthority?.constrainedSegments || 0) > 0 &&
              Number(snapshot.worldLoad?.buildingRoadAuthority?.minimumResolvedWidth || 0) >= 1.2
            )
          ),
        oneBuildingFoundationCollisionAuthority:
          Number(snapshot.worldLoad?.buildingRoadAuthority?.foundationCollisionProfiles || 0) > 0 &&
          Number(snapshot.worldLoad?.buildingRoadAuthority?.foundationCollisionMismatches || 0) === 0,
        completePinnedBuildingAuthority:
          snapshot.worldLoad?.buildingSource?.provider === 'overture-buildings-pmtiles' &&
          snapshot.worldLoad?.buildingDetail?.source === 'overture-buildings-pmtiles' &&
          snapshot.worldLoad?.buildingDetail?.sourceDetails?.releasePolicy?.authority ===
            'build-pinned-reviewed-overture-release' &&
          snapshot.worldLoad?.buildingDetail?.sourceDetails?.coverageComplete === true &&
          Number(snapshot.worldLoad?.buildingDetail?.sourceDetails?.failedTiles || 0) === 0 &&
          Number(snapshot.worldLoad?.buildingDetail?.sourceDetails?.loadedTiles || 0) ===
            Number(snapshot.worldLoad?.buildingDetail?.sourceDetails?.requestedTiles || -1) &&
          snapshot.worldLoad?.buildingProviderDecision?.selected === 'overture' &&
          snapshot.worldLoad?.buildingProviderDecision?.authority === 'authoritative',
        mappedTallIdentitiesKeepFinalVisuals:
          Number(snapshot.mappedTallBuildingVisuals?.missingVisualRecords || 0) === 0 &&
          Number(snapshot.mappedTallBuildingVisuals?.hiddenVisualRecords || 0) === 0 &&
          Number(snapshot.mappedTallBuildingVisuals?.missingRenderedHeightRecords || 0) === 0 &&
          Number(snapshot.mappedTallBuildingVisuals?.heightMismatchRecords || 0) === 0,
        oneFarBuildingHeightAuthority:
          snapshot.farTerrainClipmap?.farBuildingHeightAuthority === 'shared-building-semantics' &&
          Number(snapshot.farTerrainClipmap?.farMappedHeightBuildings || 0) +
            Number(snapshot.farTerrainClipmap?.farInferredHeightBuildings || 0) ===
            Number(snapshot.farTerrainClipmap?.farBuildings || -1),
        mappedStructureArrivalVisible: location.expectsStructureArrival !== true || (
          snapshot.surfaceChain?.actor?.mode !== 'boat' &&
          /^(?:bridge|overpass|ramp|elevated_road)$/.test(String(
            snapshot.surfaceChain?.surfaces?.walk?.feature?.structureKind || ''
          )) &&
          Number(snapshot.surfaceChain?.surfaces?.walk?.feature?.structureVisual?.visibleMeshCount || 0) > 0
        ),
        mappedRuralArrival: location.id !== 'iowa-rural' || (
          snapshot.surfaceChain?.surfaces?.walk?.kind === 'road' &&
          !!snapshot.surfaceChain?.surfaces?.walk?.feature?.transportSource?.identity &&
          Math.hypot(
            Number(snapshot.surfaceChain?.world?.x || 0),
            Number(snapshot.surfaceChain?.world?.z || 0)
          ) <= 2700
        ),
        exactStructureConnectionsContinuous: Number(snapshot.transportContinuity?.discontinuityCount || 0) === 0,
        generalizedStructureEndpointsSupported:
          snapshot.generalizedEndpointIntegrity?.authority ===
            'compiled-generalized-structure-endpoints' &&
          Number(snapshot.generalizedEndpointIntegrity?.unsupportedOpenBoundaryCount || 0) === 0,
        compiledRoadGradesWithinDesignBounds: Number(snapshot.transportGradeProfile?.violationCount || 0) === 0,
        solidRoadSurfaceFootprints:
          snapshot.roadSurfaceIntegrity?.authority ===
            'solid-at-grade-segments-and-bounded-turn-joins' &&
          snapshot.roadSurfaceIntegrity?.surfaceHeightAuthority ===
            'compiled_transport_surface_profile' &&
          Number(snapshot.roadSurfaceIntegrity?.segmentQuads || 0) > 0 &&
          Number(snapshot.roadSurfaceIntegrity?.foldedTriangles || 0) === 0 &&
          Number(snapshot.roadSurfaceIntegrity?.degenerateTriangles || 0) === 0 &&
          Number(snapshot.roadSurfaceIntegrity?.junctionCoverageGaps || 0) === 0 &&
          Number(snapshot.roadSurfaceIntegrity?.compiledSurfaceFallbacks || 0) === 0,
        oneAtGradeTransportTerrainAuthority:
          snapshot.atGradeTerrainAuthority?.authority === 'compiled_transport_surface' &&
          Number(snapshot.atGradeTerrainAuthority?.roadCount || 0) > 0 &&
          Number(snapshot.atGradeTerrainAuthority?.compiledSurfaceRoads || 0) ===
            Number(snapshot.atGradeTerrainAuthority?.roadCount || -1) &&
          Number(snapshot.atGradeTerrainAuthority?.corridorCount || 0) ===
            Number(snapshot.atGradeTerrainAuthority?.roadCount || -1) &&
          Number(snapshot.atGradeTerrainAuthority?.liveTerrainSamplerRoads || 0) === 0 &&
          // A changed-vertex count is not itself a player outcome. A corridor
          // that already matches the rendered terrain can correctly need zero
          // edits, especially with a sparse fallback road set. Require either
          // a real terrain edit or direct at-grade player contact aligned to
          // both the rendered and source ground authorities.
          atGradeTerrainOutcomeObserved &&
          snapshot.atGradeTerrainAuthority?.heightSamplingAuthority ===
            'rendered-triangle-barycentric' &&
          snapshot.atGradeTerrainAuthority?.terrainSeamAuthority ===
            'one-shared-world-height-per-terrain-edge-coordinate' &&
          Number(snapshot.atGradeTerrainAuthority?.sharedTerrainEdgeVertices || 0) > 0,
        publishedBridgeElevationControlResolved: location.id !== 'golden-gate' || (
          snapshot.publishedVerticalControls.length === 2 &&
          snapshot.publishedVerticalControls.every((control) =>
            control.authority === 'compiled_transport_surface' &&
            control.mappedWaterSamples > 0 &&
            control.minimumSurfaceY > 60 &&
            control.measurementStatus === 'published_reference_not_surveyed_scene_elevation' &&
            /^https:\/\/www\.goldengate\.org\//.test(control.sourceUrl)
          )
        ),
        bridgeRoadwayUsesOneSymmetricPhysicalSurface: location.id !== 'golden-gate'
          ? snapshot.sharedPhysicalSurfaces.length === 0
          : (
              snapshot.sharedPhysicalSurfaces.length === 1 &&
              snapshot.sharedPhysicalSurfaces[0].authority === 'compiled_transport_surface_group' &&
              snapshot.sharedPhysicalSurfaces[0].physicalSurfaceKind === 'bridge_deck' &&
              snapshot.sharedPhysicalSurfaces[0].widthMeters === 19 &&
              snapshot.sharedPhysicalSurfaces[0].lanes === 6 &&
              snapshot.sharedPhysicalSurfaces[0].memberFeatureIds.length === 2 &&
              snapshot.sharedPhysicalSurfaces[0].measurementStatus ===
                'published_reference_not_surveyed_scene_width' &&
              /^https:\/\/www\.goldengate\.org\//.test(snapshot.sharedPhysicalSurfaces[0].sourceUrl)
            ),
        bridgeLandmarkReadsCompiledSurface: location.id !== 'golden-gate' || (
          snapshot.mappedLandmarks?.suspensionBridge?.status === 'published_from_compiled_transport_surface' &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.controlledRoads || 0) === 2 &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.towers || 0) === 2 &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.cables || 0) === 2 &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.girders || 0) === 2 &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.suspenders || 0) > 0 &&
          Number(snapshot.mappedLandmarks?.suspensionBridge?.structuralMembers || 0) > 0 &&
          snapshot.mappedLandmarks?.suspensionBridge?.transportSurfaceOwner === 'compiled_transport_surface' &&
          snapshot.mappedLandmarks?.suspensionBridge?.structureAxisAuthority ===
            'compiled_transport_surface_group'
        ),
        noRuntimeErrors: snapshot.runtimeErrors.length === 0,
        noBrowserErrors: browserErrors.length === 0,
        noFailedLocalResources: localFailures.length === 0
      };
      checks.transportProviderModeResolved = forceTransportFallback
        ? (
            snapshot.worldLoad?.transportProviderDecision?.primaryProvider === 'shortbread-vector' &&
            snapshot.worldLoad?.transportProviderDecision?.optionalExactProvider === 'osm-overpass' &&
            snapshot.worldLoad?.transportProviderDecision?.optionalExactUnavailable === true &&
            snapshot.worldLoad?.transportProviderDecision?.exactTransportLoaded === false &&
            snapshot.worldLoad?.transportProviderDecision?.selected === 'shortbread-vector' &&
            Number(snapshot.worldLoad?.providers?.['openstreetmap-shortbread']?.completed || 0) > 0 &&
            Number(snapshot.worldLoad?.providers?.['osm-overpass']?.failed || 0) > 0
          )
        : (
            snapshot.worldLoad?.transportProviderDecision?.primaryProvider === 'shortbread-vector' &&
            snapshot.worldLoad?.transportProviderDecision?.optionalExactProvider === 'osm-overpass' &&
            Number(snapshot.worldLoad?.providers?.['openstreetmap-shortbread']?.completed || 0) > 0 &&
            (
              (
                snapshot.worldLoad?.transportProviderDecision?.exactTransportLoaded === true &&
                snapshot.worldLoad?.transportProviderDecision?.optionalExactActive === true &&
                snapshot.worldLoad?.transportProviderDecision?.selected ===
                  'shortbread-vector+osm-overpass-exact' &&
                Number(snapshot.worldLoad?.providers?.['osm-overpass']?.completed || 0) > 0
              ) || (
                snapshot.worldLoad?.transportProviderDecision?.exactTransportLoaded === false &&
                snapshot.worldLoad?.transportProviderDecision?.optionalExactUnavailable === true &&
                snapshot.worldLoad?.transportProviderDecision?.selected === 'shortbread-vector' &&
                Number(snapshot.worldLoad?.providers?.['osm-overpass']?.failed || 0) > 0
              )
            )
          );
      const skipGuide = page.getByText('Skip guide', { exact: true });
      if (await skipGuide.isVisible().catch(() => false)) {
        // The guide may auto-dismiss between the visibility read and click.
        // That is an accepted terminal state, not a world-verification error.
        await skipGuide.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      const starInfoClose = page.locator('#starInfoClose');
      if (await starInfoClose.isVisible().catch(() => false)) {
        await starInfoClose.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
      if (capture) {
        const suffix = forceTransportFallback ? '-transport-fallback' : '';
        await page.screenshot({ path: path.join(evidenceDir, `${location.id}${suffix}.png`) });
      }
      results.push({
        ...location,
        ok: Object.values(checks).every(Boolean),
        checks,
        verifierEvidence: {
          directAtGradeContactAligned,
          atGradeTerrainOutcomeObserved
        },
        snapshot,
        browserErrors,
        browserConsole,
        localFailures
      });
    } catch (error) {
      results.push({
        ...location,
        ok: false,
        error: String(error?.stack || error),
        browserErrors,
        browserConsole,
        localFailures
      });
    } finally {
      await context.close().catch(() => {});
    }
  }
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

const report = {
  ok: results.every((result) => result.ok),
  generatedAt: new Date().toISOString(),
  contract: 'complete-assembled-gameplay-representative-location-matrix',
  captureEnabled: capture,
  forceTransportFallback,
  results
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: report.ok,
  generatedAt: report.generatedAt,
  contract: report.contract,
  results: report.results.map((result) => ({
    id: result.id,
    ok: result.ok,
    checks: result.checks || null,
    transportProvider: result.snapshot?.worldLoad?.transportSource?.provider || null,
    transportProviderDecision: result.snapshot?.worldLoad?.transportProviderDecision || null,
    overpassFailures: Number(result.snapshot?.worldLoad?.providers?.['osm-overpass']?.failed || 0),
    discontinuities: Number(result.snapshot?.transportContinuity?.discontinuityCount || 0),
    maximumVerticalDeltaMeters: Number(result.snapshot?.transportContinuity?.maximumVerticalDeltaMeters || 0),
    gradeViolations: Number(result.snapshot?.transportGradeProfile?.violationCount || 0),
    maximumEngineeredGrade: Number(result.snapshot?.transportGradeProfile?.maximumGrade || 0),
    error: result.error || null
  }))
}, null, 2));
assert.equal(report.ok, true, `Assembled location verification failed; see ${path.relative(root, reportPath)}`);
