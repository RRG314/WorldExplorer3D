import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  OSM_STREAMING_RELEASE,
  buildOsmStreamingLayers,
  waterIsOcean
} from '../app/js/world/osm-streaming-source.js';

function rawFeature(id, geometry, properties = {}) {
  return {
    id,
    calls: [],
    toGeoJSON(x, y, z) {
      this.calls.push({ x, y, z });
      return { type: 'Feature', id, geometry, properties };
    }
  };
}

function rawLayer(features) {
  return {
    length: features.length,
    feature(index) {
      return features[index] || null;
    }
  };
}

const line = { type: 'LineString', coordinates: [[-118.25, 34.05], [-118.24, 34.06]] };
const polygon = { type: 'Polygon', coordinates: [[
  [-118.25, 34.05], [-118.24, 34.05], [-118.24, 34.06], [-118.25, 34.05]
]] };
const road = rawFeature(1, line, { kind: 'primary' });
const roadLabel = rawFeature(2, line, { kind: 'primary', name: 'Main Street' });
const building = rawFeature(3, polygon);
const park = rawFeature(4, polygon, { kind: 'park' });
const school = rawFeature(5, polygon, { kind: 'education' });
const lake = rawFeature(6, polygon, { kind: 'lake' });
const ocean = rawFeature(7, polygon, { kind: 'ocean' });
const river = rawFeature(8, line, { kind: 'river' });
const record = {
  z: 14,
  x: 2810,
  y: 6542,
  tile: {
    layers: {
      streets: rawLayer([road]),
      street_labels: rawLayer([roadLabel]),
      buildings: rawLayer([building]),
      land: rawLayer([park]),
      sites: rawLayer([school]),
      water_polygons: rawLayer([lake, ocean]),
      water_lines: rawLayer([river])
    }
  }
};

const layers = buildOsmStreamingLayers(record);
assert.equal(OSM_STREAMING_RELEASE, 'shortbread_v1');
assert.equal(layers.streets.length, 1);
assert.equal(layers.street_labels.length, 1);
assert.equal(layers.buildings.length, 1);
assert.equal(layers.land.length, 2);
assert.equal(layers.water_polygons.length, 1);
assert.equal(layers.ocean.length, 1);
assert.equal(layers.water_lines.length, 1);
assert.equal(layers.streets.feature(0).toGeoJSON().properties.kind, 'primary');
assert.equal(layers.buildings.feature(0).toGeoJSON().geometry.type, 'Polygon');
assert.equal(layers.land.feature(1).toGeoJSON().properties.kind, 'education');
assert.match(layers.buildings.feature(0).id, /^osm:buildings:14\/2810\/6542:/);
assert.deepEqual(road.calls.at(-1), { x: 2810, y: 6542, z: 14 });
assert.deepEqual(building.calls.at(-1), { x: 2810, y: 6542, z: 14 });
assert.equal(waterIsOcean({ properties: { kind: 'sea' } }), true);
assert.equal(waterIsOcean({ properties: { kind: 'reservoir' } }), false);

for (const layer of Object.values(layers)) {
  for (let index = 0; index < layer.length; index += 1) {
    const geojson = layer.feature(index).toGeoJSON();
    assert(!JSON.stringify(geojson.geometry).includes('null'), 'Normalized OSM geometry contains null coordinates.');
  }
}

for (const runtimePath of [
  new URL('../app/js/world/streaming-vector-chunks.js', import.meta.url),
  new URL('../app/js/world/streaming-aerial-context.js', import.meta.url)
]) {
  const source = await fs.readFile(runtimePath, 'utf8');
  assert(!/fetchOverture|overture-streaming-source/i.test(source), `${runtimePath.pathname} still imports Overture.`);
}

console.log(JSON.stringify({
  ok: true,
  source: 'osm-shortbread',
  layers: Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, layer.length]))
}, null, 2));
