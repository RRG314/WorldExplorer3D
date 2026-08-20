import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { VEHICLE_CATALOG, PARKED_VEHICLE_CATALOG } from '../../app/js/engine/vehicle-catalog.js?v=1';
import {
  compilePedestrianGraph,
  compileTrafficGraph,
  resolveDrivingSide
} from '../../app/js/living-world/navigation-graphs.js';
import { normalizeTransportSource } from '../../app/js/world/compiler/transport-source-normalizer.js';
import { compileElevatedAssembly } from '../../app/js/world/compiler/transport-structure-assembly.js';
import { supportSpanConflictsWithDriveableRoad } from '../../app/js/world/bridge-safety.js';
import { URBAN_VEHICLE_CATALOG, parkedVehicleAnchors } from '../../app/js/urban-sandbox/vehicle-model.js';

// This verification is derived from the current actor/vehicle product
// requirements. It does not inherit screenshot baselines or legacy tests.
assert.equal(URBAN_VEHICLE_CATALOG, PARKED_VEHICLE_CATALOG, 'Parked vehicles must use the canonical parkable catalog.');

const motorwayRecord = normalizeTransportSource(
  { providerNamespace: 'osm', type: 'way', id: 'motorway-with-implied-direction' },
  { highway: 'motorway' }
);
assert.equal(motorwayRecord.direction, 'forward', 'OSM motorway must honor implied one-way direction.');
assert.equal(motorwayRecord.access.pedestrian, 'prohibited', 'OSM motorway must not default to pedestrian access.');
const explicitTwoWayMotorway = normalizeTransportSource(
  { providerNamespace: 'osm', type: 'way', id: 'explicit-two-way-motorway' },
  { highway: 'motorway', oneway: 'no' }
);
assert.equal(explicitTwoWayMotorway.direction, 'both', 'Explicit OSM oneway=no must override the motorway default.');
assert.equal(resolveDrivingSide({ countryCode: 'US' }).driveOnLeft, false, 'US traffic must use right-side lanes.');
assert.equal(resolveDrivingSide({ countryCode: 'JP' }).driveOnLeft, true, 'Japan traffic must use left-side lanes.');

const motorwayFeature = {
  id: 'pedestrian-prohibited-motorway',
  width: 10.8,
  type: 'motorway',
  transportRecord: motorwayRecord,
  transportGraphRef: { walkable: false }
};
const prohibitedPedestrianGraph = compilePedestrianGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -50, y: 0, z: 0 },
      p2: { x: 50, y: 0, z: 0 },
      segIndex: 0,
      direction: 'forward',
      feature: motorwayFeature
    }]
  }
}).publication;
assert.equal(prohibitedPedestrianGraph.edges.length, 0, 'Motorway must publish no inferred sidewalks or crossings.');
assert.equal(prohibitedPedestrianGraph.diagnostics.excludedNonPedestrianSegments, 1, 'Pedestrian exclusion must be observable.');

const connectedBridgeFeature = {
  pts: [{ x: 0, z: 0 }, { x: 0, z: 100 }],
  width: 8,
  type: 'primary',
  structureSemantics: { terrainMode: 'elevated', isBridge: true },
  transportRecord: { completeness: 'lossless', routeState: 'complete' },
  transportGraphRef: {
    totalDistance: 100,
    stations: [{ distanceAlong: 0 }]
  },
  connectedFeatures: { start: [{ feature: {} }], end: [] },
  transportStructureRef: {
    featureId: 'connected-bridge',
    start: { state: 'surface_transition' },
    end: { state: 'open_boundary' },
    specification: { deckThickness: 0.8 }
  },
  transportSurfaceModel: {
    width: 8,
    distances: new Float32Array([0, 100]),
    centerHeights: new Float32Array([6, 6]),
    leftHeights: new Float32Array([6, 6]),
    rightHeights: new Float32Array([6, 6]),
    stats: { maximumFill: 6 }
  }
};
const connectedAssembly = compileElevatedAssembly(connectedBridgeFeature, () => 0);
assert.equal(connectedAssembly.abutments.some((abutment) => abutment.endpoint === 'start'), false, 'Connected bridge endpoint must not publish an abutment wall.');

const crossingRoad = {
  pts: [{ x: -20, z: 0 }, { x: 20, z: 0 }],
  width: 8,
  transportSurfaceModel: {
    width: 8,
    pathDistances: new Float32Array([0, 40]),
    distances: new Float32Array([0, 40]),
    centerHeights: new Float32Array([0, 0]),
    leftHeights: new Float32Array([0, 0]),
    rightHeights: new Float32Array([0, 0])
  }
};
assert.equal(supportSpanConflictsWithDriveableRoad(connectedBridgeFeature, {
  x: 0,
  z: 0,
  tangentX: 0,
  tangentZ: 1,
  bottomY: 3.5,
  topY: 4,
  halfSpan: 6,
  roads: [crossingRoad]
}), true, 'Low bridge support span must be rejected above a drive corridor.');

const fixtureFeature = {
  id: 'verification-road',
  width: 10,
  type: 'residential',
  transportRecord: {
    crossSection: { widthMeters: 10, lanes: 2, lanesSource: 'mapped' },
    speed: { metersPerSecond: 10 },
    completeness: 'lossless'
  }
};
const fixtureGraph = compileTrafficGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -50, y: 0, z: 0 },
      p2: { x: 50, y: 0, z: 0 },
      segIndex: 0,
      direction: 'both',
      feature: fixtureFeature
    }]
  }
}).publication;
const fixtureAnchors = parkedVehicleAnchors(fixtureGraph, { x: -30, z: 0 }, {
  count: 2,
  minDistance: 8,
  maxDistance: 80,
  worldIdentity: 'actor-vehicle-verification'
});
assert.equal(fixtureGraph.schemaVersion, 2, 'Traffic graph must publish the curb-vector schema.');
assert.ok(fixtureGraph.edges.every((edge) => Math.abs(Math.hypot(edge.curbNormalX, edge.curbNormalZ) - 1) < 1e-6), 'Every traffic lane must publish a normalized outward curb vector.');
assert.ok(fixtureAnchors.length > 0, 'A road with enough curb space must produce a parked vehicle.');
assert.ok(fixtureAnchors.every((anchor) => anchor.curbOffset - anchor.variant.width * .5 >= anchor.laneOffset - .001), 'Parked vehicle bodies must remain outside the moving lane center.');

const root = process.cwd();
const requestedRoot = String(process.env.WE3D_VERIFY_ROOT || '').trim();
const servedRoot = requestedRoot ? path.resolve(root, requestedRoot) : root;
const server = await startStaticServer({ rootDir: servedRoot, ports: [4398, 4399, 4400, 4401] });
const baseUrl = `http://127.0.0.1:${server.port}`;
const evidenceDir = path.join(root, 'output', 'verification', 'actors-vehicles');
const captureDir = path.join(root, 'output', 'release-evidence', 'current', 'actors-vehicles');
const capture = process.env.WE3D_CAPTURE_RELEASE_EVIDENCE === '1';
await fs.mkdir(evidenceDir, { recursive: true });
if (capture) await fs.mkdir(captureDir, { recursive: true });

const locations = [
  { id: 'baltimore', name: 'Baltimore', lat: 39.2898, lon: -76.6102, driveOnLeft: false },
  { id: 'london', name: 'London', lat: 51.5074, lon: -0.1278, driveOnLeft: true },
  { id: 'tokyo', name: 'Tokyo', lat: 35.6762, lon: 139.6503, driveOnLeft: true }
];
const requested = new Set(String(process.env.WE3D_ACTOR_VEHICLE_LOCATIONS || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const selectedLocations = requested.size ? locations.filter((location) => requested.has(location.id)) : locations;
assert.ok(selectedLocations.length > 0, 'No actor/vehicle verification locations selected.');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const location of selectedLocations) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    const localFailures = [];
    page.on('pageerror', (error) => browserErrors.push(String(error?.stack || error)));
    page.on('response', (response) => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        localFailures.push({ status: response.status(), url: response.url() });
      }
    });
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(baseUrl)) localFailures.push({ reason: request.failure()?.errorText || 'failed', url: request.url() });
    });
    try {
      const params = new URLSearchParams({
        loc: 'custom', lat: String(location.lat), lon: String(location.lon), lname: location.name,
        launch: 'earth', gm: 'free', mode: 'walk'
      });
      await page.goto(`${baseUrl}/app/?${params}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__WE3D_RUNTIME_READY__ === true, null, { timeout: 120000 });
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.waitForFunction(() => {
        const diagnostics = globalThis.getWorldExplorerRuntimeDiagnostics?.() || {};
        return diagnostics.gameStarted === true && diagnostics.worldLoading === false &&
          diagnostics.livingWorld?.active === true && diagnostics.urbanSandbox?.active === true;
      }, null, { timeout: 360000 });
      await page.waitForTimeout(5000);
      const environmentButton = page.getByRole('button', { name: 'Environment controls' });
      if (await environmentButton.isVisible().catch(() => false)) {
        await environmentButton.click();
        await page.locator('#fTimeOfDay').click();
        await page.waitForTimeout(1000);
      }
      const first = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
      await page.waitForTimeout(4000);
      const second = await page.evaluate(() => globalThis.getWorldExplorerRuntimeDiagnostics?.());
      const vehicles = second?.urbanSandbox?.vehicles || [];
      const envelopes = vehicles.map((vehicle) => ({
        id: vehicle.id,
        dimensions: vehicle.dimensionsMeters,
        envelope: vehicle.visualEnvelopeMeters,
        parking: vehicle.parking
      }));
      const population = second?.livingWorld?.population || {};
      const firstVisibleVehicles = Number(first?.livingWorld?.activePopulation?.vehicles || 0) + Number(first?.livingWorld?.activePopulation?.promotedVehicles || 0);
      const secondVisibleVehicles = Number(second?.livingWorld?.activePopulation?.vehicles || 0) + Number(second?.livingWorld?.activePopulation?.promotedVehicles || 0);
      const firstVisiblePeople = Number(first?.livingWorld?.activePopulation?.pedestrians || 0) + Number(first?.livingWorld?.activePopulation?.promotedPedestrians || 0);
      const secondVisiblePeople = Number(second?.livingWorld?.activePopulation?.pedestrians || 0) + Number(second?.livingWorld?.activePopulation?.promotedPedestrians || 0);
      const checks = {
        canonicalFarNpc: population.pedestrianRepresentation === 'articulated-instanced-character-v2' && population.pedestrianLegacyBlockFallback === false,
        articulatedFarNpc: Number(population.pedestrianRenderedParts || 0) >= 17,
        peopleRemainPublished: firstVisiblePeople > 0 && secondVisiblePeople > 0,
        trafficRemainsPublished: firstVisibleVehicles > 0 && secondVisibleVehicles > 0,
        detailedVehiclesPresent: vehicles.length > 0,
        parkedCarsOutsideTravelLane: vehicles.filter((vehicle) => vehicle.parking).every((vehicle) => vehicle.parking.fullyOutsideTravelLane === true),
        correctJurisdictionLaneSide: second?.livingWorld?.trafficGraph?.provenance?.driveOnLeft === location.driveOnLeft,
        noTrafficDirectionViolations: Number(second?.livingWorld?.trafficGraph?.directionViolations || 0) === 0,
        noTrafficLaneSideViolations: Number(second?.livingWorld?.trafficGraph?.laneSideViolations || 0) === 0,
        noPedestriansOnMotorways: Number(second?.livingWorld?.pedestrianGraph?.prohibitedMotorwayEdges || 0) === 0,
        vehicleHeightFitsCatalog: envelopes.filter((entry) => entry.envelope && entry.dimensions).every((entry) => entry.envelope.height <= entry.dimensions.height + .08 && entry.envelope.roofOverflow <= .08),
        vehicleWidthFitsCatalog: envelopes.filter((entry) => entry.envelope && entry.dimensions).every((entry) => entry.envelope.width <= entry.dimensions.width + .12),
        noRuntimeErrors: (second?.runtimeErrors || []).length === 0,
        noBrowserErrors: browserErrors.length === 0,
        noFailedLocalResources: localFailures.length === 0
      };
      if (capture && Object.values(checks).every(Boolean)) {
        await page.screenshot({ path: path.join(captureDir, `${location.id}.png`) });
      }
      results.push({ id: location.id, ok: Object.values(checks).every(Boolean), checks, firstVisibleVehicles, secondVisibleVehicles, firstVisiblePeople, secondVisiblePeople, envelopes, browserErrors, localFailures });
    } catch (error) {
      results.push({ id: location.id, ok: false, error: String(error?.stack || error), browserErrors, localFailures });
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
  contract: 'current-rendered-actors-and-vehicles',
  captureEnabled: capture,
  results
};
await fs.writeFile(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, `Actor/vehicle verification failed; see ${path.relative(root, path.join(evidenceDir, 'report.json'))}`);
