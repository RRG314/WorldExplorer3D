import assert from 'node:assert/strict';
import {
  selectBuildingFeatures,
  selectTransportationFeatures
} from '../app/js/world/streaming-feature-budget.js';

function layer(features) {
  return {
    length: features.length,
    feature(index) {
      return features[index] || null;
    }
  };
}

function feature(id, properties, geometry) {
  const geojson = { type: 'Feature', id, properties, geometry };
  return { id, toGeoJSON: () => geojson };
}

function lineFeature(id, kind, x = 0) {
  return feature(id, { kind }, {
    type: 'LineString',
    coordinates: [[x, 0], [x + 0.001, 0.001]]
  });
}

function buildingFeature(id, x, y, height = 9) {
  const size = 0.00008;
  return feature(id, { kind: 'building', height }, {
    type: 'Polygon',
    coordinates: [[
      [x - size, y - size], [x + size, y - size],
      [x + size, y + size], [x - size, y + size], [x - size, y - size]
    ]]
  });
}

function selectedIds(selection) {
  const ids = [];
  for (let index = 0; index < selection.layer.length; index += 1) {
    ids.push(String(selection.layer.feature(index)?.id));
  }
  return ids;
}

const transportation = [];
for (let index = 0; index < 180; index += 1) transportation.push(lineFeature(`service-${index}`, 'service', index));
for (let index = 0; index < 80; index += 1) transportation.push(lineFeature(`foot-${index}`, 'footway', index));
for (let index = 0; index < 40; index += 1) transportation.push(lineFeature(`cycle-${index}`, 'cycleway', index));
transportation.push(lineFeature('late-primary', 'primary', 999));

const transportationSelection = selectTransportationFeatures(layer(transportation), 100);
const transportationIds = selectedIds(transportationSelection);
assert.equal(transportationSelection.selected, 100);
assert.ok(transportationIds.includes('late-primary'), 'Late high-priority road was discarded.');
assert.ok(transportationIds.some((id) => id.startsWith('foot-')), 'Pedestrian quota was discarded.');
assert.ok(transportationIds.some((id) => id.startsWith('cycle-')), 'Cycle quota was discarded.');
assert.deepEqual(
  transportationIds,
  selectedIds(selectTransportationFeatures(layer(transportation), 100)),
  'Transportation selection is not deterministic.'
);

const buildings = [];
for (let y = 0; y < 10; y += 1) {
  for (let x = 0; x < 10; x += 1) {
    buildings.push(buildingFeature(`building-${x}-${y}`, x * 0.01, y * 0.01, 6 + x + y));
  }
}
const buildingSelection = selectBuildingFeatures(layer(buildings), 32);
const selectedBuildings = selectedIds(buildingSelection);
assert.equal(buildingSelection.selected, 32);
assert.ok(Number(buildingSelection.populatedCells) >= 32, 'Building grid did not represent broad tile coverage.');
assert.ok(new Set(selectedBuildings.map((id) => id.split('-')[1])).size >= 6, 'Selected buildings do not span the tile width.');
assert.ok(new Set(selectedBuildings.map((id) => id.split('-')[2])).size >= 6, 'Selected buildings do not span the tile height.');

console.log(JSON.stringify({
  ok: true,
  transportation: transportationSelection,
  buildings: {
    requested: buildingSelection.requested,
    selected: buildingSelection.selected,
    populatedCells: buildingSelection.populatedCells
  }
}, (key, value) => key === 'layer' ? undefined : value, 2));
