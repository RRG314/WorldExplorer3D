import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(
  fs.existsSync(path.join(root, 'app/js/world/aerial-surface-context.js')),
  false,
  'a regional aerial map plane must not exist'
);

const configSource = read('app/js/config.js');
const terrainSource = read('app/js/terrain/surface-profiles.js');
const terrainRuntimeSource = read('app/js/terrain.js');
const publicationSource = read('app/js/world/publication.js');
const diagnosticsSource = read('app/js/runtime-diagnostics.js');
const locationTerrainSource = read('app/js/terrain/location-world.js');
const farFieldSource = read('app/js/terrain/far-field.js');
const farFieldGeometrySource = read('app/js/terrain/far-field-geometry.js');
const farMappedContextSource = read('app/js/terrain/far-field-mapped-context.js');
const starMaterialSource = read('app/js/sky/star-point-material.js');
const starFieldSource = read('app/js/sky/starfield-ui.js');
const gaiaSource = read('app/js/sky/gaia-catalog.js');
const {
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_CONTEXT_HALF_EXTENT_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  buildClipmapAxis,
  clipTriangleOutsideBounds,
  cellInsideDetailedCoverage,
  cellInsideHole
} = await import('../app/js/terrain/far-field.js');
const {
  mappedWaterBedMetersAt,
  normalizeMappedWaterSurfaceOwnership,
  sampleFarFieldGridWorldY
} = await import('../app/js/terrain/far-field-geometry.js');
const {
  pointInLonLatRing,
  pointInMappedWaterArea,
  retainFarWaterRing,
  selectContextZoomForTileBudget
} = await import('../app/js/terrain/far-field-mapped-context.js');

assert.match(configSource, /const TERRAIN_ZOOM = 15;/, 'near terrain resolution must remain at zoom 15');
assert.doesNotMatch(
  terrainSource,
  /terrainAerialDetailSuppressed|terrainSurfaceDetailState|updateTerrainAerialDetail/,
  'terrain materials must not change at an aerial altitude threshold'
);
const mappedWaterWithIsland = {
  outer: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
  holes: [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]],
  bounds: { minLon: 0, maxLon: 4, minLat: 0, maxLat: 4 }
};
assert.equal(pointInMappedWaterArea(3, 3, mappedWaterWithIsland), true);
assert.equal(pointInMappedWaterArea(1.5, 1.5, mappedWaterWithIsland), false);
assert.equal(
  mappedWaterBedMetersAt(3, 3, 4, [{ ...mappedWaterWithIsland, surfaceMeters: 0 }], pointInMappedWaterArea),
  -12,
  'fixed regional terrain must form a physical bed beneath mapped water'
);
assert.equal(
  mappedWaterBedMetersAt(1.5, 1.5, 4, [{ ...mappedWaterWithIsland, surfaceMeters: 0 }], pointInMappedWaterArea),
  4,
  'mapped islands must remain terrain instead of being cut into the water bed'
);
const normalizedOverlappingWater = [
  {
    kind: 'ocean',
    spanMeters: 1000,
    surfaceMeters: 0,
    outer: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
    holes: [],
    bounds: { minLon: 0, maxLon: 4, minLat: 0, maxLat: 4 }
  },
  {
    kind: 'water',
    spanMeters: 500,
    surfaceMeters: 3,
    outer: [[2, 1], [5, 1], [5, 3], [2, 3], [2, 1]],
    holes: [],
    bounds: { minLon: 2, maxLon: 5, minLat: 1, maxLat: 3 }
  }
];
normalizeMappedWaterSurfaceOwnership(normalizedOverlappingWater, pointInMappedWaterArea);
assert.equal(
  normalizedOverlappingWater[1].surfaceMeters,
  0,
  'overlapping mapped water sources must share one physical surface instead of deleting triangles'
);
assert.equal(normalizedOverlappingWater[1]._surfaceOwnerKind, 'ocean');
assert.equal(
  mappedWaterBedMetersAt(3, 2, 4, normalizedOverlappingWater, pointInMappedWaterArea),
  -30,
  'ocean-owned regional water needs enough depth clearance for the coarse horizon grid'
);
assert.doesNotMatch(
  terrainRuntimeSource,
  /updateTerrainAerialDetail/,
  'terrain runtime must expose only one mode-independent material pipeline'
);
assert.doesNotMatch(
  publicationSource,
  /aerial-surface-context|syncAerialSurfaceContext|aerialSurfaceContextState/,
  'LOD must not publish or reveal a replacement aerial surface'
);
assert.doesNotMatch(
  publicationSource,
  /scene\.fog\s*=\s*null|syncAerialFog|savedGroundFog/,
  'travel-mode changes must not replace the Earth fog model'
);
assert.doesNotMatch(publicationSource, /planeMode|droneMode|boatMode|walker|lodReferenceActor/, 'fixed world publication must not depend on traversal mode or actor');
assert.match(publicationSource, /mesh\.userData\?\.alwaysVisible \|\| appCtx\.landUseVisible === true/, 'persistent mapped land-use and water must remain in the fixed world');
assert.match(diagnosticsSource, /aerialReplacementMeshes/);
assert.match(diagnosticsSource, /suppressedTerrainMeshes/);
assert.match(locationTerrainSource, /for \(let dx = -activeRing; dx <= activeRing; dx \+= 1\)/);
assert.match(locationTerrainSource, /z: appCtx\.TERRAIN_ZOOM/);
assert.doesNotMatch(locationTerrainSource, /actor|speed|childTiles|terrainLeafPlan|terrainSegmentsForZoom/);
assert.equal(fs.existsSync(path.join(root, 'app/js/terrain/far-field.js')), true);
assert.match(terrainRuntimeSource, /createFarFieldTerrainApi|far-field\.js|updateFarTerrainClipmap/);
assert.match(
  terrainRuntimeSource,
  /sampleFarTerrainWorldYAt\?\.\(x, z\)/,
  'rendered fixed-location terrain must remain the traversal fallback outside detailed accepted ground'
);
assert.match(locationTerrainSource, /updateFarTerrainClipmap/);
assert.equal(FAR_FIELD_SOURCE_ZOOM_OFFSET, 3);
assert.equal(FAR_FIELD_OUTER_DISTANCE_METERS, 22000);
assert.equal(FAR_CONTEXT_HALF_EXTENT_METERS, 6500);
assert.equal(FAR_CONTEXT_ZOOM, 14);
assert.equal(FAR_WATER_CONTEXT_ZOOM, 11);
assert.equal(FAR_WATER_MIN_SPAN_METERS, 200);
assert.equal(FAR_CONTEXT_MAX_BUILDINGS, 10000);
const triangleSurfaceGrid = {
  xValues: [0, 10],
  zValues: [0, 10],
  worldYs: new Float32Array([0, 10, 20, 40]),
  detailedCoverage: []
};
assert.equal(
  sampleFarFieldGridWorldY(2, 3, triangleSurfaceGrid),
  8,
  'far traversal height must match the first rendered grid triangle'
);
assert.equal(
  sampleFarFieldGridWorldY(8, 7, triangleSurfaceGrid),
  27,
  'far traversal height must match the second rendered grid triangle'
);
assert.equal(
  sampleFarFieldGridWorldY(12, 5, triangleSurfaceGrid),
  null,
  'far traversal height must stop at the rendered fixed-location boundary'
);
const clippedOutside = clipTriangleOutsideBounds([
  { x: -20, z: 0 },
  { x: 20, z: -20 },
  { x: 20, z: 20 }
], { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
assert.ok(clippedOutside.length > 0, 'water crossing the detailed bounds must retain its far portion');
assert.equal(
  clippedOutside.some((polygon) => polygon.some((point) => (
    point.x > -10 && point.x < 10 && point.z > -10 && point.z < 10
  ))),
  false,
  'far water must not overlap the inner detailed-water owner'
);
const detailedWaterRing = Array.from({ length: 500 }, (_, index) => {
  const angle = index / 500 * Math.PI * 2;
  const radius = index % 2 === 0 ? 1 : 0.55;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
});
const retainedWaterRing = retainFarWaterRing(detailedWaterRing);
assert.equal(
  retainedWaterRing.length,
  detailedWaterRing.length + 1,
  'far mapped water must preserve source topology instead of deleting vertices by stride'
);
assert.doesNotMatch(
  farMappedContextSource,
  /FAR_WATER_MAX_RING_POINTS|FAR_WATER_VERTEX_SPACING_METERS/,
  'far mapped water must not use topology-breaking point-count simplification'
);
const polarBounds = { latS: -78.05, latN: -77.65, lonW: 165.7, lonE: 167.65 };
assert.ok(
  selectContextZoomForTileBudget(polarBounds, FAR_CONTEXT_ZOOM) < FAR_CONTEXT_ZOOM,
  'polar fixed-location context must step down from a tile-exploding Web Mercator zoom'
);
assert.equal(
  selectContextZoomForTileBudget({ latS: 39.23, latN: 39.35, lonW: -76.70, lonE: -76.52 }, FAR_CONTEXT_ZOOM),
  FAR_CONTEXT_ZOOM,
  'ordinary city context must retain its preferred detail zoom'
);
const axis = buildClipmapAxis(-100, -20, 30, 100, 15);
assert.equal(axis[0], -100);
assert.equal(axis.at(-1), 100);
assert.ok(axis.includes(-20) && axis.includes(30), 'far terrain must meet both exact near-grid seams');
assert.ok(axis.every((value, index) => index === 0 || value > axis[index - 1]));
assert.equal(cellInsideHole(0, 0, { minX: -20, maxX: 30, minZ: -10, maxZ: 10 }), true);
assert.equal(cellInsideDetailedCoverage(0, 0, [{ minX: -20, maxX: 30, minZ: -10, maxZ: 10 }]), true);
assert.doesNotMatch(
  `${farFieldSource}\n${farFieldGeometrySource}`,
  /if \(cellInsideHole\(centerX, centerZ, spec\.inner\)\) continue/,
  'far terrain must remain continuous below unavailable detailed edge tiles'
);
assert.match(farFieldGeometrySource, /cellInsideDetailedCoverage\(centerX, centerZ, spec\.detailedCoverage\)/);
assert.match(farFieldGeometrySource, /mappedWaterBedMetersAt/);
assert.doesNotMatch(
  farFieldSource,
  /publishedAreas\.some/,
  'far water must not carve partial-triangle holes from centroid-only overlap tests'
);
assert.match(
  farFieldSource,
  /polygonOffset: false/,
  'far water must use physical terrain separation rather than a depth-biased overlapping sheet'
);
assert.match(farFieldSource, /createFarFieldGeometryPlanner/);
assert.match(farFieldSource, /completeDetailedTileCoverage/);
assert.match(starMaterialSource, /skyBackgroundMaterial/);
assert.match(starMaterialSource, /material\.depthTest = false/);
assert.match(starMaterialSource, /material\.transparent = false/);
assert.match(starFieldSource, /skyBackground:\s*true/);
assert.match(starFieldSource, /renderOrder = -1000/);
assert.match(gaiaSource, /skyBackground:\s*true/);
assert.match(gaiaSource, /renderOrder = -1000/);
assert.match(farFieldSource, /FarMappedBuildingContext/);
assert.match(farFieldSource, /waitForFarTerrainClipmap/);
assert.match(farFieldSource, /contextGeographic/);
assert.doesNotMatch(farFieldSource, /actorX|actorZ/);
assert.match(farFieldSource, /surfaceMaterialOwner: 'fixed-location-shared-pbr'/);
assert.match(farFieldSource, /sourceZoomForTileBudget/);
assert.match(farFieldSource, /openstreetmap-shortbread/);
assert.match(farFieldSource, /camera\?\.far \|\| 0\) \* 1\.6/);
assert.doesNotMatch(farFieldSource, /sourceMeters\s*<=\s*0\.75/);
assert.doesNotMatch(farFieldSource, /surfaceColor:\s*'mapped-land-and-water/);
assert.match(farFieldSource, /FarMappedWaterContext/);
assert.match(farFieldSource, /isFarMappedWaterContext/);
assert.match(farFieldSource, /far-mapped-water-polygon-lod/);

const mappedWaterFixture = {
  outer: [[-76.8, 39.1], [-76.4, 39.1], [-76.4, 39.5], [-76.8, 39.5], [-76.8, 39.1]],
  holes: [[[-76.65, 39.25], [-76.55, 39.25], [-76.55, 39.35], [-76.65, 39.35], [-76.65, 39.25]]],
  bounds: { minLat: 39.1, maxLat: 39.5, minLon: -76.8, maxLon: -76.4 },
  kind: 'water'
};
assert.equal(pointInLonLatRing(-76.7, 39.2, mappedWaterFixture.outer), true, 'mapped water must retain its polygon boundary');
assert.equal(pointInLonLatRing(-76.6, 39.3, mappedWaterFixture.holes[0]), true, 'mapped islands must retain their water holes');
assert.equal(pointInLonLatRing(-76.6, 39.6, mappedWaterFixture.outer), false, 'unmapped space must never become water');
assert.match(diagnosticsSource, /farTerrainClipmap/);
assert.match(diagnosticsSource, /farMappedContexts/);

const { ctx } = await import('../app/js/shared-context.js?v=55');
const { publishLocationWorld } = await import('../app/js/world/publication.js?v=1');
const scene = {
  add(mesh) {
    mesh.parent = this;
    mesh.visible = true;
  },
  remove(mesh) {
    if (mesh.parent === this) mesh.parent = null;
  }
};
const building = {
  visible: true,
  parent: scene,
  userData: { lodCenter: { x: 20, z: 20 }, lodTier: 'near' }
};
const persistentGrass = {
  visible: false,
  parent: null,
  userData: { alwaysVisible: true, landuseType: 'grass' }
};
const persistentWater = {
  visible: false,
  parent: null,
  userData: { alwaysVisible: true, landuseType: 'water' }
};
Object.assign(ctx, {
  scene,
  addEarthWorldObject(object) {
    scene.add(object);
  },
  onMoon: false,
  travelingToMoon: false,
  isEnv: null,
  ENV: null,
  planeMode: { active: false },
  droneMode: false,
  car: { x: 0, z: 0 },
  drone: { x: 0, z: 0 },
  boatMode: { active: false },
  roadMeshes: [],
  urbanSurfaceMeshes: [],
  buildingMeshes: [building],
  landuseMeshes: [persistentGrass, persistentWater],
  poiMeshes: [],
  streetFurnitureMeshes: [],
  linearFeatureMeshes: [],
  landUseVisible: true,
  poiMode: false,
  renderQualityLevel: 'med',
  camMode: 0,
  setPerfLiveStat: () => {}
});
publishLocationWorld();
assert.equal(persistentGrass.parent, scene, 'fixed publication must restore persistent mapped grass');
assert.equal(persistentWater.parent, scene, 'fixed publication must restore persistent mapped water');
ctx.droneMode = true;
persistentGrass.visible = false;
persistentGrass.parent = null;
persistentWater.visible = false;
persistentWater.parent = null;
publishLocationWorld();
assert.equal(persistentGrass.parent, scene, 'drone mode must not change persistent mapped grass');
assert.equal(persistentWater.parent, scene, 'drone mode must not change persistent mapped water');

console.log(JSON.stringify({
  ok: true,
  contract: 'fixed-world-horizon-architecture',
  terrainZoom: 15,
  terrainMaterialAuthority: 'mode-independent',
  regionalMapPlane: 'deleted',
  fogPolicy: 'mode-independent',
  nearTerrainAuthority: 'uniform-z15-grid',
  farTerrainAuthority: 'fixed-location-clipmap',
  farWaterOwner: 'exact-mapped-water-polygon-lod'
}, null, 2));
