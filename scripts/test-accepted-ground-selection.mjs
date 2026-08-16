import assert from 'node:assert/strict';
import {
  filterSelectionToAcceptedGround
} from '../app/js/world/compiler/accepted-ground-selection.js';

const nodes = {
  1: { id: 1, lat: 39.29, lon: -76.61 },
  2: { id: 2, lat: 39.291, lon: -76.609 },
  3: { id: 3, lat: 39.4, lon: -76.4 }
};
const inside = (latitude, longitude) => ({
  status: latitude < 39.35 && longitude < -76.5
    ? 'available'
    : 'unavailable'
});
const selection = {
  roadWays: [
    { id: 10, nodes: [1, 2] },
    { id: 11, nodes: [2, 3] }
  ],
  buildingWays: [{ id: 20, nodes: [1, 2] }],
  landuseWays: [{ id: 30, nodes: [1, 3] }],
  treeNodes: [nodes[1], nodes[3]],
  poiNodes: [nodes[2], nodes[3]],
  requestedCounts: { roads: 2, buildings: 1, landuse: 1, pois: 2 }
};

const result = filterSelectionToAcceptedGround(selection, nodes, inside);
assert.deepEqual(result.selection.roadWays.map(({ id }) => id), [10]);
assert.deepEqual(result.selection.buildingWays.map(({ id }) => id), [20]);
assert.deepEqual(result.selection.landuseWays, []);
assert.deepEqual(result.selection.treeNodes.map(({ id }) => id), [1]);
assert.deepEqual(result.selection.poiNodes.map(({ id }) => id), [2]);
assert.equal(result.selection.requestedCounts, selection.requestedCounts);
assert.equal(result.diagnostics.acceptedNodeCount, 2);
assert.equal(result.diagnostics.rejectedNodeCount, 1);
assert.equal(result.diagnostics.rejectedWayCount, 2);
assert.equal(result.diagnostics.rejectedPointFeatureCount, 2);
assert.throws(
  () => filterSelectionToAcceptedGround(selection, nodes),
  /sampleGroundAtLatLon must be a function/
);

console.log(JSON.stringify({
  ok: true,
  contract: 'accepted-ground-selection',
  retainedRoads: result.selection.roadWays.length,
  rejectedWays: result.diagnostics.rejectedWayCount
}, null, 2));
