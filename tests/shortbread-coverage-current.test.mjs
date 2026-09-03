import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchShortbreadWorldData,
  shortbreadPartCoverageStatus
} from '../app/js/world/shortbread-source.js';
import { normalizeTransportSource } from '../app/js/world/compiler/transport-source-normalizer.js';
import {
  retainRegionalTransportOutsideCore,
  selectDetailedCoreTransport
} from '../app/js/world/fixed-regional-context.js';
import {
  compileTransportSurfaceModel
} from '../app/js/world/compiler/transport-surface-model.js';
import { boundedAtGradeTerrainTarget } from '../app/js/terrain/height-sampling.js';

function tileBounds(z, x, y) {
  const scale = 2 ** z;
  const longitude = (tileX) => tileX / scale * 360 - 180;
  const latitude = (tileY) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / scale))) * 180 / Math.PI;
  return {
    west: longitude(x),
    east: longitude(x + 1),
    north: latitude(y),
    south: latitude(y + 1)
  };
}

test('a remote failed tile does not invalidate successfully loaded roads', () => {
  const z = 14;
  const x = 14544;
  const y = 6452;
  const bounds = tileBounds(z, x, y);
  const status = shortbreadPartCoverageStatus({
    coords: [
      [(bounds.west + bounds.east) * 0.5, (bounds.north + bounds.south) * 0.5],
      [(bounds.west + bounds.east) * 0.6, (bounds.north + bounds.south) * 0.55]
    ]
  }, { z, x, y }, new Set([`${z}/${x + 4}/${y + 4}`]));
  assert.equal(status.complete, true);
  assert.equal(status.truncated, false);
});

test('only a road endpoint touching a failed adjacent tile is incomplete', () => {
  const z = 14;
  const x = 14544;
  const y = 6452;
  const bounds = tileBounds(z, x, y);
  const failedEast = `${z}/${x + 1}/${y}`;
  const status = shortbreadPartCoverageStatus({
    coords: [
      [(bounds.west + bounds.east) * 0.5, (bounds.north + bounds.south) * 0.5],
      [bounds.east, (bounds.north + bounds.south) * 0.5]
    ]
  }, { z, x, y }, new Set([failedEast]));
  assert.equal(status.complete, false);
  assert.equal(status.truncated, true);
  assert.deepEqual(status.missingNeighbors, [failedEast]);
});

test('a transient Shortbread tile failure is retried within the same provider authority', async () => {
  const bounds = tileBounds(14, 14544, 6452);
  let attempts = 0;
  const data = await fetchShortbreadWorldData({
    lat: (bounds.north + bounds.south) * 0.5,
    lon: (bounds.west + bounds.east) * 0.5,
    zoom: 14,
    bounds: {
      minLat: bounds.south + (bounds.north - bounds.south) * 0.2,
      maxLat: bounds.south + (bounds.north - bounds.south) * 0.8,
      minLon: bounds.west + (bounds.east - bounds.west) * 0.2,
      maxLon: bounds.west + (bounds.east - bounds.west) * 0.8
    },
    includeBuildings: false,
    layerNames: ['streets'],
    shortbreadFetchTile: async (z, x, y) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient provider failure');
      return { tile: { layers: {} }, z, x, y };
    }
  });
  assert.equal(attempts, 2);
  assert.equal(data._shortbreadTiles.failed, 0);
  assert.equal(data._shortbreadTiles.retryAttempts, 1);
  assert.equal(data._shortbreadTiles.recoveredTiles, 1);
});

test('an incomplete route fragment keeps its loaded physical drive surface', () => {
  const record = normalizeTransportSource({
    sourceId: 'shortbread:streets:14:14544:6452:1:0',
    id: '1',
    type: 'way',
    providerNamespace: 'shortbread',
    completeness: 'generalized',
    geometryProvenance: 'shortbread-v1'
  }, {
    highway: 'residential',
    _sourceCompleteness: 'generalized',
    _sourceTruncated: 'yes'
  });
  assert.equal(record.routeState, 'incomplete');
  assert.equal(record.safeForDriving, true);
});

test('prohibited motor access still removes the drive surface', () => {
  const record = normalizeTransportSource({
    sourceId: 'shortbread:streets:14:14544:6452:2:0',
    id: '2',
    type: 'way',
    providerNamespace: 'shortbread',
    completeness: 'generalized',
    geometryProvenance: 'shortbread-v1'
  }, {
    highway: 'service',
    motor_vehicle: 'no',
    _sourceCompleteness: 'generalized'
  });
  assert.equal(record.routeState, 'complete');
  assert.equal(record.safeForDriving, false);
});

test('the detailed core fallback contains only z14 street geometry and its nodes', () => {
  const source = {
    elements: [
      { type: 'node', id: 1 },
      { type: 'node', id: 2 },
      { type: 'node', id: 3 },
      {
        type: 'way', id: 10, nodes: [1, 2],
        tags: { highway: 'primary', _sourceFeatureId: 'shortbread:streets:14:1:2:10:0' }
      },
      {
        type: 'way', id: 11, nodes: [2, 3],
        tags: { aeroway: 'taxiway', _sourceFeatureId: 'shortbread:street_polygons:14:1:2:11:0' }
      }
    ]
  };
  const selected = selectDetailedCoreTransport(source);
  assert.equal(selected._overpassSource, 'shortbread-vector-z14-core');
  assert.deepEqual(selected.elements.map((element) => element.id), [1, 2, 10]);
});

test('a detailed core removes overlapping coarse ways without dropping the outer regional road', () => {
  const data = {
    elements: [
      { type: 'node', id: 1, lat: 0, lon: 0.001 },
      { type: 'node', id: 2, lat: 0, lon: 0.01 },
      { type: 'node', id: 3, lat: 0, lon: 0.009 },
      { type: 'node', id: 4, lat: 0, lon: 0.012 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'primary' } },
      { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'secondary' } }
    ]
  };
  const retained = retainRegionalTransportOutsideCore(data, {
    location: { lat: 0, lon: 0 },
    coreRadiusMeters: 1000,
    overlapRadiusMeters: 900,
    radiusMeters: 14000,
    excludeCoreCrossingWays: true,
    retainCoreStructureFallbacks: false
  });
  assert.deepEqual(retained.elements.filter((element) => element.type === 'way').map((way) => way.id), [11]);
  assert.equal(retained._regionalContext.retainedRoads, 1);
});

test('ordinary street terrain publication cannot manufacture multi-metre cuts or fills', () => {
  const feature = {
    id: 'ordinary-street',
    sourceFeatureId: 'ordinary-street',
    width: 10,
    pts: [{ x: 0, z: 0 }, { x: 60, z: 0 }],
    structureSemantics: { terrainMode: 'at_grade', verticalGroup: 'at_grade:0' }
  };
  const model = compileTransportSurfaceModel(
    feature,
    (x, z) => 2.5 * Math.sin(x / 4) + 1.5 * Math.cos(z / 3)
  );
  assert.equal(model.cutFillPolicy.maximumCutMeters, 0.65);
  assert.equal(model.cutFillPolicy.maximumFillMeters, 0.65);
  assert.equal(boundedAtGradeTerrainTarget({ transportSurfaceModel: model }, 10, 15), 10.65);
  assert.equal(boundedAtGradeTerrainTarget({ transportSurfaceModel: model }, 10, 4), 9.35);
});

test('ordinary road endpoints stay inside their ground envelope on a real steep slope', () => {
  const feature = {
    id: 'steep-hillside-street',
    sourceFeatureId: 'steep-hillside-street',
    width: 8,
    pts: [{ x: 0, z: 0 }, { x: 120, z: 0 }],
    structureSemantics: { terrainMode: 'at_grade', verticalGroup: 'at_grade:0' }
  };
  const model = compileTransportSurfaceModel(feature, (x) => x * 0.7);
  for (let index = 0; index < model.centerHeights.length; index += 1) {
    const offset = model.centerHeights[index] - (model.groundHeights[index] + model.surfaceBias);
    assert.ok(offset >= -0.651 && offset <= 0.651, `sample ${index} escaped by ${offset}`);
  }
});
