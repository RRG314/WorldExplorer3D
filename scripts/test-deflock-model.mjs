import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { geoToWorld } from '../app/js/config.js';
import { computeCameraPlacement } from '../app/js/deflock/placement.js';
import {
  buildSurveillanceQuery,
  normalizeDirection,
  parseSurveillanceElements
} from '../app/js/deflock/source.js';
import {
  applySharedDisabled,
  createDeFlockState,
  markDiscovered,
  markVirtuallyDisabled,
  progressSnapshot,
  readLocalProgress,
  serializeProgress,
  writeLocalProgress
} from '../app/js/deflock/state.js';

const fixturePath = fileURLToPath(new URL('./fixtures/deflock-surveillance.json', import.meta.url));
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const features = parseSurveillanceElements(fixture);

assert.equal(features.length, 2, 'only mapped surveillance cameras are accepted');
assert.equal(features[0].sourceId, 'osm:node:101');
assert.equal(features[0].cameraType, 'ALPR');
assert.equal(features[0].direction, 45);
assert.equal(features[0].operator, 'Fixture Operator');
assert.equal(features[0].provenance.license, 'ODbL-1.0');
assert.equal(features[1].direction, 270);
assert.equal(normalizeDirection('SSW'), 202.5);
assert.equal(normalizeDirection('-90'), 270);
assert.equal(normalizeDirection('unknown'), null);

const query = buildSurveillanceQuery({ lat: 39.2904, lon: -76.6122 }, 0.01);
assert.match(query, /man_made/);
assert.match(query, /39\.2804000,-76\.6222000,39\.3004000,-76\.6022000/);

const world = geoToWorld(features[0].lat, features[0].lon);
const placement = computeCameraPlacement(features[0], {
  geoToWorld,
  terrainAt: (x, z) => ({ position: { y: x * 0.01 + z * 0.005 + 12 } })
});
assert.ok(Math.abs(placement.x - world.x) < 1e-9, 'uses the canonical Earth projection');
assert.ok(Math.abs(placement.z - world.z) < 1e-9, 'uses the canonical Earth projection');
assert.equal(placement.bearingDegrees, 45, 'preserves known facing');
assert.equal(placement.groundY, world.x * 0.01 + world.z * 0.005 + 12, 'uses terrain authority height');

const location = { lat: 39.2904, lon: -76.6122, name: 'Baltimore' };
const state = createDeFlockState(features, { location, sourceVersion: 'fixture-v1', startedAt: 1000 });
assert.equal(markDiscovered(state, features[0].sourceId), true);
assert.equal(markDiscovered(state, features[0].sourceId), false, 'discovery is idempotent');
assert.equal(markVirtuallyDisabled(state, features[0].sourceId, { uid: 'player-a' }), true);
assert.equal(markVirtuallyDisabled(state, features[0].sourceId, { uid: 'player-b' }), false, 'duplicate disable receives no credit');
assert.equal(applySharedDisabled(state, [{ sourceId: features[1].sourceId, uid: 'player-b' }]), true);
assert.equal(state.status, 'complete');
assert.equal(progressSnapshot(state).completionPercent, 100);

const serialized = serializeProgress(state);
assert.deepEqual(serialized.disabled.sort(), features.map((feature) => feature.sourceId).sort());
assert.equal(Object.hasOwn(serialized, 'features'), false, 'local progress never duplicates source data');

const memory = new Map();
const storage = {
  getItem(key) { return memory.get(key) ?? null; },
  setItem(key, value) { memory.set(key, value); }
};
assert.equal(writeLocalProgress(state, storage), true);
const restored = readLocalProgress(location, 'fixture-v1', storage);
assert.equal(restored.disabled.length, 2, 'local progress reloads by location and source version');

const empty = createDeFlockState([], { location, sourceVersion: 'fixture-v1' });
assert.equal(empty.status, 'empty', 'no-data locations remain playable without fake cameras');

console.log(JSON.stringify({ ok: true, features: features.length, placement, progress: progressSnapshot(state) }, null, 2));
