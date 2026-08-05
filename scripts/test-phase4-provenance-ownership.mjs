import assert from 'node:assert/strict';
import {
  compileBuildingProvenance,
  createBuildingProvenanceSnapshot,
  shouldSuppressBuildingParent
} from '../app/js/world/building-provenance-model.js';
import { mergeBuildingMetadata } from '../app/js/world/building-metadata.js';
import {
  normalizeWaterBody
} from '../app/js/world/water-body-contract.js';
import {
  createWaterSurfaceRegistry,
  pointInWaterBody
} from '../app/js/world/water-surface-registry.js';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import { findNearestBoatCandidate } from '../app/js/boat-mode/water-query.js';
import {
  createBuildingRoadFootprintGuards
} from '../app/js/world/building-road-footprint.js';

const roadFootprintGuards = await createBuildingRoadFootprintGuards({
  roads: [{
    pts: [{ x: -5, z: -8 }, { x: 5, z: -8 }],
    width: 8
  }]
});
const roadEnclosingFootprint = [
  { x: -50, z: -20 },
  { x: 50, z: -20 },
  { x: 50, z: 40 },
  { x: -50, z: 40 }
];
assert.equal(
  roadFootprintGuards.footprintIntersectsRoadCenterline(roadEnclosingFootprint),
  true,
  'A building enclosing a road core must be rejected even when its boundary and centroid miss the road.'
);
assert.equal(
  roadFootprintGuards.footprintIntersectsRoadCenterline([
    { x: -8, z: -4 }, { x: 8, z: -4 }, { x: 8, z: 8 }, { x: -8, z: 8 }
  ]),
  false,
  'An adjacent building must not be deleted merely because it shares a coarse road grid cell.'
);

const mappedBuilding = compileBuildingProvenance({
  building: 'office',
  height: '42',
  min_height: '4',
  'roof:shape': 'gabled',
  'building:material': 'brick',
  name: 'Mapped Landmark',
  _sourceFeatureId: 'overture:building-1',
  _geometrySource: 'overture',
  _geometryCoverageComplete: 'yes'
}, {
  fallbackIdentity: 'building-1',
  heightMeters: 42,
  levels: 13,
  baseOffsetMeters: 4,
  foundationBaseY: 18.25,
  minimumGroundY: 17.8,
  maximumGroundY: 19.1,
  foundationSampleCount: 9
});
assert.equal(mappedBuilding.valid, true);
assert.equal(mappedBuilding.fields.heightMeters.status, 'mapped');
assert.equal(mappedBuilding.fields.levels.status, 'inferred');
assert.equal(mappedBuilding.fields.roofShape.status, 'mapped');
assert.equal(mappedBuilding.landmark.genericOverrideAllowed, false);
assert.equal(mappedBuilding.foundation.authority, 'accepted_ground');
assert.equal(mappedBuilding.foundation.terrainMutation, false);
assert.equal(mappedBuilding.foundation.baseY, 18.25);

const inferredBuilding = compileBuildingProvenance({
  building: 'yes',
  _sourceFeatureId: 'shortbread:building-2',
  _geometrySource: 'shortbread-vector',
  _geometryCoverageComplete: 'yes'
}, {
  heightMeters: 11.5,
  levels: 4,
  baseOffsetMeters: 0,
  fallbackIdentity: 'building-2'
});
assert.equal(inferredBuilding.fields.heightMeters.status, 'inferred');
assert.equal(inferredBuilding.geometry.inferred, false);

const ambiguousBuilding = compileBuildingProvenance({
  building: 'yes',
  _sourceFeatureId: 'shortbread:building-3',
  _geometrySource: 'shortbread-vector',
  _buildingMetadataSourceId: 'osm:way:33'
});
assert.equal(ambiguousBuilding.valid, false);
assert.equal(ambiguousBuilding.invalidReason, 'ambiguous_cross_source_metadata');

const snapshot = createBuildingProvenanceSnapshot([mappedBuilding, inferredBuilding]);
assert.equal(snapshot.featureCount, 2);
assert.equal(snapshot.validCount, 2);
assert.deepEqual(snapshot.duplicateFeatureIds, []);
assert.equal(Object.isFrozen(snapshot), true);

const parentIds = new Set(['parent-1']);
assert.equal(shouldSuppressBuildingParent({
  coverageComplete: false,
  hasParts: true,
  stableId: 'parent-1',
  parentIdsWithParts: parentIds
}), false, 'Partial tile coverage must retain the parent shell.');
assert.equal(shouldSuppressBuildingParent({
  coverageComplete: true,
  hasParts: true,
  stableId: 'parent-1',
  parentIdsWithParts: parentIds
}), true, 'Complete cross-tile part assembly may suppress the parent shell.');

const proximityOnlyFootprint = {
  elements: [{
    type: 'way',
    id: 1,
    nodes: [1, 2, 3, 1],
    tags: {
      building: 'yes',
      _geometrySource: 'shortbread-vector',
      _sourceFeatureId: 'shortbread:14:1:2:3'
    }
  }]
};
const osmMetadata = {
  _overpassSource: 'osm-overpass',
  elements: [{
    type: 'way',
    id: 33,
    center: { lat: 39, lon: -76 },
    tags: { building: 'office', height: '40', name: 'Wrong Nearby Building' }
  }]
};
mergeBuildingMetadata(proximityOnlyFootprint, osmMetadata, { lat: 39, lon: -76 });
assert.equal(proximityOnlyFootprint.elements[0].tags.height, undefined);
assert.equal(proximityOnlyFootprint._buildingMetadata.matched, 0);
assert.equal(proximityOnlyFootprint._buildingMetadata.rejectedAmbiguous, 1);

const stableFootprint = structuredClone(proximityOnlyFootprint);
stableFootprint.elements[0].tags._osmFeatureId = 'osm:way:33';
mergeBuildingMetadata(stableFootprint, osmMetadata, { lat: 39, lon: -76 });
assert.equal(stableFootprint.elements[0].tags.height, '40');
assert.equal(stableFootprint.elements[0].tags._buildingMetadataMapping, 'explicit_stable_id');

const square = (minX, minZ, maxX, maxZ) => [
  { x: minX, z: minZ },
  { x: maxX, z: minZ },
  { x: maxX, z: maxZ },
  { x: minX, z: maxZ }
];
const outer = square(-100, -100, 100, 100);
const islandHole = square(-15, -15, 15, 15);
const publicLake = normalizeWaterBody({
  shape: 'area',
  pts: outer,
  holes: [islandHole],
  sourceFeatureId: 'shortbread:lake-1',
  geometrySource: 'osm-shortbread',
  layer: 'water_polygons',
  kindHint: 'lake',
  surfaceY: 5
});
assert.equal(publicLake.navigable, true);
assert.equal(pointInWaterBody(publicLake, 60, 0), true);
assert.equal(pointInWaterBody(publicLake, 0, 0), false, 'Island holes are not boat water.');

const privateLake = normalizeWaterBody({
  shape: 'area',
  pts: outer,
  sourceFeatureId: 'osm:private-lake',
  geometrySource: 'osm-overpass',
  kindHint: 'lake',
  access: 'private'
});
assert.equal(privateLake.navigable, false);

const tinyPool = normalizeWaterBody({
  shape: 'area',
  pts: square(0, 0, 12, 8),
  sourceFeatureId: 'osm:pool',
  geometrySource: 'osm-overpass',
  surfaceType: 'swimming_pool'
});
assert.equal(tinyPool.navigable, false);

const registry = createWaterSurfaceRegistry();
const firstRegistration = registry.register(publicLake);
assert.equal(firstRegistration.accepted, true);
const higherPriorityLake = normalizeWaterBody({
  shape: 'area',
  pts: outer,
  holes: [islandHole],
  sourceFeatureId: 'osm:lake-1',
  geometrySource: 'osm-overpass',
  layer: 'landuse',
  kindHint: 'lake',
  surfaceY: 5
});
const replacement = registry.register(higherPriorityLake);
assert.equal(replacement.accepted, true);
assert.equal(replacement.replacements.length, 1);
assert.equal(registry.snapshot().surfaceCount, 1);
assert.deepEqual(registry.snapshot().duplicateRegistryIds, []);
assert.equal(registry.snapshot().records[0].authority, 'water_surface_registry');

const nestedRegistry = createWaterSurfaceRegistry();
const harbor = normalizeWaterBody({
  shape: 'area',
  pts: square(-1000, -1000, 1000, 1000),
  sourceFeatureId: 'shortbread:harbor',
  geometrySource: 'osm-shortbread',
  layer: 'water_polygons',
  kindHint: 'harbor',
  surfaceY: 0
});
const nestedBasin = normalizeWaterBody({
  shape: 'area',
  pts: square(-20, -20, 20, 20),
  sourceFeatureId: 'osm:nested-basin',
  geometrySource: 'osm-overpass',
  layer: 'landuse',
  kindHint: 'basin',
  surfaceY: 0
});
assert.equal(nestedRegistry.register(harbor).accepted, true);
const nestedRegistration = nestedRegistry.register(nestedBasin);
assert.equal(nestedRegistration.accepted, true);
assert.equal(nestedRegistration.replacements.length, 0);
assert.equal(
  nestedRegistry.snapshot().surfaceCount,
  2,
  'A small nested water feature must not replace its containing harbor polygon.'
);

appCtx.waterAreas = [higherPriorityLake, privateLake];
appCtx.waterways = [];
appCtx.boatMode = { waterKind: null };
appCtx.elevationWorldYAtWorldXZ = () => 5;
appCtx.terrainMeshHeightAt = () => 5;
assert.equal(
  findNearestBoatCandidate(106, 0),
  null,
  'Boat selection must not activate solely because water is nearby.'
);
assert.equal(
  findNearestBoatCandidate(0, 0),
  null,
  'Boat selection must reject an island hole inside a water polygon.'
);
const containedCandidate = findNearestBoatCandidate(60, 0);
assert(containedCandidate, 'Contained navigable water should produce a boat candidate.');
assert.equal(containedCandidate.inside, true);
assert.equal(containedCandidate.source.registryProvenance.authority, 'water_surface_registry');
assert.equal(
  findNearestBoatCandidate(60, 0, 58, { referenceY: -5 }),
  null,
  'A tunnel actor below a containing water polygon must not enter boat mode.'
);

console.log(JSON.stringify({
  ok: true,
  building: {
    schemaVersion: mappedBuilding.schemaVersion,
    snapshotFeatures: snapshot.featureCount,
    ambiguousMetadataRejected: proximityOnlyFootprint._buildingMetadata.rejectedAmbiguous,
    partialParentRetained: true,
    enclosedRoadCoreRejected: true
  },
  water: {
    schemaVersion: higherPriorityLake.waterSchemaVersion,
    surfaceCount: registry.snapshot().surfaceCount,
    holeContainment: true,
    privateRejected: true,
    nestedWaterRetained: true,
    proximityRejected: true,
    submergedTunnelRejected: true,
    containedBoatEligible: true
  }
}, null, 2));
