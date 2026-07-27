import assert from 'node:assert/strict';
import {
  SOURCE_PROFILE,
  SURFACE_KIND,
  createSurfaceQuery,
  createSurfaceSample,
  createSurfaceTileDescriptor,
  provenanceFor,
  surfaceComposition
} from '../app/js/world/surface-contract.js';
import { waterSurfaceBaseElevation } from '../app/js/world/load-geometry.js';
import {
  WATER_BODY_SCHEMA_VERSION,
  normalizeWaterBody,
  reconcileWaterBodySurface,
  resolveWaterBodySurfaceY
} from '../app/js/world/water-body-contract.js';
import { isWalkFeatureSurfaceReachable } from '../app/js/ground.js';
import { buildingOccupiesActorHeight } from '../app/js/building-entry.js';
import { finishWorldLoadRuntimeSession } from '../app/js/world/load-runtime-session.js';

const appCtx = {
  METERS_PER_WORLD_UNIT: 2,
  getContinuousWorldEnabled: () => false,
  terrainTileCache: new Map([['15/1/1', { loaded: true, elev: new Float32Array(4) }]])
};
const GroundHeight = {
  terrainY: () => 12,
  walkSurfaceInfo: () => ({ y: 13, source: 'road', feature: { id: 7, tags: { _geometrySource: 'shortbread' } }, dist: 0.4, pt: { x: 1.2, z: 2.1 } }),
  _computeNormal: () => ({ x: 0, y: 2, z: 0 }),
  driveSurfaceInfo: (_x, _z, preferRoad) => preferRoad
    ? { y: 13, source: 'road', road: { id: 7, tags: { _geometrySource: 'shortbread' } }, roadDist: 0.4, roadPt: { x: 1.2, z: 2.1 } }
    : { y: 12, source: 'terrain', road: null, roadDist: Infinity },
  driveSurfaceY: (_x, _z, preferRoad) => preferRoad ? 13 : 12,
  sample: () => ({ y: 13, source: 'road', road: { id: 7, tags: { _geometrySource: 'shortbread' } }, roadDist: 0.4, normal: { x: 0, y: 2, z: 0 } })
};

const query = createSurfaceQuery(appCtx, GroundHeight);
assert.equal(query.getSourceProfile(), SOURCE_PROFILE.LOCATION_OSM);
assert.deepEqual(query.getTraversalBounds(), { horizontalRadius: 5000, originRebase: false });
assert.equal(query.terrainAt(1, 2).kind, SURFACE_KIND.TERRAIN);
assert.equal(query.walkAt(1, 2).kind, SURFACE_KIND.ROAD);
assert.deepEqual(query.walkAt(1, 2).contact, { x: 1.2, y: 13, z: 2.1 });
assert.equal(query.driveAt(1, 2, { includeNormal: true }).normal.y, 1);
assert.equal(query.driveAt(1, 2).provenance.dataset, 'OSM Shortbread vector tiles');
assert.equal(query.driveAt(1, 2).position.y, GroundHeight.driveSurfaceY(1, 2, true));
assert.equal(query.driveAt(1, 2, { preferRoad: false }).position.y, GroundHeight.terrainY(1, 2));

appCtx.getContinuousWorldEnabled = () => true;
assert.equal(query.getSourceProfile(), SOURCE_PROFILE.CONTINUOUS_GLOBAL);
assert.deepEqual(query.getTraversalBounds(), { horizontalRadius: null, originRebase: true });

const tile = createSurfaceTileDescriptor({ z: 3, x: -1, y: 99, profile: SOURCE_PROFILE.CONTINUOUS_GLOBAL });
assert.equal(tile.key, '3/7/7');
assert.equal(tile.profile, SOURCE_PROFILE.CONTINUOUS_GLOBAL);

const sample = createSurfaceSample({ kind: SURFACE_KIND.WATER, y: 4, metersPerWorldUnit: 2 });
assert.equal(sample.vertical.elevationMeters, 8);
assert.equal(sample.traversal.boat, true);
assert.equal(sample.traversal.drive, false);

assert.equal(waterSurfaceBaseElevation([-480, -455, -430, 0]), 0);
assert.equal(waterSurfaceBaseElevation([-20, -10, 2, 12]), 0);
assert.equal(waterSurfaceBaseElevation([0, 1698, 1702, 1699, 1701]), 1698);
assert.equal(waterSurfaceBaseElevation([0, 4.8, 5.1, 5.2]), 4.8);

const ocean = normalizeWaterBody({
  shape: 'area',
  pts: [{ x: -1000, z: -1000 }, { x: 1000, z: -1000 }, { x: 1000, z: 1000 }, { x: -1000, z: 1000 }],
  surfaceY: 0.08,
  kindHint: 'ocean',
  geometrySource: 'osm-shortbread',
  layer: 'ocean'
});
assert.equal(ocean.waterSchemaVersion, WATER_BODY_SCHEMA_VERSION);
assert.equal(ocean.waterKind, 'open_ocean');
assert.equal(ocean.navigable, true);
assert.equal(ocean.datum.method, 'dem-water-surface');
assert.equal(resolveWaterBodySurfaceY(ocean, 0, 0), 0.08);

const elevatedLake = normalizeWaterBody({
  shape: 'area',
  pts: [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }],
  surfaceY: 1698.08,
  geometrySource: 'overture-vector',
  layer: 'water_polygons'
});
assert.equal(elevatedLake.waterKind, 'lake');
assert.equal(resolveWaterBodySurfaceY(elevatedLake, 0, 0), 1698.08);

const delayedElevationLake = normalizeWaterBody({
  shape: 'area',
  pts: elevatedLake.pts,
  surfaceY: 0.08,
  layer: 'water_polygons',
  kindHint: 'water_polygons'
});
assert.notEqual(delayedElevationLake.waterKind, 'lake');
reconcileWaterBodySurface(delayedElevationLake, 1698.08, { datumMethod: 'terrain-reprojection' });
assert.equal(delayedElevationLake.waterKind, 'lake');
assert.equal(delayedElevationLake.datum.method, 'terrain-reprojection');

const narrowStream = normalizeWaterBody({
  shape: 'waterway',
  type: 'stream',
  pts: [{ x: 0, z: 0 }, { x: 80, z: 0 }],
  width: 6,
  navigable: false,
  surfaceProfile: [{ x: 0, z: 0, y: 42.14 }, { x: 80, z: 0, y: 41.8 }]
});
assert.equal(narrowStream.navigable, false);
assert.equal(narrowStream.waterKind, 'harbor');
assert.equal(resolveWaterBodySurfaceY(narrowStream, 10, 0, {
  sampleWaterwayProfile: (profile) => profile[0].y
}), 42.14);

const inferred = provenanceFor({ id: 'fallback-1', tags: { _geometrySource: 'inferred' } });
assert.equal(inferred.fallback, true);
assert.ok(inferred.confidence <= 0.45);

const surfaceOrder = ['grass', 'farmland', 'residential', 'pedestrian', 'transportation']
  .map((kind) => surfaceComposition(kind));
for (let index = 1; index < surfaceOrder.length; index += 1) {
  assert.ok(surfaceOrder[index].layer > surfaceOrder[index - 1].layer);
  assert.ok(surfaceOrder[index].surfaceOffset > surfaceOrder[index - 1].surfaceOffset);
}
assert.ok(surfaceComposition('', 'road').layer > surfaceOrder.at(-1).layer);

const atGradeFootway = {
  structureSemantics: { gradeSeparated: false, terrainMode: 'at_grade' }
};
const tunnelFootway = {
  structureSemantics: { gradeSeparated: true, terrainMode: 'subgrade' }
};
const bridgeFootway = {
  structureSemantics: { gradeSeparated: true, terrainMode: 'elevated' }
};
assert.equal(isWalkFeatureSurfaceReachable(atGradeFootway, {
  terrainY: 50,
  surfaceY: 47
}), false);
assert.equal(isWalkFeatureSurfaceReachable(atGradeFootway, {
  terrainY: 50,
  surfaceY: 50.2
}), true);
assert.equal(isWalkFeatureSurfaceReachable(tunnelFootway, {
  terrainY: 50,
  surfaceY: 47
}), false);
assert.equal(isWalkFeatureSurfaceReachable(tunnelFootway, {
  currentY: 50,
  terrainY: 50,
  surfaceY: 47
}), false);
assert.equal(isWalkFeatureSurfaceReachable(tunnelFootway, {
  currentY: 47.1,
  terrainY: 50,
  surfaceY: 47
}), true);
assert.equal(isWalkFeatureSurfaceReachable(bridgeFootway, {
  currentY: 50,
  terrainY: 50,
  surfaceY: 55
}), false);
assert.equal(isWalkFeatureSurfaceReachable(bridgeFootway, {
  currentY: 50.4,
  terrainY: 50,
  surfaceY: 50.6
}), true);

const elevatedBuildingPart = {
  minY: 56.1,
  maxY: 59.3,
  height: 3.2,
  collisionKind: 'elevated_part',
  allowsPassageBelow: true
};
assert.equal(buildingOccupiesActorHeight(elevatedBuildingPart, 49.1, 1.62), false);
assert.equal(buildingOccupiesActorHeight(elevatedBuildingPart, 56.2, 1.62), true);
assert.equal(buildingOccupiesActorHeight({ baseY: 48.8, height: 8 }, 49.1, 1.62), true);
assert.equal(buildingOccupiesActorHeight({ height: 8 }, 49.1, 1.62), true);

const loadCommitEvents = [];
const loadRuntimeState = {
  status: 'loading',
  activePhases: ['terrain'],
  geometryReady: true
};
const loadCommitContext = {
  SCALE: 100000,
  worldLoading: true,
  roads: [],
  buildingMeshes: [],
  buildings: [],
  poiMeshes: [],
  landuseMeshes: [],
  linearFeatures: [],
  linearFeatureMeshes: [],
  enforceEnvironmentSceneOwnership: () => loadCommitEvents.push('ownership'),
  setPerfLiveStat: () => {},
  reconcileActorsAfterSurfaceRebuild: () => {
    assert.equal(loadCommitContext.worldLoading, true);
    loadCommitEvents.push('reconcile');
  },
  hideLoad: () => {
    assert.equal(loadCommitContext.worldLoading, false);
    loadCommitEvents.push('hide');
  }
};
finishWorldLoadRuntimeSession({
  appCtx: loadCommitContext,
  finalizePerfLoad: () => loadCommitEvents.push('metrics'),
  loadMetrics: {
    activeRadiusDeg: 0.01,
    lod: { near: 0, mid: 0 },
    roads: { vertices: 0 },
    colliders: { full: 0, simplified: 0 }
  },
  phaseTotals: {},
  runtimeState: loadRuntimeState,
  loaded: true
});
assert.deepEqual(loadCommitEvents.slice(0, 3), ['ownership', 'reconcile', 'hide']);
assert.equal(loadCommitContext.worldLoading, false);
assert.equal(loadCommitContext.initialEarthWorldReady, true);
assert.equal(loadRuntimeState.status, 'ready');
assert.equal(loadRuntimeState.activePhases.length, 0);

console.log(JSON.stringify({
  ok: true,
  profiles: Object.values(SOURCE_PROFILE),
  kinds: Object.values(SURFACE_KIND),
  tileKey: tile.key,
  verticalDatum: sample.vertical.id,
  surfaceLayers: surfaceOrder.map((entry) => entry.layer),
  gradeSeparatedWalkAttachment: 'vertical-and-transition-aware',
  buildingEntryAttachment: 'vertical-occupancy-aware',
  worldLoadCommit: 'reconcile-before-reveal'
}, null, 2));
