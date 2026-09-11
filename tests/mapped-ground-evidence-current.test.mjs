import test from 'node:test';
import assert from 'node:assert/strict';
import { mappedGroundProfile, indexMappedGround } from '../app/js/terrain/mapped-ground-evidence.js';
import { mergeFixedRegionalTransport } from '../app/js/world/fixed-regional-context.js';
import { hardscapeMaterialOptions } from '../app/js/world/load-landuse-pass.js';

const ring = (a, b) => [{x:a,z:a},{x:b,z:a},{x:b,z:b},{x:a,z:b}];
const feature = (type, a, b, extra = {}) => ({type, pts:ring(a,b), bounds:{minX:a,maxX:b,minZ:a,maxZ:b}, ...extra});

test('property purpose does not invent a uniform physical surface', () => {
  for (const kind of ['residential','commercial','industrial','park','garden','farmyard','orchard','cemetery']) {
    assert.equal(mappedGroundProfile(kind), null, kind);
  }
  assert.equal(mappedGroundProfile('residential', {surface:'grass'}).mode, 'grass');
  assert.equal(mappedGroundProfile('parking', {surface:'gravel'}).mode, 'rock');
  assert.equal(mappedGroundProfile('forest', {leisure:'nature_reserve'}), null);
  assert.equal(mappedGroundProfile('grass', {natural:'wetland'}).mode, 'wetland');
});
test('mapped physical cover resolves independently of arrival order and broad use', () => {
  const features = [feature('residential',-200,200), feature('grass',-50,50),
    feature('forest',-20,20),feature('park',-10,10,{tags:{surface:'sand'}})];
  for (const list of [features,[...features].reverse()]) {
    const index = indexMappedGround(list);
    assert.equal(index.sample(0,0).mode,'sand');
    assert.equal(index.sample(15,15).mode,'forest');
    assert.equal(index.sample(40,40).mode,'grass');
    assert.equal(index.sample(80,80),null);
  }
});
test('holes and negative cell boundaries retain underlying evidence', () => {
  const index = indexMappedGround([feature('grass',-300,300),
    feature('forest',-200,200,{holeRings:[ring(-10,10)]})]);
  assert.equal(index.sample(0,0).mode,'grass');
  assert.equal(index.sample(-129,-129).mode,'forest');
  assert.equal(index.sample(350,350),null);
});
test('world cover classes and malformed inputs fail safely', () => {
  for (const [kind,mode] of [['glacier','snow'],['beach','sand'],['bare_rock','rock'],['farmland','soil'],['wood','forest']]) {
    assert.equal(mappedGroundProfile(kind).mode,mode);
  }
  assert.equal(indexMappedGround([feature('grass',-Infinity,Infinity)]).sample(0,0),null);
});

test('land conversion cannot replace a road node with the same converter-local ID', () => {
  const road = {type:'way',id:-2,nodes:[-1],tags:{highway:'residential'}};
  const data = {elements:[{type:'node',id:-1,lat:40,lon:1},road]};
  const ground = {elements:[{type:'node',id:-1,lat:41,lon:2},
    {type:'way',id:-2,nodes:[-1],surfaceHoles:[[[1,2],[2,3],[3,2]]],tags:{landuse:'grass'}}]};
  const merged = mergeFixedRegionalTransport(data,ground).elements;
  assert.deepEqual(merged.slice(0,2),data.elements);
  assert.notEqual(merged[2].id,-1);
  assert.deepEqual(merged[3].nodes,[merged[2].id]);
  assert.deepEqual(merged[3].surfaceHoles,ground.elements[1].surfaceHoles);
});

test('parking uses its mapped physical material without changing geometry ownership', () => {
  const ctx = {surfaceTextureSets:{pavement:{map:{name:'pavement'}},rock:{map:{name:'gravel'}},soil:{map:{name:'soil'}}}};
  const composition={polygonOffsetFactor:-1,polygonOffsetUnits:-1};
  assert.equal(hardscapeMaterialOptions(ctx,'parking',composition,{surface:'gravel'}).material.map.name,'gravel');
  assert.equal(hardscapeMaterialOptions(ctx,'parking',composition,{surface:'dirt'}).material.map.name,'soil');
  assert.equal(hardscapeMaterialOptions(ctx,'parking',composition,{surface:'asphalt'}).material.color,0x777b80);
  assert.equal(hardscapeMaterialOptions(ctx,'parking',composition).material.map.name,'pavement');
});
