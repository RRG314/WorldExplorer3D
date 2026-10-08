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

test('physical hardscape does not override raised surfaces with a camera-dependent depth bias',()=>{
  for(const type of ['parking','paved']){
    const material=hardscapeMaterialOptions({},type,{polygonOffsetFactor:-3,polygonOffsetUnits:-3},{}).material;
    assert.equal(material.polygonOffset,false);
    assert.equal(material.depthWrite,true);
  }
});

test('mapped brick plazas retain the installed brick material and its physical repeat',()=>{
 const brick={map:{name:'brick'},roughnessMap:{name:'brick-roughness'}};
 const material=hardscapeMaterialOptions({surfaceTextureSets:{brick,pavement:{map:{name:'concrete'}}}},'paved',{}, {surface:'bricks'});
 assert.equal(material.material.map,brick.map);assert.equal(material.material.roughnessMap,brick.roughnessMap);
 assert.equal(material.metersPerTile,1.6);
 // The live engine publishes facade sets under these legacy handles, not in
 // surfaceTextureSets. Exercise that actual integration shape as well.
 const live=hardscapeMaterialOptions({brickDiffuse:brick.map,brickRoughness:brick.roughnessMap,surfaceTextureSets:{pavement:{map:{name:'pavement'}}}},'paved',{}, {surface:'bricks'});
 assert.equal(live.material.map,brick.map);assert.equal(live.material.roughnessMap,brick.roughnessMap);
});


test('large forests retain physical cover without expanding an area-sized spatial grid',()=>{
  const forest=feature('forest',-150000,150000,{sourceFeatureId:'large-forest',holeRings:[ring(-500,500)]});
  const index=indexMappedGround([forest,feature('grass',-400,400)]);
  assert.equal(index.sample(100000,100000).mode,'forest');
  assert.equal(index.sample(0,0).mode,'grass');
  assert.equal(index.sample(450,450),null,'A forest hole must remain open outside the grass patch');
  assert.equal(index.stats.featureReferences,2);
  assert.ok(index.stats.indexBytes<=192);
});

test('bounded land-cover hierarchy matches exhaustive evidence selection across overlap and arrival order',()=>{
  const features=[];
  for(let i=0;i<1200;i++){
    const x=(i*17%149)-74,z=(i*43%151)-75,size=2+i%35;
    features.push({type:i%4?'forest':'grass',sourceFeatureId:`feature-${i}`,pts:[{x,z},{x:x+size,z},{x:x+size,z:z+size},{x,z:z+size}],
      bounds:{minX:x,maxX:x+size,minZ:z,maxZ:z+size},tags:i%7?{}:{surface:'sand'}});
  }
  const expected=[...features].map(f=>({...f,...mappedGroundProfile(f.type,f.tags),area:(f.bounds.maxX-f.bounds.minX)*(f.bounds.maxZ-f.bounds.minZ)}))
    .sort((a,b)=>b.priority-a.priority||a.area-b.area||a.sourceFeatureId.localeCompare(b.sourceFeatureId));
  for(const source of [features,[...features].reverse()]){
    const index=indexMappedGround(source);
    assert.equal(index.stats.featureReferences,features.length);
    assert.ok(index.stats.indexBytes<=features.length*96);
    for(let x=-90;x<=90;x+=3)for(let z=-90;z<=90;z+=3){
      const match=expected.find(f=>x>=f.bounds.minX&&x<f.bounds.maxX&&z>=f.bounds.minZ&&z<f.bounds.maxZ);
      assert.equal(index.sample(x,z)?.sourceFeatureId,match?.sourceFeatureId,`${x}/${z}`);
    }
  }
});
