#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  queryNearbyRoads,
  roadSpatialIndexSnapshot
} from '../app/js/world/road-spatial-index.js';

function road(id, x, z = 0) {
  return { id, pts: [{ x, z }, { x: x + 40, z }] };
}

const base = [road('base-a', 0), road('base-b', 260)];
const overlay = [];

assert.ok(queryNearbyRoads(base, overlay, 10, 0).some(({ id }) => id === 'base-a'));
const initial = roadSpatialIndexSnapshot();
assert.equal(initial.rebuilds, 1, 'first query should build the index once');
assert.equal(initial.incrementalAdds, 0);

base.push(road('base-c', 520));
assert.ok(queryNearbyRoads(base, overlay, 530, 0).some(({ id }) => id === 'base-c'));
const appended = roadSpatialIndexSnapshot();
assert.equal(appended.rebuilds, initial.rebuilds, 'append-only streaming must not rebuild existing roads');
assert.equal(appended.incrementalAdds, 1, 'only the appended road should be indexed');

overlay.push(road('overlay-a', 780));
assert.ok(queryNearbyRoads(base, overlay, 790, 0).some(({ id }) => id === 'overlay-a'));
const overlayAppended = roadSpatialIndexSnapshot();
assert.equal(overlayAppended.rebuilds, initial.rebuilds, 'overlay appends must also preserve the index');
assert.equal(overlayAppended.incrementalAdds, 2);

base.splice(1, 1);
queryNearbyRoads(base, overlay, 10, 0);
const removed = roadSpatialIndexSnapshot();
assert.equal(removed.rebuilds, initial.rebuilds + 1, 'streaming removal must rebuild stale buckets');
assert.equal(removed.roads, base.length + overlay.length);

console.log('Road spatial index append/removal checks passed.');
