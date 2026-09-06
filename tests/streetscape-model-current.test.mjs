import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STREETSCAPE_GENERATOR_VERSION,
  buildStreetscapeModel,
  resolveRoadStreetSection,
  streetscapeContainsPoint
} from '../app/js/streetscape/model.js';

function road(overrides = {}) {
  const tags = { highway: 'residential', ...overrides.tags };
  return {
    sourceFeatureId: overrides.id || 'osm:way:road-1',
    pts: overrides.pts || [{ x: -40, z: 0 }, { x: 40, z: 0 }],
    width: overrides.width || 8,
    type: tags.highway,
    walkable: overrides.walkable ?? true,
    networkKind: 'road',
    transportRecord: { rawTags: tags },
    structureSemantics: { terrainMode: 'at_grade', structureKind: 'none', ...(overrides.structureSemantics || {}) }
  };
}

function buildings(count = 4, side = 1) {
  return Array.from({ length: count }, (_, index) => {
    const x = -30 + index * 18;
    const z = side * (16 + (index % 2));
    return { minX: x - 4, maxX: x + 4, minZ: z - 4, maxZ: z + 4, buildingType: 'house' };
  });
}

const sampleTerrainY = (x) => x * 0.002;
const sampleRoadY = (_road, x) => x * 0.002 + 0.18;

test('street sections respect mapped sidewalk tags and exclude unsafe road classes', () => {
  assert.deepEqual(resolveRoadStreetSection(road({ tags: { sidewalk: 'left' } }), { buildingCount: 0 }).sides, [1]);
  assert.equal(resolveRoadStreetSection(road({ tags: { sidewalk: 'no' } }), { buildingCount: 20 }).eligible, false);
  assert.equal(resolveRoadStreetSection(road({ tags: { highway: 'motorway', sidewalk: 'both' } }), { buildingCount: 20 }).eligible, false);
  assert.equal(resolveRoadStreetSection(road({ tags: { highway: 'service', service: 'driveway' } }), { buildingCount: 20 }).eligible, false);
});

test('context changes the verge and sidewalk dimensions without changing road width', () => {
  const source = road();
  const suburban = resolveRoadStreetSection(source, { buildingCount: 2, developedKind: 'residential' });
  const downtown = resolveRoadStreetSection(source, { buildingCount: 10, developedKind: 'commercial' });
  assert.equal(suburban.context, 'suburban');
  assert.ok(suburban.vergeWidth > 0);
  assert.equal(downtown.context, 'downtown');
  assert.equal(downtown.vergeWidth, 0);
  assert.ok(downtown.sidewalkWidth > suburban.sidewalkWidth);
  assert.equal(source.width, 8);
});

test('the deterministic model creates bounded raised sidewalks and never mutates roads', () => {
  const sourceRoad = road();
  const before = structuredClone(sourceRoad);
  const options = { roads: [sourceRoad], buildings: buildings(5), tier: 'balanced', sampleTerrainY, sampleRoadY };
  const first = buildStreetscapeModel(options);
  const second = buildStreetscapeModel(options);
  assert.equal(first.generatorVersion, STREETSCAPE_GENERATOR_VERSION);
  assert.ok(first.diagnostics.sidewalkSections > 0);
  assert.ok(first.diagnostics.curbSections > 0);
  assert.ok(first.diagnostics.maxSidewalkWidth <= 2.8);
  assert.ok(first.diagnostics.maxCurbHeight <= 0.14);
  assert.deepEqual(first, second);
  assert.deepEqual(sourceRoad, before);
  const point = first.surfaces[0].corners.reduce((value, corner) => ({ x: value.x + corner.x / 4, z: value.z + corner.z / 4 }), { x: 0, z: 0 });
  assert.equal(streetscapeContainsPoint(first, point.x, point.z), true);
});

test('rural roads and bridge, tunnel, and ramp structures remain free of inferred sidewalks', () => {
  const rural = buildStreetscapeModel({ roads: [road()], buildings: [], sampleTerrainY, sampleRoadY });
  const bridge = buildStreetscapeModel({ roads: [road({ structureSemantics: { terrainMode: 'elevated', structureKind: 'bridge' } })], buildings: buildings(10), sampleTerrainY, sampleRoadY });
  const tunnel = buildStreetscapeModel({ roads: [road({ structureSemantics: { terrainMode: 'tunnel', structureKind: 'tunnel' } })], buildings: buildings(10), sampleTerrainY, sampleRoadY });
  const ramp = buildStreetscapeModel({ roads: [road({ structureSemantics: { rampCandidate: true } })], buildings: buildings(10), sampleTerrainY, sampleRoadY });
  assert.equal(rural.diagnostics.sidewalkSections, 0);
  assert.equal(bridge.diagnostics.sidewalkSections, 0);
  assert.equal(tunnel.diagnostics.sidewalkSections, 0);
  assert.equal(ramp.diagnostics.sidewalkSections, 0);
});

test('intersection envelopes stop sidewalk bands before road junctions', () => {
  const model = buildStreetscapeModel({
    roads: [road({ tags: { sidewalk: 'both' } })], buildings: [], sampleTerrainY, sampleRoadY,
    intersections: [{ x: 0, z: 0, maxWidth: 10, hasGradeSeparatedRoad: false }]
  });
  assert.ok(model.diagnostics.skippedIntersections > 0);
  for (const surface of model.surfaces.filter((entry) => entry.kind === 'sidewalk')) {
    const x = (surface.centerStart.x + surface.centerEnd.x) * 0.5;
    const z = (surface.centerStart.z + surface.centerEnd.z) * 0.5;
    assert.ok(Math.hypot(x, z) > 5);
  }
});

test('mapped driveways cut the curb while parking and buildings mask paved bands', () => {
  const main = road({ tags: { sidewalk: 'both' } });
  const driveway = road({
    id: 'osm:way:driveway', width: 3,
    pts: [{ x: 0, z: -12 }, { x: 0, z: 18 }],
    tags: { highway: 'service', service: 'driveway' }
  });
  const curbCutModel = buildStreetscapeModel({
    roads: [main, driveway], buildings: [], sampleTerrainY, sampleRoadY
  });
  const maskedModel = buildStreetscapeModel({
    roads: [main, driveway], buildings: [{ minX: 18, maxX: 30, minZ: 3, maxZ: 9, buildingType: 'shop' }],
    landuses: [{ type: 'parking', pts: [{ x: -30, z: -9 }, { x: -12, z: -9 }, { x: -12, z: -3 }, { x: -30, z: -3 }] }],
    vegetation: [{ x: 12, z: 5.5 }],
    sampleTerrainY, sampleRoadY
  });
  assert.ok(curbCutModel.diagnostics.curbCuts > 0);
  assert.ok(maskedModel.diagnostics.skippedBuildings > 0);
  assert.ok(maskedModel.diagnostics.skippedParking > 0);
  assert.ok(maskedModel.diagnostics.skippedVegetation > 0);
  assert.equal(curbCutModel.surfaces.filter((surface) => surface.curbCut).every((surface) => surface.curbFace === null), true);
});

test('nearby entrances receive short paved frontage connectors without becoming navigation authority', () => {
  const model = buildStreetscapeModel({
    roads: [road({ tags: { sidewalk: 'both' } })], buildings: [], sampleTerrainY, sampleRoadY,
    entrances: [{ approachX: 12, approachZ: 12, provenance: 'mapped', commercial: true }]
  });
  assert.equal(model.diagnostics.frontageConnectors, 1);
  const connector = model.surfaces.find((surface) => surface.kind === 'frontage');
  assert.equal(connector.provenance, 'mapped_entrance_connector');
  assert.ok(connector.length <= 18);
});
