import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBuildingProvenance } from '../app/js/world/building-provenance-model.js';
import { createTransportSourceNormalizer, normalizeTransportSource } from '../app/js/world/compiler/transport-source-normalizer.js';
import { compileBuildingProvenance as previousBuilding } from './fixtures/building-provenance-before-sharing.js';
import { normalizeTransportSource as previousRoad } from './fixtures/transport-source-before-sharing.js';

function frozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  Object.values(value).forEach(frozen);
}

export function roadInput(i) {
  const highway = ['residential', 'primary', 'secondary', 'service', 'footway', 'motorway'][i % 6];
  return [{ id: i, providerNamespace: i % 3 ? 'osm' : 'shortbread',
    completeness: i % 3 ? 'lossless' : 'generalized', geometryProvenance: i % 3 ? 'osm-overpass' : 'shortbread-v1' },
  { highway, _sourceFeatureId: `test:way:${i}`, name: `Road ${i}`, ...(i % 7 ? {} : { bridge: 'yes', layer: '1' }),
    ...(i % 11 ? {} : { 'parking:lane:both': 'parallel', sidewalk: 'both', lanes: '2' }) }];
}

export function buildingInput(i) {
  return [{ _sourceFeatureId: `test:building:${i}`, _geometrySource: 'overture', building: 'yes',
    ...(i % 7 ? {} : { name: `Building ${i}` }), ...(i % 13 ? {} : { 'building:levels': '4', 'roof:shape': 'flat' }) },
  { heightMeters: 8 + i % 80, levels: 3, baseOffsetMeters: 0, foundationBaseY: i % 100 }];
}

test('immutable world facts preserve independently captured building and road outputs', () => {
  const normalize = createTransportSourceNormalizer();
  for (let i = 0; i < 2400; i++) {
    const road = roadInput(i), building = buildingInput(i);
    if (i % 9 === 0) Object.assign(road[1], { width: ['-0', '12 ft', 'NaN', '', '120', '3;4'][i % 6],
      oneway: ['yes', '-1', 'no', 'reversible'][i % 4], maxheight: '14\'6"', access: ['private', 'no', 'yes'][i % 3] });
    if (i % 17 === 0) Object.assign(building[0], { _buildingMetadataSourceId: `osm:way:${i}`,
      _buildingMetadataMapping: i % 2 ? 'explicit_stable_id' : 'ambiguous', _buildingMetadataGeometryId: `test:building:${i}` });
    if (i % 19 === 0) Object.assign(building[1], { facadeColor: { nested: [i, null, -0] }, roofHeightMeters: NaN });
    const actualRoad = normalize(...road), actualBuilding = compileBuildingProvenance(...building);
    assert.deepEqual(actualRoad, previousRoad(...road));
    assert.equal(JSON.stringify(actualRoad), JSON.stringify(previousRoad(...road)));
    assert.deepEqual(actualBuilding, previousBuilding(...building));
    assert.equal(JSON.stringify(actualBuilding), JSON.stringify(previousBuilding(...building)));
    frozen(actualRoad); frozen(actualBuilding);
  }
});

test('shared facts retain source identity and cannot be mutated through another feature', () => {
  const normalize = createTransportSourceNormalizer();
  const a = normalize({id:1}, {highway:'residential', custom:'first'});
  const b = normalize({id:2}, {highway:'residential', custom:'second'});
  for (const key of ['rawTags', 'access', 'crossSection', 'capabilities', 'provenance']) assert.equal(a[key], b[key]);
  assert.notEqual(a.identity, b.identity); assert.notEqual(a.sourceTags, b.sourceTags);
  assert.equal(a.sourceTags.custom, 'first'); assert.equal(b.sourceTags.custom, 'second');
  assert.throws(() => { a.crossSection.parking.left.widthMeters = 99; }, TypeError);
  assert.throws(() => { a.rawTags.highway = 'motorway'; }, TypeError);
  const one = compileBuildingProvenance({_sourceFeatureId:'one'});
  const two = compileBuildingProvenance({_sourceFeatureId:'two'});
  assert.equal(one.fields.name, one.fields.roofColor);
  assert.notEqual(one.fields.name, two.fields.name);
  assert.equal(one.fields.name.sourceFeatureId, 'one'); assert.equal(two.fields.name.sourceFeatureId, 'two');
  assert.throws(() => { one.fields.name.value = 'changed'; }, TypeError);
  assert.equal(one.metadata, two.metadata); assert.equal(one.landmark, two.landmark);
});

test('transport sharing is bounded and isolated to each compilation pass', () => {
  const first = createTransportSourceNormalizer(), second = createTransportSourceNormalizer();
  const a = first({id:1,geometryProvenance:'first'}, {highway:'residential'});
  assert.notEqual(a.access, second({id:1}, {highway:'residential'}).access);
  for (let i = 0; i < 256; i++) first({id:i+2,geometryProvenance:`unique:${i}`}, {highway:`unique:${i}`});
  const evicted = first({id:1,geometryProvenance:'first'}, {highway:'residential'});
  assert.deepEqual(evicted, a); assert.notEqual(evicted.provenance, a.provenance);
  assert.notEqual(evicted.rawTags, a.rawTags);
  assert.notEqual(normalizeTransportSource({id:1}).rawTags, normalizeTransportSource({id:2}).rawTags);
  assert.throws(() => first({}, {}), /stable source identity/);
  assert.deepEqual(first({id:8}, {width:-0,lanes:Infinity}), previousRoad({id:8}, {width:-0,lanes:Infinity}));
});
