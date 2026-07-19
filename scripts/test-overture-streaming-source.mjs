import assert from 'node:assert/strict';
import {
  buildAdaptedLayers,
  normalizeBuilding,
  normalizeLand,
  normalizeRoad,
  normalizeWater
} from '../app/js/world/overture-streaming-source.js';

function rawFeature(id, geometry, properties) {
  return {
    id,
    toGeoJSON: () => ({ type: 'Feature', id, geometry, properties })
  };
}

function rawLayer(features) {
  return {
    length: features.length,
    feature: (index) => features[index]
  };
}

function record(layers, z = 14, x = 4705, y = 6244) {
  return { tile: { layers }, z, x, y };
}

const line = { type: 'LineString', coordinates: [[-76.62, 39.28], [-76.61, 39.29]] };
const polygon = { type: 'Polygon', coordinates: [[
  [-76.62, 39.28], [-76.61, 39.28], [-76.61, 39.29], [-76.62, 39.28]
]] };

assert.deepEqual(
  normalizeRoad({ subtype: 'road', class: 'residential', '@name': 'Cal Ripken Way', road_surface: '{"value":"asphalt"}' }),
  {
    subtype: 'road',
    class: 'residential',
    '@name': 'Cal Ripken Way',
    road_surface: '{"value":"asphalt"}',
    kind: 'residential',
    name: 'Cal Ripken Way',
    rail: false,
    bridge: false,
    tunnel: false,
    layer: '',
    oneway: false,
    surface: 'asphalt',
    speed_limit: ''
  }
);
assert.equal(normalizeBuilding({ subtype: 'residential', num_floors: 5 }, 'building').levels, 5);
assert.equal(normalizeLand({ subtype: 'cropland' }).kind, 'farmland');
assert.equal(normalizeLand({ subtype: 'recreation' }).kind, 'recreation_ground');
assert.equal(normalizeLand({ subtype: 'managed' }).kind, 'grass');
assert.equal(normalizeLand({ subtype: 'built_up' }).kind, '');
assert.equal(normalizeWater({ subtype: 'river', width: 24 }).kind, 'river');

const layers = buildAdaptedLayers({
  transportation: record({
    segment: rawLayer([rawFeature('road-1', line, { subtype: 'road', class: 'primary', '@name': 'North Avenue' })])
  }),
  buildings: record({
    building: rawLayer([rawFeature('building-1', polygon, { id: 'parent-1', has_parts: true })]),
    building_part: rawLayer([rawFeature('part-1', polygon, { id: 'part-1', building_id: 'parent-1', height: 18 })])
  }),
  base: record({
    land_cover: rawLayer([rawFeature('land-1', polygon, { subtype: 'forest' })]),
    land_use: rawLayer([]),
    water: rawLayer([
      rawFeature('water-1', polygon, { subtype: 'lake' }),
      rawFeature('water-2', line, { subtype: 'river' })
    ])
  }, 13, 2352, 3122)
});

assert.equal(layers.streets.length, 1);
assert.equal(layers.streets.feature(0).toGeoJSON().properties.name, 'North Avenue');
assert.equal(layers.buildings.length, 1, 'parent massing is suppressed when mapped parts are present');
assert.equal(layers.buildings.feature(0).toGeoJSON().properties.height, 18);
assert.equal(layers.land.length, 1);
assert.equal(layers.water_polygons.length, 1);
assert.equal(layers.water_lines.length, 1);

console.log(JSON.stringify({
  ok: true,
  layers: Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, layer.length]))
}, null, 2));
