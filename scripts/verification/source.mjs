import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBundledBuildingMetadata } from '../../app/js/world/preset-building-metadata.js';
import {
  buildingPublicationPriority,
  constrainBuildingWaysToPublicationDomain
} from '../../app/js/world/load-building-detail.js';
import { requiresLoadedRoadCoverageForBuilding } from '../../app/js/world/load-building-pass.js';
import {
  buildWorldOverpassPlan,
  resolveBuildingPublicationBounds
} from '../../app/js/world/osm-loader.js';
import { filterSelectionToAcceptedGround } from '../../app/js/world/compiler/accepted-ground-selection.js';
import { retainRegionalTransportOutsideCore } from '../../app/js/world/fixed-regional-context.js';
import { mergeExactRegionalStructures } from '../../app/js/world/fixed-regional-structures.js';
import { compileTransportNetworkModel } from '../../app/js/world/compiler/transport-network-model.js';
import {
  buildTransportContinuityRepairAnchors,
  buildTransportJunctionProfileAnchors
} from '../../app/js/world/compiler/transport-junction-profile.js';
import { createBuildingRoadFootprintGuards } from '../../app/js/world/building-road-footprint.js';
import {
  roadSegmentIsDriveable,
  roadWidthAtSegment
} from '../../app/js/world/road-cross-section-profile.js';
import { createAcceptedGroundRuntime } from '../../app/js/terrain/accepted-ground-runtime.js';
import { compileGroundArtifact } from '../../app/js/terrain/ground-artifact.js';
import { selectGroundArtifacts } from '../../app/js/terrain/ground-provider-registry.js';
import {
  compileDistrictGroundModel,
  sampleDistrictGroundMeters
} from '../../app/js/world/compiler/district-ground-model.js';
import { createGroundBuildPlan } from '../lib/ground-artifact-builder.mjs';
import { compileTransportSurfaceModel } from '../../app/js/world/compiler/transport-surface-model.js';
import { reconcileExactGraphNodeConstraints } from '../../app/js/world/compiler/transport-surface-profile.js';
import { fetchCompleteArchiveTileBatch } from '../../app/js/world/overture-building-source.js';
import { resolveCustomLocationArrival } from '../../app/js/world/spawn-location-arrival.js';
import { resolveFarBuildingMassing } from '../../app/js/terrain/far-building-massing.js';
import { appendSolidAtGradeRoadGeometry } from '../../app/js/terrain/road-surface-geometry.js';
import { interpolateRenderedTerrainCell } from '../../app/js/terrain/height-sampling.js';
import { stitchTerrainGroupEdges } from '../../app/js/terrain/seams.js';
import {
  computeIntersectionCapRadius,
  shouldBuildCompactIntersectionCap
} from '../../app/js/terrain/road-junctions.js';
import { detectRoadIntersections } from '../../app/js/terrain/intersections.js';
import { createCompiledRoadSurfaceSampler } from '../../app/js/terrain/rebuild.js';
import { compileTrafficGraph } from '../../app/js/living-world/navigation-graphs.js';
import {
  OVERTURE_RELEASE_POLICY,
  overtureThemeArchiveUrl
} from '../../app/js/world/overture-tile-source.js';

const root = process.cwd();
const reportPath = path.join(root, 'output', 'verification', 'source', 'report.json');
const requiredFiles = [
  'index.html',
  'app/index.html',
  'app/js/bootstrap.js',
  'app/js/app-entry.js',
  'app/js/app-shell-fragments.js',
  'app/js/app-auth-shell.js',
  'app/js/runtime-diagnostics.js',
  'scripts/verification/urban-equipment.mjs',
  'scripts/hosting-artifact.mjs',
  'config/verification-policy.json'
];

async function exists(filePath) {
  return fs.stat(filePath).then((stat) => stat.isFile() || stat.isDirectory()).catch(() => false);
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(absolute));
    if (entry.isFile()) result.push(absolute);
  }
  return result;
}

function localReference(baseFile, reference) {
  const value = String(reference || '').trim();
  if (!value || value.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  return pathname.startsWith('/')
    ? path.join(root, pathname.slice(1))
    : path.resolve(path.dirname(baseFile), pathname);
}

async function htmlResourceFailures(filePath) {
  const html = await fs.readFile(filePath, 'utf8');
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  const failures = [];
  for (const reference of references) {
    const target = localReference(filePath, reference);
    if (target && !(await exists(target))) failures.push({ file: path.relative(root, filePath), reference });
  }
  return failures;
}

function moduleReferences(source) {
  const references = [];
  const expressions = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) references.push(match[1]);
  }
  return references;
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const policy = JSON.parse(await fs.readFile(path.join(root, 'config', 'verification-policy.json'), 'utf8'));
assert.equal(policy.status, 'legacy-suite-quarantined');

const stackedGroundManifest = (artifactId, spacingMeters, coverage, providerId = 'usgs-3dep-best-available') => ({
  schemaVersion: 1,
  artifactId,
  providerId,
  sourceRelease: `${artifactId}-release`,
  contentSha256: 'a'.repeat(64),
  spacingMeters,
  coverage,
  verticalDatum: 'EGM2008',
  complete: true,
  missingSampleCount: 0,
  licenseAttested: true,
  correctionAttested: providerId === 'copernicus-dem-classified-ground-v1',
  url: `memory://${artifactId}`
});
const stackedGroundModel = (districtId, spacingMeters, extent, elevationMeters) => {
  const samples = [];
  for (let row = -extent; row <= extent; row += 1) {
    for (let column = -extent; column <= extent; column += 1) {
      samples.push({
        column,
        row,
        available: true,
        rawElevationMeters: elevationMeters,
        groundElevationMeters: elevationMeters,
        confidence: 1,
        correctionReason: 'verification-fixture',
        provenance: 'verification-fixture'
      });
    }
  }
  return compileDistrictGroundModel({
    districtId,
    sourceClassification: 'accepted-ground',
    verticalDatum: 'EGM2008',
    minimumConfidence: 0.75,
    grid: {
      spacingMeters,
      minColumn: -extent,
      maxColumn: extent,
      minRow: -extent,
      maxRow: extent
    },
    samples
  });
};
const fineGroundManifest = stackedGroundManifest(
  'fine-ground', 100,
  { south: -0.001, north: 0.001, west: -0.001, east: 0.001 }
);
const regionalGroundManifest = stackedGroundManifest(
  'regional-ground', 1000,
  { south: -0.02, north: 0.02, west: -0.02, east: 0.02 }
);
const competingGroundManifest = stackedGroundManifest(
  'competing-ground', 10,
  { south: -0.02, north: 0.02, west: -0.02, east: 0.02 },
  'copernicus-dem-classified-ground-v1'
);
const groundFixtures = {
  'fine-ground': stackedGroundModel('fine-ground', 100, 1, 11),
  'regional-ground': stackedGroundModel('regional-ground', 1000, 2, 22)
};
const stackedGroundRuntime = createAcceptedGroundRuntime({
  loadArtifact: async ({ manifest }) => ({
    status: 'accepted',
    artifactId: manifest.artifactId,
    providerId: manifest.providerId,
    sourceRelease: manifest.sourceRelease,
    contentSha256: manifest.contentSha256,
    verticalDatum: manifest.verticalDatum,
    model: groundFixtures[manifest.artifactId]
  })
});
const stackedGroundState = await stackedGroundRuntime.prepare({
  latitude: 0,
  longitude: 0,
  manifests: [competingGroundManifest, regionalGroundManifest, fineGroundManifest]
});
assert.equal(stackedGroundState.status, 'accepted');
assert.deepEqual(stackedGroundState.artifactIds, ['fine-ground', 'regional-ground']);
assert.equal(stackedGroundRuntime.sampleAtLatLon(0, 0).artifactId, 'fine-ground');
assert.equal(stackedGroundRuntime.sampleAtLatLon(0.01, 0.01).artifactId, 'regional-ground');

const groundAuthorityFailures = [];
const tokyoProfileDistances = new Float64Array([
  0,
  4144.7264849555095,
  4642.19534474774
]);
const tokyoProfileFeature = {
  structureTransitionAnchors: [
    {
      distance: 4144.7264849555095,
      targetSurfaceY: 57.59303665161133,
      span: 500,
      source: 'transport_graph_node'
    },
    {
      // The graph endpoint is 0.000207 m beyond the canonicalized compiled
      // profile endpoint, matching the real Tokyo elevated motorway case.
      distance: 4642.195552237722,
      targetSurfaceY: 27.744892614678577,
      span: 500,
      source: 'transport_graph_node'
    }
  ],
  structureStations: []
};
const tokyoProfileResult = reconcileExactGraphNodeConstraints(
  tokyoProfileFeature,
  new Float32Array([36, 40, 28]),
  tokyoProfileDistances,
  new Float64Array([Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]),
  0.06
);
if (Math.abs(tokyoProfileResult[1] - 57.59303665161133) > 1e-4 ||
    Math.abs(tokyoProfileResult[2] - 27.744892614678577) > 1e-4) {
  groundAuthorityFailures.push(
    'sub-millimetre graph/profile endpoint round-off discarded a design-grade-feasible elevated corridor'
  );
}
const mockAttribute = (values) => ({
  values,
  count: values.length,
  needsUpdate: false,
  getX(index) { return this.values[index].x; },
  getY(index) { return this.values[index].y; },
  getZ(index) { return this.values[index].z; },
  setY(index, value) { this.values[index].y = value; },
  setXYZ(index, x, y, z) { this.values[index] = { x, y, z }; }
});
const mockTerrainMesh = (tx, centerX, edgeHeight) => ({
  position: { x: centerX, y: 0, z: 0 },
  userData: {
    isTerrainMesh: true,
    pendingTerrainTile: false,
    terrainTile: { z: 14, tx, ty: 0 }
  },
  geometry: {
    attributes: {
      position: mockAttribute([
        { x: -0.5, y: edgeHeight, z: -0.5 },
        { x: 0.5, y: edgeHeight, z: -0.5 },
        { x: -0.5, y: edgeHeight, z: 0.5 },
        { x: 0.5, y: edgeHeight, z: 0.5 }
      ]),
      normal: mockAttribute(Array.from({ length: 4 }, () => ({ x: 0, y: 1, z: 0 })))
    },
    computeVertexNormals() {}
  }
});
const leftTerrainFixture = mockTerrainMesh(0, 0.5, 0);
const rightTerrainFixture = mockTerrainMesh(1, 1.5, 2);
const terrainSeamFixture = stitchTerrainGroupEdges({
  TERRAIN_SEGMENTS: 1,
  terrainGroup: { children: [leftTerrainFixture, rightTerrainFixture] }
});
if (terrainSeamFixture.authority !== 'one-shared-world-height-per-terrain-edge-coordinate' ||
    terrainSeamFixture.sharedVertices !== 2 ||
    leftTerrainFixture.geometry.attributes.position.getY(1) !== 1 ||
    leftTerrainFixture.geometry.attributes.position.getY(3) !== 1 ||
    rightTerrainFixture.geometry.attributes.position.getY(0) !== 1 ||
    rightTerrainFixture.geometry.attributes.position.getY(2) !== 1) {
  groundAuthorityFailures.push(
    'terrain finalization did not publish one shared height for adjacent tile edge coordinates'
  );
}
const renderedTerrainCellFixture = [
  { sx: 0.25, sz: 0.25, expected: 7.5 },
  { sx: 0.75, sz: 0.75, expected: 7.5 },
  { sx: 0.25, sz: 0.75, expected: 17.5 }
];
if (renderedTerrainCellFixture.some(({ sx, sz, expected }) =>
  Math.abs(interpolateRenderedTerrainCell(sx, sz, 0, 10, 20, 0) - expected) > 1e-9
)) {
  groundAuthorityFailures.push(
    'CPU terrain height did not match the two rendered PlaneGeometry triangle planes'
  );
}
let appliedRuralArrival = null;
const ruralMappedApproach = {
  valid: true,
  mode: 'walk',
  x: 0,
  z: 176.2245,
  road: Object.freeze({
    id: 'verification:rural-mapped-road',
    structureSemantics: Object.freeze({ terrainMode: 'at_grade' })
  })
};
resolveCustomLocationArrival({
  appCtx: {
    LOC: { lat: 42.08, lon: -93.87 },
    customLoc: { arrivalMode: 'walk' },
    roads: [ruralMappedApproach.road],
    Walk: { state: { walker: { angle: 0 } } },
    worldLoadRuntimeState: { surfaceDomain: { kind: 'land' } }
  },
  applyResolvedWorldSpawn: (spawn) => {
    appliedRuralArrival = spawn;
    return spawn;
  },
  applySpawnTarget: () => null,
  featuredArrivalNear: () => null,
  findGradeSeparatedRoadAt: () => null,
  isSubgradeArrival: (spawn) => spawn?.road?.structureSemantics?.terrainMode === 'subgrade',
  resolveSafeWorldSpawn: () => null,
  searchNearestSafeRoadSpawn: () => ruralMappedApproach,
  tryAutoEnterBoatAt: () => null
}, 'walk', { source: 'verification:rural-arrival' });
if (
  appliedRuralArrival !== ruralMappedApproach ||
  appliedRuralArrival?.source !== 'verification:rural-arrival'
) {
  groundAuthorityFailures.push(
    'fixed-location walk arrival discarded the nearest safe mapped approach outside the retired 160 m cutoff'
  );
}
const hillsideRoadFixture = {
  id: 'verification:hillside-road',
  width: 10,
  pts: [{ x: 0, z: 0 }, { x: 40, z: 0 }],
  structureSemantics: { terrainMode: 'at_grade' }
};
const hillsideRoadSurface = compileTransportSurfaceModel(
  hillsideRoadFixture,
  (x, z) => 10 + x * 0.02 + Math.max(0, z) * 4,
  { sampleStep: 2 }
);
if (
  hillsideRoadSurface.endpointPolicy !== 'compiled_centerline_terrain_fit' ||
  Math.abs(
    Number(hillsideRoadSurface.centerHeights[0]) -
    (Number(hillsideRoadSurface.groundHeights[0]) + Number(hillsideRoadSurface.surfaceBias))
  ) > 0.2 ||
  Math.abs(
    Number(hillsideRoadSurface.leftHeights[0]) -
    Number(hillsideRoadSurface.rightHeights[0])
  ) > 1e-6 ||
  Number(hillsideRoadSurface.leftGround[0]) -
    Number(hillsideRoadSurface.groundHeights[0]) < 15
) {
  groundAuthorityFailures.push(
    'at-grade road publication no longer preserves one centerline-fitted planar surface on a steep lateral terrain cell'
  );
}
const groundCatalog = JSON.parse(await fs.readFile(
  path.join(root, 'app/assets/ground/manifest-catalog.json'),
  'utf8'
));
const newYorkSelection = selectGroundArtifacts({
  latitude: 40.758,
  longitude: -73.9855,
  manifests: groundCatalog.manifests
});
const newYorkArtifactIds = newYorkSelection.manifests?.map(
  (manifest) => manifest.artifactId
) || [];
if (newYorkSelection.provider?.id !== 'usgs-3dep-best-available' ||
    JSON.stringify(newYorkArtifactIds) !== JSON.stringify([
      'newyork-detail-ground',
      'newyork-regional-ground'
    ])) {
  groundAuthorityFailures.push(
    `New York ground stack is not one reviewed USGS detail/regional authority: ${newYorkArtifactIds.join(',')}`
  );
}
for (const retiredArtifactId of ['holland-tunnel-ground', 'newyork-ground']) {
  if (groundCatalog.manifests.some(
    (manifest) => manifest.artifactId === retiredArtifactId
  )) {
    groundAuthorityFailures.push(
      `retired overlapping ground authority returned to catalog: ${retiredArtifactId}`
    );
  }
}
const newYorkBuildPlan = createGroundBuildPlan({
  districtId: 'newyork-regional-verification',
  centerLatitude: 40.735,
  centerLongitude: -74.006,
  widthMeters: 45000,
  heightMeters: 45000,
  spacingMeters: 320,
  maxSamples: 40000
});
if (newYorkBuildPlan.projectedExtentMeters.widthMeters <= 45000 ||
    newYorkBuildPlan.projectedExtentMeters.heightMeters <= 45000 ||
    newYorkBuildPlan.parts[0].coverage.north - newYorkBuildPlan.parts[0].coverage.south < 0.4 ||
    newYorkBuildPlan.parts[0].coverage.east - newYorkBuildPlan.parts[0].coverage.west < 0.5) {
  groundAuthorityFailures.push(
    'ground build extent no longer compensates for Web Mercator scale at the requested latitude'
  );
}
for (const manifest of groundCatalog.manifests.filter(
  (entry) => newYorkArtifactIds.includes(entry.artifactId)
)) {
  const artifactPath = path.join(
    root,
    'app/assets/ground',
    String(manifest.url).replace(/^\.\//, '')
  );
  const artifactText = await fs.readFile(artifactPath, 'utf8');
  const actualHash = crypto.createHash('sha256').update(artifactText).digest('hex');
  const artifact = JSON.parse(artifactText);
  const compiled = compileGroundArtifact({ manifest, artifact });
  if (actualHash !== manifest.contentSha256 ||
      compiled.status !== 'accepted' ||
      compiled.model?.diagnostics?.encoded !== true) {
    groundAuthorityFailures.push(
      `reviewed compact ground artifact failed integrity/compile: ${manifest.artifactId}`
    );
    continue;
  }
  const sample = sampleDistrictGroundMeters(
    compiled.model,
    compiled.model.grid.minColumn * compiled.model.grid.spacingMeters,
    compiled.model.grid.minRow * compiled.model.grid.spacingMeters
  );
  if (sample?.status !== 'available' ||
      sample.sampleKeys?.some((key) => !/^[-0-9]+:[-0-9]+$/.test(String(key)))) {
    groundAuthorityFailures.push(
      `compact ground sample lost its global grid identity: ${manifest.artifactId}`
    );
  }
}

const localJsonFetch = async (input) => {
  try {
    const json = JSON.parse(await fs.readFile(fileURLToPath(input), 'utf8'));
    return { ok: true, status: 200, json: async () => json };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};
const jfxMetadataWithoutPublicationCoverage = await fetchBundledBuildingMetadata({
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 39.309728,
  lon: -76.621428
});
const jfxMetadataWithPublicationCoverage = await fetchBundledBuildingMetadata({
  coverageRadiusDegrees: 0.022,
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 39.309728,
  lon: -76.621428
});
const ruralMetadataWithPublicationCoverage = await fetchBundledBuildingMetadata({
  coverageRadiusDegrees: 0.022,
  fetchImpl: localJsonFetch,
  locationKey: 'custom',
  lat: 41.878,
  lon: -93.0977
});
const buildingMetadataCoverageFailures = [];
const publicationDomainFixtureNodes = {
  1: { lat: 0, lon: 0 }, 2: { lat: 0, lon: 2 }, 3: { lat: 2, lon: 2 }, 4: { lat: 2, lon: 0 },
  5: { lat: 20, lon: 20 }, 6: { lat: 20, lon: 22 }, 7: { lat: 22, lon: 22 }, 8: { lat: 22, lon: 20 }
};
const publicationDomainFixture = constrainBuildingWaysToPublicationDomain([
  { id: 'inside', nodes: [1, 2, 3, 4, 1], tags: { building: 'yes' } },
  { id: 'outside', nodes: [5, 6, 7, 8, 5], tags: { building: 'yes' } }
], publicationDomainFixtureNodes, {
  visibleRadiusWorld: 10,
  geoToWorld: (lat, lon) => ({ x: lon, z: lat })
});
if (publicationDomainFixture.ways.length !== 1 ||
    publicationDomainFixture.ways[0].id !== 'inside' || publicationDomainFixture.clipped !== 1) {
  buildingMetadataCoverageFailures.push('rectangular provider buildings are not clipped to the circular publication LOD domain');
}
if (!(buildingPublicationPriority({ building: 'ship' }) >
      buildingPublicationPriority({ height: '161', 'building:levels': '40' }) &&
      buildingPublicationPriority({ height: '161', 'building:levels': '40' }) >
      buildingPublicationPriority({ height: '18' }))) {
  buildingMetadataCoverageFailures.push('mapped vessel/tall-building publication priority is not deterministic');
}
if (requiresLoadedRoadCoverageForBuilding({ _geometrySource: 'overture' }) ||
    requiresLoadedRoadCoverageForBuilding({ _geometrySource: 'shortbread-vector' }) ||
    !requiresLoadedRoadCoverageForBuilding({ _geometrySource: 'inferred_road_frontage' })) {
  buildingMetadataCoverageFailures.push('mapped building authority still depends on coarse loaded-road proximity');
}
const representativeBuildingCoverage = [
  { id: 'baltimore-jfx', lat: 39.309728, lon: -76.621428 },
  { id: 'london', lat: 51.5074, lon: -0.1278 },
  { id: 'tokyo', lat: 35.6762, lon: 139.6503 }
].map((location) => ({
  ...location,
  bounds: resolveBuildingPublicationBounds(location, 2700)
}));
for (const coverage of representativeBuildingCoverage) {
  const latitudeWorld = (coverage.bounds.maxLat - coverage.lat) * 100000;
  const longitudeWorld = (coverage.bounds.maxLon - coverage.lon) * 100000 *
    Math.cos(coverage.lat * Math.PI / 180);
  if (Math.abs(latitudeWorld - 2700) > 1e-6 || Math.abs(longitudeWorld - 2700) > 1e-6 ||
      coverage.bounds.authority !== 'building-far-visible-lod') {
    buildingMetadataCoverageFailures.push(`${coverage.id} building provider bounds do not cover the renderer far-visible radius`);
  }
}
const jfxPublicationPlan = buildWorldOverpassPlan({
  location: { lat: 39.309728, lon: -76.621428 },
  roadsRadius: 0.02,
  featureRadiusScale: 1,
  poiRadiusScale: 1,
  buildingVisibleRadiusWorld: 2700,
  overpassTimeoutMs: 30000,
  loadStartedAt: 0,
  maxTotalLoadMs: 62000
});
if (jfxPublicationPlan.buildingPublicationCacheMeta.bounds.minLat > 39.28728605 ||
    jfxPublicationPlan.buildingPublicationCacheMeta.bounds.maxLat < 39.28728605 ||
    jfxPublicationPlan.buildingPublicationCacheMeta.bounds.minLon > -76.6144488 ||
    jfxPublicationPlan.buildingPublicationCacheMeta.bounds.maxLon < -76.6144488) {
  buildingMetadataCoverageFailures.push('JFX far-visible building provider bounds exclude mapped Transamerica identity');
}
if (jfxMetadataWithoutPublicationCoverage !== null) {
  buildingMetadataCoverageFailures.push('JFX origin unexpectedly selects a downtown-only pack without publication coverage');
}
if (jfxMetadataWithPublicationCoverage?._buildingMetadataPackId !== 'baltimore') {
  buildingMetadataCoverageFailures.push('JFX building publication coverage does not select the intersecting Baltimore metadata pack');
}
if (jfxMetadataWithPublicationCoverage?._buildingMetadataSelection?.reason !== 'publication-coverage-intersection') {
  buildingMetadataCoverageFailures.push('JFX metadata pack selection does not record publication-coverage authority');
}
if (ruralMetadataWithPublicationCoverage !== null) {
  buildingMetadataCoverageFailures.push('rural Iowa incorrectly selects an unrelated bundled building metadata pack');
}

const buildingProviderAuthorityFailures = [];

const farBuildingHeightAuthorityFailures = [];
const farFootprint = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: 10, z: 10 },
  { x: -10, z: 10 }
];
const mappedFarTower = resolveFarBuildingMassing({
  identity: 'mapped-tower',
  properties: { building: 'office', height: '417', levels: '104' }
}, farFootprint, 400, 1, { worldSeed: 123 });
if (mappedFarTower?.heightMeters !== 417 || mappedFarTower?.heightSource !== 'explicit_height') {
  farBuildingHeightAuthorityFailures.push('far massing clipped or inferred over an explicit mapped height');
}
const mappedLevelBuilding = resolveFarBuildingMassing({
  identity: 'mapped-level-building',
  properties: { building: 'office', levels: '40' }
}, farFootprint, 400, 1, { worldSeed: 123 });
if (mappedLevelBuilding?.heightMeters !== 128 || mappedLevelBuilding?.heightSource !== 'levels') {
  farBuildingHeightAuthorityFailures.push('far massing did not resolve mapped levels through shared building semantics');
}
const inferredFarA = resolveFarBuildingMassing({
  identity: 'inferred-building',
  properties: { building: 'apartments' }
}, farFootprint, 400, 1, { worldSeed: 456 });
const inferredFarB = resolveFarBuildingMassing({
  identity: 'inferred-building',
  properties: { building: 'apartments' }
}, farFootprint, 400, 1, { worldSeed: 456 });
if (
  inferredFarA?.heightSource !== 'fallback' ||
  inferredFarA?.heightMeters !== inferredFarB?.heightMeters
) {
  farBuildingHeightAuthorityFailures.push('far inferred height is not deterministic under the shared identity/world seed');
}
const overtureReleaseDate = Date.parse(`${OVERTURE_RELEASE_POLICY.release.slice(0, 10)}T00:00:00Z`);
const overtureReviewedDate = Date.parse(`${OVERTURE_RELEASE_POLICY.reviewedOn}T00:00:00Z`);
const verificationDate = Date.parse('2026-08-21T00:00:00Z');
if (OVERTURE_RELEASE_POLICY.authority !== 'build-pinned-reviewed-overture-release' ||
    !Number.isFinite(overtureReleaseDate) || !Number.isFinite(overtureReviewedDate) ||
    overtureReleaseDate > overtureReviewedDate ||
    overtureReviewedDate - overtureReleaseDate > 7 * 24 * 60 * 60 * 1000 ||
    verificationDate - overtureReviewedDate > 45 * 24 * 60 * 60 * 1000 ||
    OVERTURE_RELEASE_POLICY.publicRetentionDays !== 60 ||
    !overtureThemeArchiveUrl('buildings').includes(`/${OVERTURE_RELEASE_POLICY.release}/buildings.pmtiles`)) {
  buildingProviderAuthorityFailures.push('Overture building release is not a current build-pinned reviewed authority');
}
const retryCounts = new Map();
const recoveredTileBatch = await fetchCompleteArchiveTileBatch(
  [{ x: 1, y: 1 }, { x: 2, y: 2 }],
  {
    fetchTile: async (_theme, z, x, y) => {
      const key = `${z}/${x}/${y}`;
      const count = (retryCounts.get(key) || 0) + 1;
      retryCounts.set(key, count);
      if (x === 2 && count === 1) throw new Error('verification transient');
      return { z, x, y, tile: { layers: {} } };
    },
    maximumAttempts: 2,
    concurrency: 2
  }
);
if (recoveredTileBatch.metrics.fulfilled !== 2 ||
    recoveredTileBatch.metrics.rejected !== 0 ||
    recoveredTileBatch.metrics.attempts !== 2) {
  buildingProviderAuthorityFailures.push('Overture coverage retry did not recover a complete deterministic tile set');
}
await assert.rejects(
  () => fetchCompleteArchiveTileBatch(
    [{ x: 3, y: 3 }],
    {
      fetchTile: async () => { throw new Error('verification permanent'); },
      maximumAttempts: 2
    }
  ),
  /coverage incomplete: 0\/1 tiles after 2 attempts/
);

const structureFallbackNodes = {
  1: { type: 'node', id: 1, lat: 10, lon: 20 },
  2: { type: 'node', id: 2, lat: 10, lon: 20.001 },
  '-1': { type: 'node', id: -1, lat: 10, lon: 20 },
  '-2': { type: 'node', id: -2, lat: 10, lon: 20.001 }
};
const exactBridge = {
  type: 'way', id: 100, nodes: [1, 2],
  tags: { highway: 'primary', bridge: 'yes', name: 'Mapped Bridge' }
};
const generalizedBridge = {
  type: 'way', id: -100, nodes: [-1, -2],
  tags: {
    highway: 'primary', bridge: 'yes', name: 'Mapped Bridge',
    _sourceCompleteness: 'generalized',
    _regionalContext: 'fixed-location',
    _fallbackStructureAuthority: 'generalized'
  }
};
const emptySelection = {
  roadWays: [exactBridge, generalizedBridge], buildingWays: [], landuseWays: [],
  waterwayWays: [], railwayWays: [], footwayWays: [], cyclewayWays: [],
  structureConnectorWays: [], treeRowWays: [], treeNodes: [], poiNodes: []
};
const exactStructureAccepted = filterSelectionToAcceptedGround(
  emptySelection,
  structureFallbackNodes,
  () => ({ status: 'available' }),
  { sampleRegionalGroundAtLatLon: () => ({ status: 'available' }) }
);
const exactStructureRejected = filterSelectionToAcceptedGround(
  emptySelection,
  structureFallbackNodes,
  (_lat, lon) => lon < 0 ? { status: 'available' } : { status: 'unavailable' },
  { sampleRegionalGroundAtLatLon: () => ({ status: 'available' }) }
);
const separatedNamedStructureNodes = {
  ...structureFallbackNodes,
  3: { type: 'node', id: 3, lat: 10.01, lon: 20 },
  4: { type: 'node', id: 4, lat: 10.01, lon: 20.001 }
};
const separatedNamedExactBridge = {
  type: 'way', id: 101, nodes: [3, 4],
  tags: { highway: 'primary', bridge: 'yes', name: 'Mapped Bridge' }
};
const separatedNamedStructureAccepted = filterSelectionToAcceptedGround(
  {
    ...emptySelection,
    roadWays: [separatedNamedExactBridge, generalizedBridge]
  },
  separatedNamedStructureNodes,
  () => ({ status: 'available' }),
  { sampleRegionalGroundAtLatLon: () => ({ status: 'available' }) }
);
const regionalFallbackFixture = retainRegionalTransportOutsideCore({
  elements: [
    { type: 'node', id: -1, lat: 10, lon: 20 },
    { type: 'node', id: -2, lat: 10, lon: 20.001 },
    { type: 'node', id: -3, lat: 10.001, lon: 20 },
    generalizedBridge,
    { type: 'way', id: -101, nodes: [-1, -3], tags: { highway: 'residential' } }
  ]
}, {
  location: { lat: 10, lon: 20 },
  coreRadiusMeters: 1000,
  radiusMeters: 14000
});
const deferredStructureMergeFixture = mergeExactRegionalStructures({
  elements: [
    structureFallbackNodes[1], structureFallbackNodes[2],
    structureFallbackNodes['-1'], structureFallbackNodes['-2'],
    exactBridge, generalizedBridge
  ]
}, {
  elements: [structureFallbackNodes[1], structureFallbackNodes[2], exactBridge]
});
const structureFallbackAuthorityFailures = [];
const exactTransportFeature = ({ id, points, nodeIds, terrainMode = 'at_grade', type = 'residential', completeness = 'lossless', name = '' }) => ({
  sourceFeatureId: id,
  type,
  name,
  pts: points,
  sourceTopologyNodes: nodeIds?.map((nodeId, index) => ({ id: nodeId, ...points[index] })) || [],
  structureSemantics: {
    terrainMode,
    verticalOrder: terrainMode === 'elevated' ? 1 : 0
  },
  transportRecord: {
    identity: id,
    completeness,
    routeState: 'complete',
    sourceTags: { highway: type, ...(name ? { name } : {}) }
  }
});
const exactSurfaceEndpoint = exactTransportFeature({
  id: 'osm:way:surface',
  points: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
  nodeIds: ['osm:node:surface-start', 'osm:node:surface-end']
});
const exactElevatedInterior = exactTransportFeature({
  id: 'osm:way:elevated-link',
  points: [{ x: 1.1, z: -1 }, { x: 1.1, z: 1 }],
  nodeIds: ['osm:node:link-start', 'osm:node:link-end'],
  terrainMode: 'elevated',
  type: 'motorway_link'
});
const falseExactMetricConnection = compileTransportNetworkModel([
  exactSurfaceEndpoint,
  exactElevatedInterior
]);
if (falseExactMetricConnection.connections.length !== 0) {
  structureFallbackAuthorityFailures.push('lossless ways without a shared source node gained a metric endpoint/interior connection');
}
const sharedExactMetricConnection = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'osm:way:shared-surface',
    points: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
    nodeIds: ['osm:node:shared-start', 'osm:node:physical-join']
  }),
  exactTransportFeature({
    id: 'osm:way:shared-elevated-link',
    points: [{ x: 1, z: -1 }, { x: 1, z: 0 }, { x: 1, z: 1 }],
    nodeIds: ['osm:node:elevated-start', 'osm:node:physical-join', 'osm:node:elevated-end'],
    terrainMode: 'elevated',
    type: 'motorway_link'
  })
]);
if (sharedExactMetricConnection.connections.length !== 1 ||
    sharedExactMetricConnection.connections[0].provenance?.method !== 'shared-source-node') {
  structureFallbackAuthorityFailures.push('lossless bridge/ramp ways lost their authoritative shared-node connection');
}
const exactSameSurfaceMetricConnection = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'osm:way:exact-surface-left',
    points: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
    nodeIds: ['osm:node:left-start', 'osm:node:left-end']
  }),
  exactTransportFeature({
    id: 'osm:way:exact-surface-right',
    points: [{ x: 1.1, z: 0 }, { x: 2, z: 0 }],
    nodeIds: ['osm:node:right-start', 'osm:node:right-end']
  })
]);
if (exactSameSurfaceMetricConnection.connections.length === 0 ||
    !String(exactSameSurfaceMetricConnection.connections[0].provenance?.method || '').startsWith('metric-')) {
  structureFallbackAuthorityFailures.push('same-surface exact route fragments lost bounded endpoint-drift continuity');
}
const generalizedMetricConnection = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:surface',
    points: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
    completeness: 'generalized'
  }),
  exactTransportFeature({
    id: 'shortbread:continuation',
    points: [{ x: 1.1, z: 0 }, { x: 2, z: 0 }],
    completeness: 'generalized'
  })
]);
if (generalizedMetricConnection.connections.length === 0 ||
    !String(generalizedMetricConnection.connections[0].provenance?.method || '').startsWith('metric-')) {
  structureFallbackAuthorityFailures.push('generalized transport lost its bounded metric conflation fallback');
}
const generalizedDriftConnection = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:drift-left',
    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    completeness: 'generalized'
  }),
  exactTransportFeature({
    id: 'shortbread:drift-right',
    points: [{ x: 11.5, z: 0 }, { x: 20, z: 0 }],
    completeness: 'generalized'
  })
]);
if (generalizedDriftConnection.connections.length !== 1 ||
    generalizedDriftConnection.connections[0].provenance?.method !==
      'generalized-aligned-endpoint-conflation') {
  structureFallbackAuthorityFailures.push('aligned generalized tile-edge continuation was left open');
}
const generalizedRampMerge = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:ramp-link',
    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway_link',
    completeness: 'generalized'
  }),
  exactTransportFeature({
    id: 'shortbread:through-road',
    points: [{ x: 0, z: 1.6 }, { x: 20, z: 1.6 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized'
  }),
  exactTransportFeature({
    id: 'shortbread:nearby-parallel-road',
    points: [{ x: 0, z: 2 }, { x: 20, z: 2 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized'
  })
]);
const generalizedInteriorMerges = generalizedRampMerge.connections.filter((connection) =>
  connection.kind === 'endpoint-interior' &&
  connection.provenance?.method === 'generalized-aligned-endpoint-interior');
if (generalizedInteriorMerges.length !== 1 ||
    !generalizedInteriorMerges[0].left.featureId.includes('ramp-link') ||
    !generalizedInteriorMerges[0].right.featureId.includes('through-road')) {
  structureFallbackAuthorityFailures.push('generalized ramp did not select its nearest aligned interior carriageway');
}
const generalizedNamedSpur = exactTransportFeature({
  id: 'shortbread:named-through-fragment',
  points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
  terrainMode: 'elevated',
  type: 'motorway',
  completeness: 'generalized',
  name: 'Example Expressway'
});
const generalizedNamedThrough = exactTransportFeature({
  id: 'shortbread:named-through-road',
  points: [{ x: 0, z: 0.25 }, { x: 20, z: 0.25 }],
  terrainMode: 'elevated',
  type: 'motorway',
  completeness: 'generalized',
  name: 'Example Expressway'
});
generalizedNamedSpur.transportSurfaceModel = {
  distances: new Float32Array([0, 10]),
  centerHeights: new Float32Array([12, 12])
};
generalizedNamedThrough.transportSurfaceModel = {
  distances: new Float32Array([0, 20]),
  centerHeights: new Float32Array([20, 20])
};
const generalizedNamedRouteMerge = compileTransportNetworkModel([
  generalizedNamedSpur,
  generalizedNamedThrough
]);
if (generalizedNamedRouteMerge.connections.filter((connection) =>
  connection.kind === 'endpoint-interior' &&
  connection.provenance?.method === 'generalized-aligned-endpoint-interior').length !== 1) {
  structureFallbackAuthorityFailures.push('same-route generalized bridge join was rejected by its provisional height mismatch');
}
const generalizedNamedRouteGap = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:named-gap-left',
    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway_link',
    completeness: 'generalized',
    name: 'Example Expressway'
  }),
  exactTransportFeature({
    id: 'shortbread:named-gap-right',
    points: [{ x: 23, z: 0 }, { x: 40, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized',
    name: 'Example Expressway'
  })
]);
if (generalizedNamedRouteGap.connections.length !== 1 ||
    generalizedNamedRouteGap.connections[0].snapDistanceMeters !== 13) {
  structureFallbackAuthorityFailures.push('named generalized route gap inside one vector cell was left hanging');
}
const generalizedDifferentRouteGap = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:different-gap-left',
    points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized',
    name: 'First Expressway'
  }),
  exactTransportFeature({
    id: 'shortbread:different-gap-right',
    points: [{ x: 23, z: 0 }, { x: 40, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized',
    name: 'Second Expressway'
  })
]);
if (generalizedDifferentRouteGap.connections.length !== 0) {
  structureFallbackAuthorityFailures.push('long generalized gap joined different named routes');
}
const generalizedPerpendicularCrossing = compileTransportNetworkModel([
  exactTransportFeature({
    id: 'shortbread:perpendicular-link',
    points: [{ x: 10, z: -10 }, { x: 10, z: 0 }],
    terrainMode: 'elevated',
    type: 'motorway_link',
    completeness: 'generalized'
  }),
  exactTransportFeature({
    id: 'shortbread:perpendicular-through',
    points: [{ x: 0, z: 1.6 }, { x: 20, z: 1.6 }],
    terrainMode: 'elevated',
    type: 'motorway',
    completeness: 'generalized'
  })
]);
if (generalizedPerpendicularCrossing.connections.some((connection) =>
    connection.provenance?.method === 'generalized-aligned-endpoint-interior')) {
  structureFallbackAuthorityFailures.push('generalized perpendicular overpass was mistaken for a ramp merge');
}
const engineeredSurfaceLeft = exactTransportFeature({
  id: 'osm:way:engineered-surface-left',
  points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
  nodeIds: ['osm:node:engineered-left', 'osm:node:engineered-join-left'],
  type: 'primary_link'
});
const engineeredSurfaceMiddle = exactTransportFeature({
  id: 'osm:way:engineered-surface-middle',
  points: [{ x: 10, z: 0 }, { x: 20, z: 0 }],
  nodeIds: ['osm:node:engineered-join-left', 'osm:node:engineered-join-right'],
  type: 'primary_link'
});
const engineeredSurfaceRight = exactTransportFeature({
  id: 'osm:way:engineered-surface-right',
  points: [{ x: 20, z: 0 }, { x: 30, z: 0 }],
  nodeIds: ['osm:node:engineered-join-right', 'osm:node:engineered-right'],
  type: 'primary_link'
});
for (const [feature, heights] of [
  [engineeredSurfaceLeft, [10, 10]],
  [engineeredSurfaceMiddle, [10.1, 10.1]],
  [engineeredSurfaceRight, [10, 10]]
]) {
  feature.transportGraphRef = { featureId: feature.sourceFeatureId };
  feature.surfaceBias = 0.08;
  feature.transportSurfaceModel = {
    engineeredApproach: true,
    distances: new Float64Array([0, 10]),
    centerHeights: new Float32Array(heights)
  };
}
engineeredSurfaceLeft.structureTransitionAnchors = [{
  distance: 10,
  targetSurfaceY: 10,
  source: 'transport_graph_node',
  engineeredApproach: true
}];
engineeredSurfaceMiddle.structureTransitionAnchors = [
  { distance: 0, targetSurfaceY: 10, source: 'transport_graph_node', engineeredApproach: true },
  { distance: 10, targetSurfaceY: 10, source: 'transport_graph_node', engineeredApproach: true }
];
engineeredSurfaceRight.structureTransitionAnchors = [{
  distance: 0,
  targetSurfaceY: 10,
  source: 'transport_graph_node',
  engineeredApproach: true
}];
const engineeredSurfaceNetwork = compileTransportNetworkModel([
  engineeredSurfaceLeft,
  engineeredSurfaceMiddle,
  engineeredSurfaceRight
]);
const engineeredSurfaceRepair = buildTransportContinuityRepairAnchors(
  [engineeredSurfaceLeft, engineeredSurfaceMiddle, engineeredSurfaceRight],
  engineeredSurfaceNetwork,
  (feature, _x, _z, projected) => {
    const atEnd = Number(projected?.segmentT ?? projected?.t) >= 0.5;
    return Number(feature.transportSurfaceModel.centerHeights[atEnd ? 1 : 0]);
  },
  { sampleTerrainY: () => 9.92 }
);
if ((engineeredSurfaceRepair.anchorsByFeature.get(engineeredSurfaceMiddle) || []).length !== 2) {
  structureFallbackAuthorityFailures.push('sub-tolerance exact grade constraints were discarded at an all-engineered surface corridor');
}
const buriedInteriorThrough = exactTransportFeature({
  id: 'osm:way:buried-interior-through',
  points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
  nodeIds: ['osm:node:buried-left', 'osm:node:buried-join', 'osm:node:buried-right'],
  type: 'primary'
});
const buriedInteriorSpur = exactTransportFeature({
  id: 'osm:way:buried-interior-spur',
  points: [{ x: 10, z: 0 }, { x: 10, z: 10 }],
  nodeIds: ['osm:node:buried-join', 'osm:node:buried-spur'],
  type: 'service'
});
for (const feature of [buriedInteriorThrough, buriedInteriorSpur]) {
  feature.transportGraphRef = { featureId: feature.sourceFeatureId };
  feature.surfaceBias = 0.08;
  feature.transportSurfaceModel = {
    engineeredApproach: true,
    distances: new Float64Array(feature === buriedInteriorThrough ? [0, 10, 20] : [0, 10]),
    centerHeights: new Float32Array(feature === buriedInteriorThrough ? [5, 5, 5] : [5, 5])
  };
}
buriedInteriorThrough.structureTransitionAnchors = [{
  distance: 10,
  targetSurfaceY: 5,
  source: 'transport_graph_node',
  engineeredApproach: true
}];
buriedInteriorSpur.structureTransitionAnchors = [{
  distance: 0,
  targetSurfaceY: 5,
  source: 'transport_graph_node',
  engineeredApproach: true
}];
const buriedInteriorNetwork = compileTransportNetworkModel([
  buriedInteriorThrough,
  buriedInteriorSpur
]);
const buriedInteriorRepair = buildTransportContinuityRepairAnchors(
  [buriedInteriorThrough, buriedInteriorSpur],
  buriedInteriorNetwork,
  () => 5,
  { sampleTerrainY: () => 10 }
);
const buriedInteriorTargets = [
  ...(buriedInteriorRepair.anchorsByFeature.get(buriedInteriorThrough) || []),
  ...(buriedInteriorRepair.anchorsByFeature.get(buriedInteriorSpur) || [])
].map((anchor) => Number(anchor.targetSurfaceY));
if (buriedInteriorTargets.length !== 2 ||
    buriedInteriorTargets.some((target) => Math.abs(target - 10.08) > 1e-6)) {
  structureFallbackAuthorityFailures.push('exact endpoint-to-interior road join trusted a provisional profile below accepted ground');
}
buriedInteriorThrough.transportSurfaceModel.engineeredApproach = false;
buriedInteriorSpur.transportSurfaceModel.engineeredApproach = false;
buriedInteriorThrough.structureTransitionAnchors = [{
  distance: 0,
  targetSurfaceY: 5,
  source: 'transport_graph_node',
  engineeredApproach: true
}];
buriedInteriorSpur.structureTransitionAnchors = [];
const ordinaryInteriorRepair = buildTransportContinuityRepairAnchors(
  [buriedInteriorThrough, buriedInteriorSpur],
  buriedInteriorNetwork,
  () => 5,
  { sampleTerrainY: () => 10 }
);
if (ordinaryInteriorRepair.anchorsByFeature.size !== 0) {
  structureFallbackAuthorityFailures.push('ordinary exact T-junction was promoted into an engineered transport approach');
}
const ordinaryJunctionProfile = buildTransportJunctionProfileAnchors(
  [buriedInteriorThrough, buriedInteriorSpur],
  buriedInteriorNetwork,
  () => 10,
  () => 5
);
if (ordinaryJunctionProfile.anchorsByFeature.size !== 0) {
  structureFallbackAuthorityFailures.push('pure at-grade source node entered the vertical structure junction authority');
}
const staleTargetSurface = exactTransportFeature({
  id: 'osm:way:stale-target-surface',
  points: [{ x: -20, z: 0 }, { x: 0, z: 0 }],
  nodeIds: ['osm:node:stale-ground', 'osm:node:stale-join'],
  type: 'tertiary'
});
const staleTargetBridge = exactTransportFeature({
  id: 'osm:way:stale-target-bridge',
  points: [{ x: 0, z: 0 }, { x: 20, z: 0 }],
  nodeIds: ['osm:node:stale-join', 'osm:node:stale-high'],
  terrainMode: 'elevated',
  type: 'tertiary'
});
const staleTargetHighSurface = exactTransportFeature({
  id: 'osm:way:stale-target-high-surface',
  points: [{ x: 20, z: 0 }, { x: 40, z: 0 }],
  nodeIds: ['osm:node:stale-high', 'osm:node:stale-return'],
  type: 'tertiary'
});
for (const [feature, heights] of [
  [staleTargetSurface, [4.3, 4.3]],
  [staleTargetBridge, [6.7, 8.4]],
  [staleTargetHighSurface, [8.4, 8.4]]
]) {
  feature.transportGraphRef = { featureId: feature.sourceFeatureId };
  feature.surfaceBias = 0.08;
  feature.transportSurfaceModel = {
    engineeredApproach: feature !== staleTargetSurface,
    distances: new Float64Array([0, 20]),
    centerHeights: new Float32Array(heights)
  };
}
staleTargetBridge.structureTransitionAnchors = [{
  distance: 0,
  targetSurfaceY: 4.3,
  source: 'transport_graph_node'
}];
const staleTargetNetwork = compileTransportNetworkModel([
  staleTargetSurface,
  staleTargetBridge,
  staleTargetHighSurface
]);
const staleTargetRepair = buildTransportContinuityRepairAnchors(
  [staleTargetSurface, staleTargetBridge, staleTargetHighSurface],
  staleTargetNetwork,
  (feature, _x, _z, projected) => {
    const atEnd = Number(projected?.segmentT ?? projected?.t) >= 0.5;
    return Number(feature.transportSurfaceModel.centerHeights[atEnd ? 1 : 0]);
  },
  { sampleTerrainY: (x) => x < 10 ? 6.895 : 8.32 }
);
const repairedStaleBridgeStart = (staleTargetRepair.anchorsByFeature.get(staleTargetBridge) || [])
  .find((anchor) => anchor.endpoint === 'start');
if (!repairedStaleBridgeStart ||
    Math.abs(Number(repairedStaleBridgeStart.targetSurfaceY) - 6.975) > 0.02) {
  structureFallbackAuthorityFailures.push('feasible terrain-clearing graph target did not supersede a stale buried bridge endpoint target');
}
if (exactStructureAccepted.selection.roadWays.length !== 1 ||
    exactStructureAccepted.selection.roadWays[0].id !== exactBridge.id ||
    exactStructureAccepted.diagnostics.supersededGeneralizedStructures !== 1) {
  structureFallbackAuthorityFailures.push('accepted exact structure did not supersede its generalized fallback');
}
if (separatedNamedStructureAccepted.selection.roadWays.length !== 2 ||
    separatedNamedStructureAccepted.diagnostics.supersededGeneralizedStructures !== 0) {
  structureFallbackAuthorityFailures.push('a non-overlapping exact fragment deleted a same-name generalized physical surface');
}
if (exactStructureRejected.selection.roadWays.length !== 1 ||
    exactStructureRejected.selection.roadWays[0].id !== generalizedBridge.id ||
    exactStructureRejected.diagnostics.retainedGeneralizedStructureFallbacks !== 1) {
  structureFallbackAuthorityFailures.push('generalized structure fallback did not survive rejection of exact authority');
}
if (regionalFallbackFixture._regionalContext?.retainedCoreStructureFallbacks !== 1 ||
    regionalFallbackFixture.elements.some((element) => element?.id === -101)) {
  structureFallbackAuthorityFailures.push('core fallback retention did not isolate engineered transport');
}
const upgradedExactBridge = deferredStructureMergeFixture.elements.find(
  (element) => element?.type === 'way' && element.id === exactBridge.id
);
if (upgradedExactBridge?.tags?._fixedRegionalStructure !== 'exact' ||
    upgradedExactBridge?.tags?._regionalContext !== 'fixed-location' ||
    !deferredStructureMergeFixture.elements.some((element) => element?.id === generalizedBridge.id) ||
    deferredStructureMergeFixture._fixedRegionalStructures?.upgradedExistingWays !== 1) {
  structureFallbackAuthorityFailures.push('exact structure merge did not defer deduplication until ground acceptance');
}

const buildingRoadAuthorityFailures = [];
const inferredWidthRoad = {
  pts: [{ x: -100, z: 0 }, { x: 100, z: 0 }, { x: 120, z: 0 }],
  width: 5,
  driveable: true,
  structureSemantics: { terrainMode: 'at_grade' },
  transportRecord: { crossSection: { widthMeters: 5, widthSource: 'fallback:road-class' } }
};
const mappedWidthRoad = {
  pts: [{ x: -10, z: 20 }, { x: 10, z: 20 }],
  width: 5,
  driveable: true,
  structureSemantics: { terrainMode: 'at_grade' },
  transportRecord: { crossSection: { widthMeters: 5, widthSource: 'source:width' } }
};
const tunnelRoad = {
  pts: [{ x: -10, z: 40 }, { x: 10, z: 40 }],
  width: 7,
  driveable: true,
  structureSemantics: { terrainMode: 'subgrade' },
  transportRecord: { crossSection: { widthMeters: 7, widthSource: 'fallback:road-class' } }
};
const buildingRoadGuards = await createBuildingRoadFootprintGuards({
  roads: [inferredWidthRoad, mappedWidthRoad, tunnelRoad],
  yieldToMainThread: async () => {}
});
const inferredResolution = buildingRoadGuards.resolveFootprintTransportAuthority([
  { x: -14, z: 1.8 }, { x: -6, z: 1.8 }, { x: -6, z: 6 }, { x: -14, z: 6 }
], { sourceBuildingId: 'mapped-building' });
const mappedWidthConflict = buildingRoadGuards.resolveFootprintTransportAuthority([
  { x: -4, z: 21.8 }, { x: 4, z: 21.8 }, { x: 4, z: 26 }, { x: -4, z: 26 }
], { sourceBuildingId: 'mapped-building' });
if (mappedWidthConflict.action !== 'suppress_building' ||
    mappedWidthConflict.reason !== 'mapped_cross_section_conflict' ||
    mappedWidthRoad.width !== 5) {
  buildingRoadAuthorityFailures.push('mapped road width did not retain authority over a conflicting building footprint');
}
const tunnelOverlap = buildingRoadGuards.resolveFootprintTransportAuthority([
  { x: -4, z: 41.8 }, { x: 4, z: 41.8 }, { x: 4, z: 46 }, { x: -4, z: 46 }
], { sourceBuildingId: 'mapped-building' });
if (tunnelOverlap.action !== 'none' || tunnelOverlap.gradeSeparatedOverlaps !== 1 || tunnelRoad.width !== 7) {
  buildingRoadAuthorityFailures.push('grade-separated transport was incorrectly treated as an at-grade footprint conflict');
}
const centerlineConflict = buildingRoadGuards.resolveFootprintTransportAuthority([
  { x: -12, z: -1 }, { x: -8, z: -1 }, { x: -8, z: 1 }, { x: -12, z: 1 }
], { sourceBuildingId: 'mapped-building' });
if (centerlineConflict.action !== 'suppress_building' || centerlineConflict.reason !== 'mapped_centerline_conflict') {
  buildingRoadAuthorityFailures.push('irreconcilable mapped centerline conflict was not rejected');
}
const crossSectionPublication = buildingRoadGuards.publishRoadCrossSectionProfiles();
if (inferredResolution.action !== 'constrain_inferred_width' ||
    inferredResolution.constrainedSegments !== 1 ||
    inferredWidthRoad.width !== 5 ||
    inferredWidthRoad.driveable !== true ||
    inferredWidthRoad.resolvedCrossSection?.authority !== 'mapped_building_clearance_by_source_interval' ||
    inferredWidthRoad.resolvedCrossSection?.inferenceMethod !== 'mapped-footprint-clearance-by-source-interval' ||
    !(roadWidthAtSegment(inferredWidthRoad, 0, 0.46) < 5) ||
    roadWidthAtSegment(inferredWidthRoad, 0, 0) !== 5 ||
    roadWidthAtSegment(inferredWidthRoad, 0, 1) !== 5 ||
    roadWidthAtSegment(inferredWidthRoad, 1, 1) !== 5 ||
    roadSegmentIsDriveable(inferredWidthRoad, 0, 0.42, 0.5) !== false ||
    roadSegmentIsDriveable(inferredWidthRoad, 0, 0, 0.2) !== true ||
    roadSegmentIsDriveable(inferredWidthRoad, 1, 0.6, 1) !== true ||
    crossSectionPublication.constrainedRoads !== 1 ||
    crossSectionPublication.constrainedSegments !== 1 ||
    crossSectionPublication.nonDriveableSegments !== 1) {
  buildingRoadAuthorityFailures.push('mapped footprint did not publish one local cross-section constraint while preserving the rest of the road');
}

const boundaryRoad = {
  pts: [{ x: -20, z: 80 }, { x: 0, z: 80 }, { x: 20, z: 80 }],
  width: 6,
  driveable: true,
  structureSemantics: { terrainMode: 'at_grade' },
  transportRecord: { crossSection: { widthMeters: 6, widthSource: 'fallback:road-class' } }
};
const boundaryGuards = await createBuildingRoadFootprintGuards({
  roads: [boundaryRoad],
  yieldToMainThread: async () => {}
});
boundaryGuards.resolveFootprintTransportAuthority([
  { x: -5, z: 81.8 }, { x: 0, z: 81.8 }, { x: 0, z: 86 }, { x: -5, z: 86 }
], { sourceBuildingId: 'boundary-building' });
boundaryGuards.publishRoadCrossSectionProfiles();
if (!(roadWidthAtSegment(boundaryRoad, 1, 0) < 6) ||
    roadWidthAtSegment(boundaryRoad, 1, 0.5) !== 6) {
  buildingRoadAuthorityFailures.push('local cross-section transition stopped abruptly at a source-segment boundary');
}

const buildOrderedCrossSection = async (footprints) => {
  const road = {
    pts: [{ x: -20, z: 60 }, { x: 0, z: 60 }, { x: 20, z: 60 }],
    width: 6,
    driveable: true,
    structureSemantics: { terrainMode: 'at_grade' },
    transportRecord: { crossSection: { widthMeters: 6, widthSource: 'fallback:road-class' } }
  };
  const guards = await createBuildingRoadFootprintGuards({ roads: [road], yieldToMainThread: async () => {} });
  for (const footprint of footprints) {
    guards.resolveFootprintTransportAuthority(footprint.points, { sourceBuildingId: footprint.id });
  }
  guards.publishRoadCrossSectionProfiles();
  return Array.from(road.resolvedCrossSection?.segmentWidthsMeters || []);
};
const orderedFootprints = [
  { id: 'wide-clearance', points: [{ x: -16, z: 62.4 }, { x: -12, z: 62.4 }, { x: -12, z: 66 }, { x: -16, z: 66 }] },
  { id: 'tight-clearance', points: [{ x: -10, z: 61.6 }, { x: -6, z: 61.6 }, { x: -6, z: 66 }, { x: -10, z: 66 }] }
];
const forwardCrossSection = await buildOrderedCrossSection(orderedFootprints);
const reverseCrossSection = await buildOrderedCrossSection([...orderedFootprints].reverse());
if (JSON.stringify(forwardCrossSection) !== JSON.stringify(reverseCrossSection)) {
  buildingRoadAuthorityFailures.push('local building-road cross-section authority still depends on building load order');
}
const crossSectionTraffic = compileTrafficGraph({
  traversal: {
    authority: 'fixture',
    segments: [
      {
        feature: inferredWidthRoad,
        direction: 'both',
        segIndex: 0,
        sourceTStart: 0.42,
        sourceTEnd: 0.5,
        p1: { x: -16, z: 0 },
        p2: { x: 0, z: 0 }
      },
      {
        feature: inferredWidthRoad,
        direction: 'both',
        segIndex: 0,
        sourceTStart: 0,
        sourceTEnd: 0.2,
        p1: { x: -100, z: 0 },
        p2: { x: -60, z: 0 }
      }
    ]
  },
  sampleSurface: () => 0
});
if (crossSectionTraffic.publication.diagnostics.sourceSegments !== 1 ||
    crossSectionTraffic.publication.edges.length !== 2 ||
    crossSectionTraffic.publication.edges.some((edge) => edge.roadWidth !== 5)) {
  buildingRoadAuthorityFailures.push('traffic did not exclude only the locally non-driveable cross-section interval');
}

const roadSurfaceFootprintFailures = [];
const compiledAtGradeSurfaceFixture = {
  pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
  surfaceDistances: new Float32Array([0, 10]),
  surfaceHeights: new Float32Array([2, 6]),
  structureSemantics: { terrainMode: 'at_grade' }
};
const compiledAtGradeSurfaceDiagnostics = { compiledSurfaceFallbacks: 0 };
const compiledAtGradeSurfaceSampler = createCompiledRoadSurfaceSampler(
  compiledAtGradeSurfaceFixture,
  () => 99,
  compiledAtGradeSurfaceDiagnostics
);
if (compiledAtGradeSurfaceSampler(5, 0) !== 4 ||
    compiledAtGradeSurfaceDiagnostics.compiledSurfaceFallbacks !== 0) {
  roadSurfaceFootprintFailures.push(
    'final at-grade road vertices did not consume the compiled transport surface profile'
  );
}
const indexedSurfaceContainsPoint = (verts, indices, point) => {
  const sign = (p1, p2, p3) =>
    (p1.x - p3.x) * (p2.z - p3.z) - (p2.x - p3.x) * (p1.z - p3.z);
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]].map((vertexIndex) => ({
      x: verts[vertexIndex * 3],
      z: verts[vertexIndex * 3 + 2]
    }));
    const d1 = sign(point, triangle[0], triangle[1]);
    const d2 = sign(point, triangle[1], triangle[2]);
    const d3 = sign(point, triangle[2], triangle[0]);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
  }
  return false;
};
const sharpTurnVerts = [];
const sharpTurnIndices = [];
const sharpTurnIntegrity = appendSolidAtGradeRoadGeometry({
  feature: {
    structureSemantics: { terrainMode: 'at_grade' },
    transportRecord: { crossSection: { placement: { centerlineOffsetMeters: 0 } } }
  },
  points: [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 0.2, z: 0.35 },
    { x: 2.2, z: 0.7 }
  ],
  halfWidth: 3.5,
  sampleTerrainY: () => 0,
  targetVerts: sharpTurnVerts,
  targetIndices: sharpTurnIndices
});
if (sharpTurnIntegrity.segmentQuads !== 3 ||
    sharpTurnIntegrity.turnJoins < 2 ||
    sharpTurnIntegrity.foldedTriangles !== 0 ||
    sharpTurnIntegrity.degenerateTriangles !== 0 ||
    sharpTurnIndices.length / 3 !== sharpTurnIntegrity.surfaceTriangles) {
  roadSurfaceFootprintFailures.push('sharp mapped turn did not publish solid non-folding segment and join geometry');
}
const outerTurnVerts = [];
const outerTurnIndices = [];
appendSolidAtGradeRoadGeometry({
  feature: {
    structureSemantics: { terrainMode: 'at_grade' },
    transportRecord: { crossSection: { placement: { centerlineOffsetMeters: 0 } } }
  },
  points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }],
  halfWidth: 2,
  sampleTerrainY: () => 0,
  targetVerts: outerTurnVerts,
  targetIndices: outerTurnIndices
});
if (!indexedSurfaceContainsPoint(outerTurnVerts, outerTurnIndices, { x: 11, z: -1 })) {
  roadSurfaceFootprintFailures.push('road turn join filled the already-covered inside instead of the exposed outer wedge');
}
const twoBranchJunction = {
  hasGradeSeparatedRoad: false,
  maxWidth: 9,
  roads: [{ width: 9 }, { width: 5 }]
};
if (!shouldBuildCompactIntersectionCap(twoBranchJunction) ||
    computeIntersectionCapRadius(twoBranchJunction) !== 2.5) {
  roadSurfaceFootprintFailures.push('two-branch mapped junction did not receive narrowest-connected-half-width closure');
}
const sourceTopologyJunctions = detectRoadIntersections([
  {
    pts: [{ x: -10, z: 0 }, { x: 10, z: 0 }],
    sourceNodeIds: ['west', 'east'],
    sourceTopologyNodes: [
      { id: 'west', x: -10, z: 0 },
      { id: 'shared-t', x: 0, z: 0 },
      { id: 'east', x: 10, z: 0 }
    ],
    width: 7,
    fixedRegionalContext: true,
    structureSemantics: { terrainMode: 'at_grade' }
  },
  {
    pts: [{ x: 0, z: 0 }, { x: 0, z: 10 }],
    sourceNodeIds: ['shared-t', 'south'],
    sourceTopologyNodes: [
      { id: 'shared-t', x: 0, z: 0 },
      { id: 'south', x: 0, z: 10 }
    ],
    width: 5,
    fixedRegionalContext: true,
    structureSemantics: { terrainMode: 'at_grade' }
  }
]);
if (sourceTopologyJunctions.length !== 1 ||
    sourceTopologyJunctions[0].roads.length !== 3 ||
    Math.hypot(sourceTopologyJunctions[0].x, sourceTopologyJunctions[0].z) > 1e-7) {
  roadSurfaceFootprintFailures.push('fixed-regional internal source-node T junction lost one or more physical branches');
}

const missingRequiredFiles = [];
for (const relative of requiredFiles) {
  if (!(await exists(path.join(root, relative)))) missingRequiredFiles.push(relative);
}

const legacyTestFiles = (await filesUnder(path.join(root, 'scripts')))
  .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
  .filter((name) => /(?:^|\/)test-.*\.mjs$/i.test(name));
const legacyScriptReferences = Object.entries(packageJson.scripts || {})
  .filter(([, command]) => /scripts\/test-|world-matrix|legacy-test-quarantine/i.test(String(command)))
  .map(([name, command]) => ({ name, command }));

const missingScriptTargets = [];
for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  for (const match of String(command).matchAll(/\bnode\s+(scripts\/[^\s"']+\.mjs)\b/g)) {
    if (!(await exists(path.join(root, match[1])))) missingScriptTargets.push({ name, target: match[1] });
  }
}

const htmlFailures = [
  ...await htmlResourceFailures(path.join(root, 'index.html')),
  ...await htmlResourceFailures(path.join(root, 'app', 'index.html'))
];

const moduleFiles = (await filesUnder(path.join(root, 'app', 'js')))
  .filter((filePath) => filePath.endsWith('.js') || filePath.endsWith('.mjs'));
const missingModuleTargets = [];
const identitiesByTarget = new Map();
for (const importer of moduleFiles) {
  const source = await fs.readFile(importer, 'utf8');
  for (const reference of moduleReferences(source)) {
    if (!reference.startsWith('.')) continue;
    const [pathname, query = ''] = reference.split('?', 2);
    const target = path.resolve(path.dirname(importer), pathname);
    if (!(await exists(target))) {
      missingModuleTargets.push({ importer: path.relative(root, importer), reference });
      continue;
    }
    const normalized = path.relative(root, target).split(path.sep).join('/');
    if (!identitiesByTarget.has(normalized)) identitiesByTarget.set(normalized, new Set());
    identitiesByTarget.get(normalized).add(query || '(unversioned)');
  }
}
const duplicateModuleIdentities = [...identitiesByTarget.entries()]
  .filter(([, identities]) => identities.size > 1)
  .map(([target, identities]) => ({ target, identities: [...identities].sort() }));

const diagnosticsSource = await fs.readFile(path.join(root, 'app', 'js', 'runtime-diagnostics.js'), 'utf8');
const productionDebugDefaultOff = diagnosticsSource.includes("diagnosticsParams.get('diagnostics') === '1'");
const outputFiles = await filesUnder(path.join(root, 'output')).catch(() => []);
// Gameplay journeys create their candidate evidence before the closing source
// gate. Those captures are expected verification output, not stale source-tree
// artwork; continue rejecting generated images in every other output location.
const staleGeneratedImages = outputFiles
  .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
  .filter((relative) => /\.(?:png|jpe?g|webp)$/i.test(relative) &&
    !relative.startsWith('output/verification/') &&
    !relative.startsWith('output/release-evidence/current/'));

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  contract: 'current-source-and-entry-graph-health',
  policyStatus: policy.status,
  counts: {
    moduleFiles: moduleFiles.length,
    moduleTargets: identitiesByTarget.size,
    packageScripts: Object.keys(packageJson.scripts || {}).length
  },
  failures: {
    missingRequiredFiles,
    legacyTestFiles,
    legacyScriptReferences,
    missingScriptTargets,
    htmlFailures,
    missingModuleTargets,
    duplicateModuleIdentities,
    buildingMetadataCoverageFailures,
    buildingProviderAuthorityFailures,
    farBuildingHeightAuthorityFailures,
    buildingRoadAuthorityFailures,
    roadSurfaceFootprintFailures,
    structureFallbackAuthorityFailures,
    groundAuthorityFailures,
    staleGeneratedImages,
    productionDebugDefaultOff: productionDebugDefaultOff ? [] : ['runtime diagnostics are not opt-in']
  }
};
report.ok = Object.values(report.failures).every((value) => Array.isArray(value) && value.length === 0);
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, `Source verification failed; see ${path.relative(root, reportPath)}`);
