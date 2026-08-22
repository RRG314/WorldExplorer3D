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
import { createBuildingRoadFootprintGuards } from '../../app/js/world/building-road-footprint.js';
import { createAcceptedGroundRuntime } from '../../app/js/terrain/accepted-ground-runtime.js';
import { compileGroundArtifact } from '../../app/js/terrain/ground-artifact.js';
import { selectGroundArtifacts } from '../../app/js/terrain/ground-provider-registry.js';
import {
  compileDistrictGroundModel,
  sampleDistrictGroundMeters
} from '../../app/js/world/compiler/district-ground-model.js';
import { createGroundBuildPlan } from '../lib/ground-artifact-builder.mjs';
import { compileTransportSurfaceModel } from '../../app/js/world/compiler/transport-surface-model.js';
import { fetchCompleteArchiveTileBatch } from '../../app/js/world/overture-building-source.js';
import { resolveCustomLocationArrival } from '../../app/js/world/spawn-location-arrival.js';
import { resolveFarBuildingMassing } from '../../app/js/terrain/far-building-massing.js';
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
const exactTransportFeature = ({ id, points, nodeIds, terrainMode = 'at_grade', type = 'residential', completeness = 'lossless' }) => ({
  sourceFeatureId: id,
  type,
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
    sourceTags: { highway: type }
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
  pts: [{ x: -10, z: 0 }, { x: 10, z: 0 }],
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
  { x: -4, z: 1.8 }, { x: 4, z: 1.8 }, { x: 4, z: 6 }, { x: -4, z: 6 }
], { sourceBuildingId: 'mapped-building' });
if (inferredResolution.action !== 'constrain_inferred_width' ||
    !(inferredWidthRoad.width < 5 && inferredWidthRoad.width > 3.2) ||
    inferredWidthRoad.driveable !== false ||
    inferredWidthRoad.resolvedCrossSection?.authority !== 'mapped_building_clearance' ||
    inferredWidthRoad.resolvedCrossSection?.inferenceMethod !== 'mapped-footprint-clearance') {
  buildingRoadAuthorityFailures.push('mapped footprint did not constrain a conflicting inferred road width with explicit provenance');
}
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
  { x: -2, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 1 }, { x: -2, z: 1 }
], { sourceBuildingId: 'mapped-building' });
if (centerlineConflict.action !== 'suppress_building' || centerlineConflict.reason !== 'mapped_centerline_conflict') {
  buildingRoadAuthorityFailures.push('irreconcilable mapped centerline conflict was not rejected');
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
const staleGeneratedImages = outputFiles
  .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
  .filter((relative) => /\.(?:png|jpe?g|webp)$/i.test(relative) &&
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
