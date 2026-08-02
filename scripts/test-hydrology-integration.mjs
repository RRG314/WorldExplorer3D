import assert from 'node:assert/strict';
import {
  classifyBuildingWaterRelationship,
  classifyMappedWaterStructure,
  footprintWaterCoverage,
  mappedVesselVerticalProfile
} from '../app/js/world/water-adjacent-structures.js?v=2';
import {
  distanceToWaterBoundary,
  pointInWaterBody
} from '../app/js/world/water-surface-registry.js?v=3';
import { waterSurfaceBaseElevation } from '../app/js/world/water-body-contract.js?v=3';
import {
  mappedWaterStructurePriority,
  mergeMappedWaterStructures
} from '../app/js/world/water-structure-source.js?v=3';

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

const vesselProfile = mappedVesselVerticalProfile(water.surfaceY);
assert.equal(vesselProfile.hullBottomY, water.surfaceY - 0.42);
assert(vesselProfile.waterlineClearance >= 1.18, 'Mapped vessel hull must remain visibly above opaque water.');

const adjacentShipCoverage = footprintWaterCoverage(
  rectangle(102, 40, 112, 48),
  [water]
);
assert.equal(adjacentShipCoverage.primaryWater, water, 'A mapped ship beside a water polygon hole inherits the nearby datum.');

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
