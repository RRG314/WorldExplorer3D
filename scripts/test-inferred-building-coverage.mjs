import assert from 'node:assert/strict';
import {
  inferRoadFrontageFootprints,
  supplementSparseBuildingData
} from '../app/js/world/inferred-building-footprints.js';

function rectangle(minX, minZ, maxX, maxZ) {
  return [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ }
  ];
}

function road(id, z = 0, type = 'residential') {
  return {
    sourceFeatureId: id,
    type,
    width: 5,
    pts: [{ x: -240, z }, { x: 240, z }]
  };
}

const developed = inferRoadFrontageFootprints({
  roads: [road('residential-main')],
  landuses: [{ type: 'residential', pts: rectangle(-300, -120, 300, 120) }],
  waterAreas: [],
  existingFootprints: [],
  radius: 280,
  maxFootprints: 40
});
assert(developed.footprints.length >= 10, 'mapped residential landuse should support bounded inferred footprints');
assert.equal(developed.basis, 'mapped_developed_landuse_and_road_frontage');

const roadEvidence = inferRoadFrontageFootprints({
  roads: [road('residential-a', -50), road('residential-b', 0), road('residential-c', 50)],
  landuses: [],
  waterAreas: [],
  existingFootprints: [],
  radius: 280,
  maxFootprints: 40
});
assert(roadEvidence.footprints.length >= 10, 'multiple mapped residential streets should support conservative frontage inference');
assert.equal(roadEvidence.basis, 'mapped_residential_road_frontage');

const waterBlocked = inferRoadFrontageFootprints({
  roads: [road('residential-water')],
  landuses: [{ type: 'residential', pts: rectangle(-300, -120, 300, 120) }],
  waterAreas: [{ type: 'water', pts: rectangle(-300, -120, 300, 120) }],
  existingFootprints: [],
  radius: 280,
  maxFootprints: 40
});
assert.equal(waterBlocked.footprints.length, 0, 'inferred buildings must never occupy mapped water');

const farmlandBlocked = inferRoadFrontageFootprints({
  roads: [road('farm-road-a', -40), road('farm-road-b', 0), road('farm-road-c', 40)],
  landuses: [{ type: 'farmland', pts: rectangle(-300, -120, 300, 120) }],
  waterAreas: [],
  existingFootprints: [],
  radius: 280,
  maxFootprints: 40
});
assert.equal(farmlandBlocked.footprints.length, 0, 'inferred buildings must not blanket mapped farmland');

const occupied = inferRoadFrontageFootprints({
  roads: [road('residential-occupied')],
  landuses: [{ type: 'residential', pts: rectangle(-300, -120, 300, 120) }],
  waterAreas: [],
  existingFootprints: [{
    points: rectangle(-300, -120, 300, 120),
    bounds: { minX: -300, minZ: -120, maxX: 300, maxZ: 120 }
  }],
  radius: 280,
  maxFootprints: 40
});
assert.equal(occupied.footprints.length, 0, 'inferred footprints must not overlap mapped buildings');

const sparseData = {
  elements: [],
  _overpassSource: 'shortbread-vector-buildings',
  _shortbreadTiles: { loaded: 4, requested: 4, failed: 0, zoom: 14 }
};
const sparseContext = {
  selLoc: 'custom',
  LOC: { lat: 39.4, lon: -76.6 },
  SCALE: 111320,
  roads: [road('custom-a', -50), road('custom-b', 0), road('custom-c', 50)],
  landuses: [],
  waterAreas: [],
  geoToWorld(lat, lon) {
    return {
      x: (lon - this.LOC.lon) * this.SCALE * Math.cos(this.LOC.lat * Math.PI / 180),
      z: -(lat - this.LOC.lat) * this.SCALE
    };
  }
};
const sparseSummary = supplementSparseBuildingData(sparseData, sparseContext, {
  radius: 280,
  maxFootprints: 40
});
const inferredWays = sparseData.elements.filter((element) => element.type === 'way');
assert(sparseSummary.added >= 10, 'custom sparse integration should append bounded inferred ways');
assert.equal(inferredWays.length, sparseSummary.added);
assert(inferredWays.every((way) => way.tags?._geometrySource === 'inferred_road_frontage'));
assert(inferredWays.every((way) => way.tags?._inferenceBasis === 'mapped_residential_road_frontage'));
assert.equal(sparseData._inferredBuildings.added, sparseSummary.added);

console.log(JSON.stringify({
  ok: true,
  developedFootprints: developed.footprints.length,
  roadEvidenceFootprints: roadEvidence.footprints.length,
  integratedSparseFootprints: sparseSummary.added,
  protectedCases: ['water', 'farmland', 'mapped_buildings']
}, null, 2));
