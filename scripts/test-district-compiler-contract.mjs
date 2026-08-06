import assert from 'node:assert/strict';
import {
  createDistrictSource,
  districtSourceLegacySelection
} from '../app/js/world/compiler/district-source.js';
import {
  compileDistrictGroundModel,
  sampleDistrictGroundMeters
} from '../app/js/world/compiler/district-ground-model.js';
import {
  adaptSelectedLocationSource,
  diagnoseDistrictGroundSource,
  prepareSelectedLocationSource
} from '../app/js/world/compiler/selected-location-source-adapter.js';

const nodes = {
  2: { type: 'node', id: 2, lat: 39.0002, lon: -76.9998 },
  1: { type: 'node', id: 1, lat: 39, lon: -77 },
  3: { type: 'node', id: 3, lat: 39.0004, lon: -76.9996, tags: { natural: 'tree' } }
};
const road = {
  type: 'way',
  id: 20,
  nodes: [1, 2],
  tags: { name: 'Stable Street', highway: 'residential' }
};
const building = {
  type: 'way',
  id: 10,
  nodes: [1, 2, 3, 1],
  tags: { building: 'yes' }
};

function makeSource(reverse = false) {
  const orderedNodes = reverse
    ? Object.fromEntries(Object.entries(nodes).reverse())
    : nodes;
  return createDistrictSource({
    districtId: 'fixture',
    origin: { latitude: 39, longitude: -77 },
    provider: {
      name: 'OpenStreetMap',
      namespace: 'osm',
      retrieval: 'fixture',
      license: 'ODbL'
    },
    nodes: orderedNodes,
    featureCollections: {
      roads: reverse ? [road].reverse() : [road],
      buildings: [building],
      trees: [nodes[3]]
    },
    completeness: {
      status: 'budgeted',
      selected: { roads: 1, buildings: 1, trees: 1 },
      requested: { roads: 1, buildings: 1, trees: 1 }
    }
  });
}

const source = makeSource();
const reorderedSource = makeSource(true);
assert.equal(source.type, 'DistrictSource');
assert.deepEqual(source, reorderedSource, 'source normalization must be order invariant');
assert(Object.isFrozen(source));
assert(Object.isFrozen(source.features.roads));
assert(Object.isFrozen(source.features.roads[0].tags));
assert.equal(source.reconciliation.nodeCount, 3);
assert.equal(source.reconciliation.wayCount, 2);
assert.equal(source.features.roads[0].sourceId, 'osm:way:20');
assert.equal(source.features.buildings[0].nodes[3], '1');
assert.equal(
  districtSourceLegacySelection(source).roadWays[0],
  source.features.roads[0]
);
assert.throws(() => {
  source.features.roads[0].tags.highway = 'motorway';
}, TypeError);

const adapted = adaptSelectedLocationSource({
  location: { lat: 39, lon: -77 },
  data: { _overpassSource: 'fixture', _overpassEndpoint: 'fixture://osm' },
  nodes,
  selection: {
    roadWays: [road],
    buildingWays: [building],
    landuseWays: [],
    waterwayWays: [],
    railwayWays: [],
    footwayWays: [],
    cyclewayWays: [],
    structureConnectorWays: [],
    treeNodes: [nodes[3]],
    treeRowWays: [],
    poiNodes: [],
    requestedCounts: { roads: 1, buildings: 1, landuse: 0, pois: 0 }
  }
});
assert.equal(adapted.selection.roadWays[0].sourceId, 'osm:way:20');
assert.equal(adapted.diagnostics.districtSource.wayCount, 2);
assert.equal(adapted.diagnostics.districtGroundModel.status, 'blocked');
const worldwideSelection = prepareSelectedLocationSource({
  allowWorldwideTerrainFallback: true,
  location: { lat: 39, lon: -77 },
  data: { _overpassSource: 'fixture' },
  nodes,
  prepareSelection: () => ({
    roadWays: [road],
    buildingWays: [building],
    landuseWays: [],
    waterwayWays: [],
    railwayWays: [],
    footwayWays: [],
    cyclewayWays: [],
    structureConnectorWays: [],
    treeNodes: [nodes[3]],
    treeRowWays: [],
    poiNodes: [],
    requestedCounts: { roads: 1, buildings: 1, landuse: 0, pois: 0 }
  }),
  terrainSourceSample: {
    status: 'available',
    elevationMeters: 22,
    confidence: 0.35,
    provenance: {
      runtimeClassification: 'legacy-ground-fallback-only',
      verticalDatum: 'mixed-source'
    }
  }
});
assert.equal(worldwideSelection.selection.roadWays.length, 1);
assert.equal(worldwideSelection.selection.buildingWays.length, 1);
assert.equal(worldwideSelection.diagnostics.acceptedGroundSelection.status, 'fallback');
assert.equal(worldwideSelection.diagnostics.districtGroundModel.status, 'fallback');
assert.equal(
  diagnoseDistrictGroundSource({
    status: 'pending',
    confidence: 0,
    provenance: {
      runtimeClassification: 'legacy-ground-fallback-only',
      verticalDatum: 'mixed'
    }
  }).reason,
  'terrain-source-pending'
);
assert.equal(
  diagnoseDistrictGroundSource({
    status: 'available',
    confidence: 0.35,
    provenance: {
      runtimeClassification: 'legacy-ground-fallback-only',
      verticalDatum: 'mixed-source'
    }
  }).reason,
  'terrain-source-not-accepted-ground'
);
assert.equal(
  diagnoseDistrictGroundSource({
    status: 'available',
    confidence: 0.98,
    provenance: {
      runtimeClassification: 'accepted-ground',
      verticalDatum: 'NAVD88'
    }
  }).reason,
  'full-district-grid-coverage-required'
);

const grid = {
  spacingMeters: 30,
  minColumn: 100,
  maxColumn: 101,
  minRow: 200,
  maxRow: 201
};
const samples = [
  [100, 200, 10, 9],
  [101, 200, 12, 11],
  [100, 201, 14, 13],
  [101, 201, 16, 15]
].map(([column, row, rawElevationMeters, groundElevationMeters]) => ({
  column,
  row,
  available: true,
  rawElevationMeters,
  groundElevationMeters,
  confidence: 0.9,
  correctionReason: rawElevationMeters === groundElevationMeters
    ? 'none'
    : 'approved-ground-classification',
  provenance: 'fixture-ground'
}));

const model = compileDistrictGroundModel({
  districtId: source.districtId,
  sourceClassification: 'accepted-ground',
  verticalDatum: 'fixture',
  grid,
  samples: [...samples].reverse()
});
assert.equal(model.status, 'accepted');
assert.equal(model.grid.sampleCount, 4);
assert.equal(model.samples[0].key, '100:200');
assert.equal(model.diagnostics.rawGroundProductsSeparated, true);
const center = sampleDistrictGroundMeters(model, 100.5 * 30, 200.5 * 30);
assert.equal(center.status, 'available');
assert.equal(center.rawElevationMeters, 13);
assert.equal(center.groundElevationMeters, 12);
assert.equal(
  sampleDistrictGroundMeters(model, 99 * 30, 200 * 30).status,
  'unavailable'
);

const neighboringModel = compileDistrictGroundModel({
  districtId: 'neighbor',
  sourceClassification: 'accepted-ground',
  verticalDatum: 'fixture',
  grid: { ...grid, minColumn: 101, maxColumn: 102 },
  samples: [
    samples[1],
    samples[3],
    {
      column: 102,
      row: 200,
      available: true,
      rawElevationMeters: 18,
      groundElevationMeters: 17,
      confidence: 0.9,
      provenance: 'fixture-ground'
    },
    {
      column: 102,
      row: 201,
      available: true,
      rawElevationMeters: 20,
      groundElevationMeters: 19,
      confidence: 0.9,
      provenance: 'fixture-ground'
    }
  ]
});
assert.equal(neighboringModel.status, 'accepted');
assert.deepEqual(
  model.samples.filter((sample) => sample.column === 101),
  neighboringModel.samples.filter((sample) => sample.column === 101),
  'neighboring districts must share identical global-grid edge samples'
);

const unavailable = compileDistrictGroundModel({
  districtId: 'missing',
  sourceClassification: 'accepted-ground',
  grid,
  samples: samples.slice(0, 3)
});
assert.equal(unavailable.status, 'rejected');
assert.equal(unavailable.reason, 'incomplete-coverage');
assert.deepEqual(unavailable.diagnostics.missingKeys, ['101:201']);

const unapprovedSurface = compileDistrictGroundModel({
  districtId: 'surface-model',
  sourceClassification: 'correctable-surface',
  grid,
  samples
});
assert.equal(unapprovedSurface.status, 'rejected');
assert.equal(unapprovedSurface.reason, 'ground-correction-not-approved');

console.log(JSON.stringify({
  ok: true,
  districtSource: {
    nodes: source.reconciliation.nodeCount,
    ways: source.reconciliation.wayCount,
    immutable: true,
    orderInvariant: true
  },
  districtGroundModel: {
    samples: model.grid.sampleCount,
    seamStable: true,
    separatesRawAndGround: true,
    rejectsIncompleteCoverage: true,
    rejectsUnapprovedSurfaceCorrection: true
  }
}, null, 2));
