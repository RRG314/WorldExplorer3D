import assert from 'node:assert/strict';
import {
  classifyBuildingWaterRelationship,
  classifyMappedWaterStructure,
  createWaterAreaSpatialIndex,
  footprintWaterCoverage,
  mappedVesselVerticalProfile
} from '../app/js/world/water-adjacent-structures.js?v=3';
import {
  distanceToWaterBoundary,
  pointInWaterBody
} from '../app/js/world/water-surface-registry.js?v=3';
import { waterSurfaceBaseElevation } from '../app/js/world/water-body-contract.js?v=3';
import { waterBedDepthAtShorelineDistance } from '../app/js/terrain/water-terrain-mask.js?v=1';
import { mappedWaterReprojectionBase } from '../app/js/terrain/reprojection.js?v=12';
import {
  mappedWaterStructurePriority,
  mergeMappedWaterStructures
} from '../app/js/world/water-structure-source.js?v=3';
import { shouldFetchSupplementalWaterStructures } from '../app/js/world/load-building-detail.js?v=22';

const water = {
  shape: 'area',
  surfaceY: 0.08,
  bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
  pts: [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
    { x: 0, z: 100 }
  ],
  holes: []
};
const rectangle = (minX, minZ, maxX, maxZ) => [
  { x: minX, z: minZ },
  { x: maxX, z: minZ },
  { x: maxX, z: maxZ },
  { x: minX, z: maxZ }
];

assert.equal(pointInWaterBody(water, 50, 50), true);
assert.equal(distanceToWaterBoundary(water, 5, 50), 5);
assert.equal(distanceToWaterBoundary(water, 50, 50), 50);
assert.equal(
  waterBedDepthAtShorelineDistance(0),
  0,
  'Mapped water must meet terrain at the exact shoreline instead of exposing a raised slab edge.'
);
assert.equal(waterBedDepthAtShorelineDistance(3), 0.3);
assert.equal(waterBedDepthAtShorelineDistance(6), 0.6);

const submergedBuilding = classifyBuildingWaterRelationship(
  { building: 'yes' },
  rectangle(20, 20, 30, 30),
  [water]
);
assert.equal(submergedBuilding.action, 'suppress_water_overlap');
assert(submergedBuilding.coverage.ratio > 0.9);

const waterfrontBuilding = classifyBuildingWaterRelationship(
  { building: 'yes' },
  rectangle(-8, 20, 5, 30),
  [water]
);
assert.equal(waterfrontBuilding.action, 'render_building');

const pier = classifyBuildingWaterRelationship(
  { building: 'yes', man_made: 'pier' },
  rectangle(20, 20, 30, 30),
  [water]
);
assert.equal(pier.action, 'render_structure');

const ship = classifyBuildingWaterRelationship(
  { building: 'ship', historic: 'ship', name: 'Mapped Museum Ship' },
  rectangle(40, 40, 60, 48),
  [water]
);
assert.equal(ship.action, 'render_vessel');
assert.equal(ship.coverage.primaryWater, water);
assert.equal(classifyMappedWaterStructure({ historic: 'ship' }).vessel, true);
assert.equal(mappedWaterStructurePriority({ historic: 'ship' }), 1000);
assert.equal(mappedWaterStructurePriority({ building: 'yes' }), 0);
assert.equal(shouldFetchSupplementalWaterStructures({
  authoritativeMassing: true,
  waterStructureQueryAvailable: true,
  primaryCoverageComplete: true,
  semanticVessels: 0
}), false, 'A completed primary OSM vessel query must not be requested a second time.');
assert.equal(shouldFetchSupplementalWaterStructures({
  authoritativeMassing: true,
  waterStructureQueryAvailable: true,
  primaryCoverageComplete: false,
  semanticVessels: 0
}), true, 'Shortbread fallback coverage still requires the exact supplemental vessel query.');
assert.equal(shouldFetchSupplementalWaterStructures({
  authoritativeMassing: true,
  waterStructureQueryAvailable: true,
  primaryCoverageComplete: false,
  semanticVessels: 1
}), false, 'Existing mapped vessel evidence must not trigger a duplicate provider request.');

const vesselProfile = mappedVesselVerticalProfile(water.surfaceY);
assert.equal(vesselProfile.hullBottomY, water.surfaceY - 0.42);
assert(vesselProfile.waterlineClearance >= 1.18, 'Mapped vessel hull must remain visibly above opaque water.');

const adjacentShipCoverage = footprintWaterCoverage(
  rectangle(102, 40, 112, 48),
  [water]
);
assert.equal(adjacentShipCoverage.primaryWater, water, 'A mapped ship beside a water polygon hole inherits the nearby datum.');

const distantWaterAreas = Array.from({ length: 500 }, (_, index) => {
  const minX = 1000 + index * 150;
  return {
    shape: 'area',
    surfaceY: index,
    bounds: { minX, maxX: minX + 40, minZ: 1000, maxZ: 1040 },
    pts: rectangle(minX, 1000, minX + 40, 1040),
    holes: []
  };
});
const indexedWaterAreas = [water, ...distantWaterAreas];
const waterAreaIndex = createWaterAreaSpatialIndex(indexedWaterAreas);
const indexedSubmergedBuilding = classifyBuildingWaterRelationship(
  { building: 'yes' },
  rectangle(20, 20, 30, 30),
  indexedWaterAreas,
  { waterAreaIndex }
);
assert.equal(indexedSubmergedBuilding.action, submergedBuilding.action);
assert.equal(indexedSubmergedBuilding.coverage.primaryWater, water);
const indexedAdjacentCoverage = footprintWaterCoverage(
  rectangle(102, 40, 112, 48),
  indexedWaterAreas,
  { waterAreaIndex }
);
assert.equal(indexedAdjacentCoverage.primaryWater, adjacentShipCoverage.primaryWater);
assert(
  waterAreaIndex.snapshot().averageCandidatesPerQuery < indexedWaterAreas.length * 0.05,
  'Mapped-water lookup should remain local instead of scanning every location water polygon.'
);

assert.equal(
  waterSurfaceBaseElevation([0, 0, 0.1, 0.2, 7, 9]),
  0,
  'Interior water samples keep low tidal water from inheriting high shoreline DSM points.'
);
assert.equal(
  waterSurfaceBaseElevation([182, 183, 183, 184, 185]),
  182,
  'Elevated inland water retains its DEM datum.'
);
assert.equal(
  mappedWaterReprojectionBase({
    userData: {
      waterSourceLayer: 'ocean',
      waterSurfaceBase: 52
    }
  }, [41, 48, 54]),
  0,
  'Ocean reprojection must restore sea level instead of lifting mapped water to shoreline terrain.'
);
assert.equal(
  mappedWaterReprojectionBase({
    userData: {
      waterSourceLayer: 'water_polygons',
      waterSurfaceBase: 182
    }
  }, [205, 209, 214]),
  182,
  'Inland water reprojection must preserve its published interior datum instead of replacing it with boundary land.'
);

const overtureData = {
  _overpassSource: 'overture-buildings-pmtiles',
  elements: [
    { type: 'node', id: -1, lat: 39.285, lon: -76.612 },
    { type: 'node', id: -2, lat: 39.2851, lon: -76.612 },
    { type: 'node', id: -3, lat: 39.2851, lon: -76.6118 },
    { type: 'way', id: -1, nodes: [-1, -2, -3, -1], tags: { building: 'yes', _geometrySource: 'overture' } }
  ]
};
const semanticShipData = {
  _overpassSource: 'osm-overpass',
  elements: [
    { type: 'node', id: 1, lat: 39.285, lon: -76.612 },
    { type: 'node', id: 2, lat: 39.2851, lon: -76.612 },
    { type: 'node', id: 3, lat: 39.2851, lon: -76.6118 },
    { type: 'way', id: 10, nodes: [1, 2, 3, 1], tags: { building: 'ship', historic: 'ship', name: 'Museum Ship' } }
  ]
};
const semanticMerge = mergeMappedWaterStructures(overtureData, semanticShipData, { lat: 39.285 });
assert.equal(semanticMerge.semanticVessels, 1);
assert.equal(semanticMerge.suppressedGenericFootprints, 1);
assert.equal(semanticMerge.appendedWays, 1);
assert.equal(overtureData.elements.some((element) => element.type === 'way' && element.id === -1), false);
assert.equal(overtureData.elements.some((element) => element.type === 'way' && element.tags?.building === 'ship'), true);

console.log('Hydrology integration contract passed.');
