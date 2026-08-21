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
import {
  applyPublishedTransportSurfaceControls,
  compileSharedTransportSurfacePresentations
} from '../../app/js/world/transport-surface-controls.js';
import {
  buildFeatureStations,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from '../../app/js/structure-semantics.js';
import { selectSpatiallyDistributedContextTiles } from '../../app/js/terrain/far-field-mapped-context.js';

// This verification is derived from the current actor/vehicle product
// requirements. It does not inherit screenshot baselines or legacy tests.
assert.equal(URBAN_VEHICLE_CATALOG, PARKED_VEHICLE_CATALOG, 'Parked vehicles must use the canonical parkable catalog.');

const farContextFixtureTiles = Array.from({ length: 20 }, (_, x) =>
  Array.from({ length: 20 }, (_entry, y) => ({ x, y }))
).flat();
const admittedFarContextTiles = selectSpatiallyDistributedContextTiles(farContextFixtureTiles, 160);
assert.equal(admittedFarContextTiles.length, 160, 'Far-context provider admission must enforce its tile budget before fetch.');
assert.equal(
  new Set(admittedFarContextTiles.map((tile) => `${tile.x}/${tile.y}`)).size,
  admittedFarContextTiles.length,
  'Far-context tile admission must not duplicate provider requests.'
);
assert.ok(
  Math.min(...admittedFarContextTiles.map((tile) => tile.x)) === 0 &&
    Math.max(...admittedFarContextTiles.map((tile) => tile.x)) === 19 &&
    Math.min(...admittedFarContextTiles.map((tile) => tile.y)) === 0 &&
    Math.max(...admittedFarContextTiles.map((tile) => tile.y)) === 19,
  'Far-context tile admission must preserve all outer directions.'
);

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

const controlledBridgeRoad = {
  name: 'Fixture Bridge',
  sourceFeatureId: 'fixture:bridge:road',
  pts: [{ x: 2, z: 0 }, { x: 2, z: 100 }],
  structureSemantics: { terrainMode: 'elevated' }
};
const unrelatedBridgeRoad = {
  name: 'Other Bridge',
  sourceFeatureId: 'fixture:other:road',
  pts: [{ x: 3, z: 0 }, { x: 3, z: 100 }],
  structureSemantics: { terrainMode: 'elevated' }
};
const publishedControlBinding = applyPublishedTransportSurfaceControls({
  controls: [{
    id: 'fixture-published-clearance',
    physicalSurfaceKind: 'bridge_deck',
    match: {
      mappedName: 'Fixture Bridge',
      terrainMode: 'elevated',
      maximumDistanceFromReferencePathMeters: 10
    },
    vertical: {
      kind: 'minimum_clearance_above_mapped_water',
      clearanceMeters: 20,
      referenceDatum: 'published_fixture_datum',
      measurementStatus: 'published_reference_not_surveyed_scene_elevation',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/fixture-authority'
    }
  }],
  roads: [controlledBridgeRoad, unrelatedBridgeRoad],
  referencePath: [{ x: 0, z: 0 }, { x: 0, z: 100 }]
});
assert.equal(publishedControlBinding.appliedRoads, 1, 'Published vertical control must bind only to the matched mapped bridge identity.');
assert.equal(controlledBridgeRoad.transportSurfaceControl?.authority, 'published_transport_surface_control');
assert.equal(unrelatedBridgeRoad.transportSurfaceControl, undefined, 'Nearby unrelated bridge identity must retain its own authority.');
controlledBridgeRoad.width = 10;
controlledBridgeRoad.surfaceBias = 0.08;
controlledBridgeRoad.structureSemantics = {
  terrainMode: 'elevated',
  gradeSeparated: true,
  isBridge: true,
  featureCategory: 'road',
  deckClearance: 8
};
const controlledStations = buildFeatureStations(controlledBridgeRoad, {
  features: [],
  waterAreas: [{
    pts: [
      { x: -10, z: 40 },
      { x: 10, z: 40 },
      { x: 10, z: 60 },
      { x: -10, z: 60 }
    ],
    surfaceY: 0
  }],
  sampleTerrainY: () => 0
});
assert.ok(controlledStations.some((station) =>
  station.source === 'water_crossing_published_reference_control'
), 'Published clearance must remain a mapped-water station lower bound.');
assert.equal(
  controlledBridgeRoad.minimumStructureSurfaceY,
  undefined,
  'A mid-span clearance reference must not become a global endpoint elevation floor.'
);
const completeBridgeRoad = {
  name: 'Complete Fixture Bridge',
  sourceFeatureId: 'fixture:complete:bridge',
  width: 10,
  surfaceBias: 0.08,
  pts: [{ x: 0, z: 0 }, { x: 0, z: 2000 }],
  structureSemantics: {
    terrainMode: 'elevated',
    gradeSeparated: true,
    isBridge: true,
    featureCategory: 'road',
    deckClearance: 8
  },
  structureTransitionAnchors: [
    { distance: 0, targetSurfaceY: 0.08, source: 'transport_graph_node', endpoint: 'start' },
    { distance: 2000, targetSurfaceY: 0.08, source: 'transport_graph_node', endpoint: 'end' }
  ]
};
applyPublishedTransportSurfaceControls({
  controls: [{
    id: 'fixture-complete-clearance',
    physicalSurfaceKind: 'bridge_deck',
    match: {
      mappedName: 'Complete Fixture Bridge',
      terrainMode: 'elevated',
      maximumDistanceFromReferencePathMeters: 10
    },
    vertical: {
      kind: 'minimum_clearance_above_mapped_water',
      clearanceMeters: 67,
      referenceDatum: 'published_fixture_datum',
      measurementStatus: 'published_reference_not_surveyed_scene_elevation',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/fixture-authority'
    }
  }],
  roads: [completeBridgeRoad],
  referencePath: completeBridgeRoad.pts
});
completeBridgeRoad.structureStations = buildFeatureStations(completeBridgeRoad, {
  features: [],
  waterAreas: [{
    pts: [
      { x: -20, z: 900 },
      { x: 20, z: 900 },
      { x: 20, z: 1100 },
      { x: -20, z: 1100 }
    ],
    surfaceY: 0
  }],
  sampleTerrainY: () => 0
});
updateFeatureSurfaceProfile(completeBridgeRoad, () => 0, { surfaceBias: 0.08 });
assert.ok(
  sampleFeatureSurfaceY(completeBridgeRoad, 0, 1000) >= 67,
  'Mapped mid-span water clearance must remain enforced on the compiled surface.'
);
assert.ok(
  Math.abs(sampleFeatureSurfaceY(completeBridgeRoad, 0, 0) - 0.08) <= 0.001 &&
    Math.abs(sampleFeatureSurfaceY(completeBridgeRoad, 0, 2000) - 0.08) <= 0.001,
  'Complete mapped bridge endpoints must remain tied to their transport graph surfaces.'
);

const directionalBridgeRoads = [
  {
    name: 'Shared Fixture Bridge',
    sourceFeatureId: 'fixture:shared:northbound',
    pts: [{ x: -4, z: 0 }, { x: -4, z: 100 }],
    structureSemantics: { terrainMode: 'elevated' },
    baseY: 20
  },
  {
    name: 'Shared Fixture Bridge',
    sourceFeatureId: 'fixture:shared:southbound',
    pts: [{ x: 4, z: 100 }, { x: 4, z: 0 }],
    structureSemantics: { terrainMode: 'elevated' },
    baseY: 20
  }
];
applyPublishedTransportSurfaceControls({
  controls: [{
    id: 'fixture-shared-surface',
    physicalSurfaceKind: 'bridge_deck',
    match: {
      mappedName: 'Shared Fixture Bridge',
      terrainMode: 'elevated',
      maximumDistanceFromReferencePathMeters: 10
    },
    horizontal: {
      kind: 'shared_directional_carriageway_surface',
      widthMeters: 19,
      lanes: 6,
      requiredDirectionalMembers: 2,
      measurementStatus: 'published_reference_not_surveyed_scene_width',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/fixture-authority'
    },
    vertical: {
      kind: 'minimum_clearance_above_mapped_water',
      clearanceMeters: 20,
      referenceDatum: 'published_fixture_datum',
      measurementStatus: 'published_reference_not_surveyed_scene_elevation',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/fixture-authority'
    }
  }],
  roads: directionalBridgeRoads,
  referencePath: [{ x: 0, z: 0 }, { x: 0, z: 100 }]
});
const sharedSurfaceCompilation = compileSharedTransportSurfacePresentations(
  directionalBridgeRoads,
  (road) => road.baseY
);
assert.equal(sharedSurfaceCompilation.groups, 1, 'Two mapped directions must compile one shared physical surface.');
assert.equal(sharedSurfaceCompilation.memberRoads, 2, 'Both directional identities must remain members of the shared surface.');
assert.equal(
  directionalBridgeRoads[0].transportSurfacePresentation,
  directionalBridgeRoads[1].transportSurfacePresentation,
  'Directional traversal records must reference one physical presentation authority.'
);
assert.equal(directionalBridgeRoads[0].transportSurfacePresentation.width, 19);
assert.equal(directionalBridgeRoads[0].transportSurfacePresentation.pts[0].x, 0);
assert.equal(directionalBridgeRoads[0].transportSurfacePresentation.authority, 'compiled_transport_surface_group');

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

const ordinaryRoadPedestrianGraph = compilePedestrianGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -50, y: 0, z: 0 },
      p2: { x: 50, y: 0, z: 0 },
      segIndex: 0,
      direction: 'both',
      feature: { id: 'ordinary-road', kind: 'road', type: 'residential', walkable: true }
    }]
  }
}).publication;
assert.equal(ordinaryRoadPedestrianGraph.edges.length, 0, 'Vehicle roads must never fabricate pedestrian sidewalks or crossings.');

const narrowTrafficGraph = compileTrafficGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -20, y: 0, z: 0 },
      p2: { x: 20, y: 0, z: 0 },
      segIndex: 0,
      direction: 'both',
      feature: {
        id: 'building-constrained-road',
        kind: 'road',
        networkKind: 'road',
        width: 3.6,
        driveable: false,
        transportRecord: { crossSection: { widthMeters: 5, widthSource: 'fallback:road-class' } }
      }
    }]
  }
}).publication;
assert.equal(narrowTrafficGraph.edges.length, 0, 'Traffic must not inflate or enter a building-constrained narrow road.');

const mappedPedestrianGraph = compilePedestrianGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -20, y: 0, z: 0 },
      p2: { x: 20, y: 0, z: 0 },
      segIndex: 0,
      direction: 'both',
      feature: {
        id: 'mapped-footway',
        kind: 'footway',
        networkKind: 'footway',
        walkable: true,
        structureSemantics: { terrainMode: 'at_grade', structureKind: 'at_grade' }
      }
    }]
  }
}).publication;
assert.equal(mappedPedestrianGraph.edges.length, 2, 'A mapped at-grade pedestrian path must remain eligible.');
assert.equal(mappedPedestrianGraph.provenance.mappedPaths, 2, 'Mapped pedestrian provenance must remain observable.');

const mappedBridgePedestrianGraph = compilePedestrianGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: -20, y: 8, z: 0 },
      p2: { x: 20, y: 8, z: 0 },
      segIndex: 0,
      direction: 'both',
      feature: {
        id: 'unassociated-footway-bridge',
        kind: 'footway',
        networkKind: 'footway',
        walkable: true,
        structureSemantics: { terrainMode: 'elevated', structureKind: 'bridge' }
      }
    }]
  }
}).publication;
assert.equal(mappedBridgePedestrianGraph.edges.length, 0, 'An unassociated pedestrian bridge path must fail closed.');

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

const slopedFixtureGraph = compileTrafficGraph({
  traversal: {
    authority: 'actor-vehicle-verification',
    segments: [{
      p1: { x: 0, y: 0, z: 0 },
      p2: { x: 0, y: 10, z: 100 },
      segIndex: 0,
      sourceTStart: 0,
      sourceTEnd: 1,
      direction: 'forward',
      feature: fixtureFeature
    }]
  },
  sampleSurface: (_feature, _x, _z, projected) => Number(projected?.t || 0) * 10
}).publication;
const expectedSlopePitch = -Math.atan2(10, 100);
assert.ok(Math.abs(slopedFixtureGraph.edges[0].surfacePitch - expectedSlopePitch) < 1e-6, 'Traffic edge must retain its directed road pitch.');
const slopedFixtureAnchors = parkedVehicleAnchors(slopedFixtureGraph, { x: 20, z: 50 }, {
  count: 1,
  minDistance: 8,
  maxDistance: 80,
  worldIdentity: 'sloped-actor-vehicle-verification'
});
assert.ok(slopedFixtureAnchors.length === 1 && Math.abs(slopedFixtureAnchors[0].pitch - expectedSlopePitch) < 1e-6, 'Parked vehicle must consume the traffic edge pitch.');

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
  { id: 'london', name: 'London', lat: 51.5074, lon: -0.1278, driveOnLeft: true, requiresSlopedTraffic: true },
  { id: 'monaco', name: 'Monaco', lat: 43.7384, lon: 7.4246, driveOnLeft: false, requiresSlopedTraffic: true },
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
      const activePopulation = second?.livingWorld?.activePopulation || {};
      const pedestrianGraph = second?.livingWorld?.pedestrianGraph || {};
      const trafficGraph = second?.livingWorld?.trafficGraph || {};
      const firstVisibleVehicles = Number(first?.livingWorld?.activePopulation?.vehicles || 0) + Number(first?.livingWorld?.activePopulation?.promotedVehicles || 0);
      const secondVisibleVehicles = Number(second?.livingWorld?.activePopulation?.vehicles || 0) + Number(second?.livingWorld?.activePopulation?.promotedVehicles || 0);
      const firstVisiblePeople = Number(first?.livingWorld?.activePopulation?.pedestrians || 0) + Number(first?.livingWorld?.activePopulation?.promotedPedestrians || 0);
      const secondVisiblePeople = Number(second?.livingWorld?.activePopulation?.pedestrians || 0) + Number(second?.livingWorld?.activePopulation?.promotedPedestrians || 0);
      const checks = {
        canonicalFarNpc: Number(population.pedestrians || 0) === 0 ||
          population.pedestrianRepresentation === 'articulated-instanced-character-v2' && population.pedestrianLegacyBlockFallback === false,
        articulatedFarNpc: Number(population.pedestrians || 0) === 0 || Number(population.pedestrianRenderedParts || 0) >= 17,
        pedestrianPopulationRequiresMappedPaths:
          Number(pedestrianGraph.provenance?.mappedPaths || 0) > 0
            ? firstVisiblePeople > 0 && secondVisiblePeople > 0
            : Number(population.pedestrians || 0) === 0 && firstVisiblePeople === 0 && secondVisiblePeople === 0,
        trafficRemainsPublished: firstVisibleVehicles > 0 && secondVisibleVehicles > 0,
        detailedVehiclesPresent:
          vehicles.length > 0 ||
          (
            firstVisibleVehicles > 0 && secondVisibleVehicles > 0 &&
            Number(population.vehicleRenderedParts || 0) >= 17 &&
            Array.isArray(population.vehicleDimensions) && population.vehicleDimensions.length > 0
          ),
        articulatedTrafficVehicles:
          Number(population.vehicles || 0) === 0 ||
          Number(population.vehicleRenderedParts || 0) >= 17,
        parkedCarsOutsideTravelLane: vehicles.filter((vehicle) => vehicle.parking).every((vehicle) => vehicle.parking.fullyOutsideTravelLane === true),
        vehicleRoadAttitudeMatches:
          Number(activePopulation.vehicleAttitudeMismatches || 0) === 0 &&
          vehicles.every((vehicle) => Math.abs(Number(vehicle.pitch || 0) - Number(vehicle.renderedPitch || 0)) <= 0.001),
        slopedTrafficAttitudePublished:
          location.requiresSlopedTraffic !== true ||
          Number(trafficGraph.diagnostics?.slopedEdges || 0) > 0 &&
          Number(activePopulation.slopedVehicles || 0) > 0,
        correctJurisdictionLaneSide: second?.livingWorld?.trafficGraph?.provenance?.driveOnLeft === location.driveOnLeft,
        noTrafficDirectionViolations: Number(second?.livingWorld?.trafficGraph?.directionViolations || 0) === 0,
        noTrafficLaneSideViolations: Number(second?.livingWorld?.trafficGraph?.laneSideViolations || 0) === 0,
        noPedestriansOnVehicleTransport:
          Number(pedestrianGraph.vehicleTransportEdges || 0) === 0 &&
          Number(pedestrianGraph.engineeredTransportEdges || 0) === 0 &&
          Number(pedestrianGraph.provenance?.inferredSidewalks || 0) === 0 &&
          Number(pedestrianGraph.provenance?.inferredCrossings || 0) === 0,
        vehicleHeightFitsCatalog: envelopes.filter((entry) => entry.envelope && entry.dimensions).every((entry) => entry.envelope.height <= entry.dimensions.height + .08 && entry.envelope.roofOverflow <= .08),
        vehicleWidthFitsCatalog: envelopes.filter((entry) => entry.envelope && entry.dimensions).every((entry) => entry.envelope.width <= entry.dimensions.width + .12),
        noRuntimeErrors: (second?.runtimeErrors || []).length === 0,
        noBrowserErrors: browserErrors.length === 0,
        noFailedLocalResources: localFailures.length === 0
      };
      if (capture && Object.values(checks).every(Boolean)) {
        await page.screenshot({ path: path.join(captureDir, `${location.id}.png`) });
      }
      results.push({
        id: location.id,
        ok: Object.values(checks).every(Boolean),
        checks,
        firstVisibleVehicles,
        secondVisibleVehicles,
        firstVisiblePeople,
        secondVisiblePeople,
        slopedTrafficEdges: Number(trafficGraph.diagnostics?.slopedEdges || 0),
        slopedVehicles: Number(activePopulation.slopedVehicles || 0),
        vehicleAttitudeMismatches: Number(activePopulation.vehicleAttitudeMismatches || 0),
        envelopes,
        browserErrors,
        localFailures
      });
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
