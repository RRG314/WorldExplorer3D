import assert from 'node:assert/strict';
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';
import {
  createWorldPublicationSnapshot,
  publishWorldPublicationSnapshot
} from '../app/js/world/world-snapshot-adapter.js';
import {
  compileWorldLayerProducts,
  worldLayerProductCounts
} from '../app/js/world/compiler/world-layer-products.js';

const request = createWorldLoadRequest({
  key: 'monaco',
  name: 'Monaco',
  lat: 43.7384,
  lon: 7.4246
}, 4);
const counts = {
  roads: 120,
  roadMeshes: 2,
  buildingMeshes: 80,
  buildings: 80,
  waterAreas: 3,
  landuses: 6,
  pois: 9
};
const layerProducts = compileWorldLayerProducts({
  request,
  counts,
  runtimeState: { groundMode: 'worldwide-terrain-fallback', districtSource: 'osm-overpass' },
  loadMetrics: { overpassSource: 'osm-overpass' },
  detailRadiusWorld: 1400,
  terrainCount: 25,
  artifacts: {
    transportSurfacePublication: {
      authority: 'compiled_transport_surface',
      roadCount: 120,
      meshCount: 2,
      vertices: 800,
      triangles: 400
    },
    buildingProvenanceModel: {
      authority: 'compiled_building_provenance',
      featureCount: 80,
      validCount: 80
    },
    waterSurfaceRegistrySnapshot: {
      schemaVersion: 1,
      surfaceCount: 3,
      navigableCount: 2
    }
  }
});
const snapshot = createWorldPublicationSnapshot({
  request,
  layerProducts,
  createdAt: 321
});
const productCounts = worldLayerProductCounts(layerProducts);

assert.equal(snapshot.type, 'WorldSnapshot');
assert.equal(snapshot.sequence, request.sequence);
assert.equal(snapshot.publishedAt, 321);
assert.deepEqual(snapshot.counts, productCounts);
assert.equal(snapshot.layers.terrain.records[0].collectionEntryCount, 25);
assert.equal(snapshot.layers.transport.records[0].collectionEntryCount, 122);
assert.equal(snapshot.layers.buildings.records[0].collectionEntryCount, 160);
assert.equal(snapshot.layers.hydrology.records[0].collectionEntryCount, 3);
assert.equal(snapshot.layers.places.records[0].collectionEntryCount, 9);
assert.equal(snapshot.layers.transport.source.canonical, true);
assert.equal(snapshot.layers.transport.source.compiler, 'transport-surface-compiler');
assert.equal(snapshot.layers.transport.records[0].compilation.vertices, 800);
assert.equal(productCounts.roads, counts.roads);
assert.equal(productCounts.buildingMeshes, counts.buildingMeshes);
assert.equal(productCounts.waterAreas, counts.waterAreas);
assert.equal(Object.keys(productCounts).length, 22);
assert.equal(Object.isFrozen(layerProducts.transport.record.compilation), true);

const appCtx = {};
const published = publishWorldPublicationSnapshot(appCtx, {
  request,
  layerProducts,
  createdAt: 321
});
assert.equal(appCtx.worldPublication, published);
assert.equal(appCtx.worldSnapshotStore.snapshot().revision, 1);
assert.equal(appCtx.worldSnapshotStore.snapshot().current.requestId, request.id);

counts.roads = 9999;
assert.equal(published.counts.roads, 120, 'published compiler products changed with a mutable source count');
assert.throws(
  () => createWorldPublicationSnapshot({ request, counts: {}, createdAt: 1 }),
  /immutable compiler layer products/
);

console.log(JSON.stringify({
  ok: true,
  contract: 'live-world-publication-snapshot-adapter',
  requestId: published.requestId,
  revision: appCtx.worldSnapshotStore.snapshot().revision
}, null, 2));
