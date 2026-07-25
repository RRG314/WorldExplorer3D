import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  compileShortbreadTransportTile,
  compileTransportRecords
} from '../app/js/world/transport-compiler.js';
import { createTileAddress } from '../app/js/world/world-tile-contract.js';
import { adaptShortbreadTransportTile } from '../app/js/world/shortbread-tile-adapter.js';

function mockFeature(id, properties, geometry) {
  return {
    id,
    toGeoJSON() {
      return { type: 'Feature', properties, geometry };
    }
  };
}

const rawFeatures = [
  mockFeature(20, {
    kind: 'footway',
    bridge: true,
    width: '5 ft',
    name: 'Mapped footbridge',
    foot: 'designated'
  }, {
    type: 'LineString',
    coordinates: [[-76.6123, 39.2903], [-76.6122, 39.2904]]
  }),
  mockFeature(10, {
    kind: 'primary',
    lanes: '2',
    maxspeed: '35 mph',
    name: 'Canonical Avenue',
    surface: 'asphalt'
  }, {
    type: 'MultiLineString',
    coordinates: [
      [[-76.6124, 39.2902], [-76.6123, 39.2903]],
      [[-76.6123, 39.2903], [-76.6122, 39.2904]]
    ]
  }),
  mockFeature(30, { kind: 'not_a_transport_class' }, {
    type: 'LineString',
    coordinates: [[-76.6123, 39.2903], [-76.6122, 39.2904]]
  }),
  mockFeature(40, { kind: 'residential' }, {
    type: 'Polygon',
    coordinates: [[[-76.6123, 39.2903], [-76.6122, 39.2904], [-76.6121, 39.2903]]]
  })
];
const tileRecord = {
  z: 14,
  x: 4706,
  y: 6266,
  tile: {
    layers: {
      streets: {
        length: rawFeatures.length,
        feature(index) {
          return rawFeatures[index];
        }
      }
    }
  }
};
const origin = { lat: 39.2904, lon: -76.6122 };
const project = (lat, lon) => ({
  x: (lon - origin.lon) * 86100,
  z: (lat - origin.lat) * 111000
});

const initialTile = compileShortbreadTransportTile({
  tileRecord,
  project,
  origin,
  generation: 7,
  revision: 'fixture'
});
const streamingTile = compileShortbreadTransportTile({
  tileRecord,
  project,
  origin,
  generation: 7,
  revision: 'fixture'
});

assert.deepEqual(streamingTile, initialTile, 'Cold start and streaming must compile identical canonical tiles.');
assert.equal(initialTile.id, '14/4706/6266@7');
assert.equal(initialTile.source.authority, 'openstreetmap');
assert.equal(initialTile.source.adapter, 'shortbread-v1');
assert.equal(initialTile.summary.recordCount, 3);
assert.equal(initialTile.summary.counts.transport, 3);
assert.equal(initialTile.records.buildings.length, 0);
assert.equal(Object.isFrozen(initialTile), true);
assert.equal(Object.isFrozen(initialTile.records.transport), true);
assert.equal(Object.isFrozen(initialTile.records.transport[0].geometry.points), true);
assert.throws(() => {
  initialTile.records.transport.push({});
}, TypeError);

const primary = initialTile.records.transport.filter((record) => record.subtype === 'primary');
assert.equal(primary.length, 2, 'MultiLineString parts must retain distinct identities.');
assert.equal(primary[0].dimensions.widthMeters, 7);
assert.equal(primary[0].mobility.speedLimitKph, 56);
assert.equal(primary[0].access.driveable, true);
assert.equal(primary[0].surface, 'asphalt');
assert.equal(primary[0].geometry.units, 'metres');
assert.deepEqual(primary[0].geometry.points[0], { x: -17.22, z: -22.2 });
assert.notEqual(primary[0].id, primary[1].id);

const footbridge = initialTile.records.transport.find((record) => record.featureKind === 'footway');
assert.equal(footbridge.dimensions.widthMeters, 1.524);
assert.equal(footbridge.access.walkable, true);
assert.equal(footbridge.access.driveable, false);
assert.equal(footbridge.structure.structureKind, 'skywalk');
assert.equal(footbridge.structure.terrainMode, 'elevated');

const address = createTileAddress(tileRecord);
const adapted = adaptShortbreadTransportTile(tileRecord);
const directRecords = compileTransportRecords({ address, features: adapted, project });
assert.deepEqual(directRecords, initialTile.records.transport);
assert.deepEqual(
  [...directRecords].reverse().map((record) => record.id).sort(),
  directRecords.map((record) => record.id),
  'Canonical output order must be deterministic.'
);

for (const modulePath of [
  'app/js/world/world-tile-contract.js',
  'app/js/world/shortbread-tile-adapter.js',
  'app/js/world/transport-compiler.js'
]) {
  const source = fs.readFileSync(new URL(`../${modulePath}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /shared-context|globalThis|document\.|from ['"][^'"]+\?v=/);
}

console.log(JSON.stringify({
  ok: true,
  tileId: initialTile.id,
  transportRecords: initialTile.records.transport.length,
  coldStartStreamingParity: true,
  immutable: true,
  sourceAuthority: initialTile.source.authority
}, null, 2));
