import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const recipe={version:1,bands:[{side:1,startMeters:0,endMeters:40,widthMeters:.7,heightMeters:.06,rampMeters:.4,taperMeters:2,stripeMeters:1,phaseMeters:0}]},road={pts:[{x:0,z:0},{x:0,z:40}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},edgeBandRecipe:recipe},crossing={pts:[{x:-10,z:20},{x:10,z:20}],width:6,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}},partition=(v,sample)=>Float32Array.from(v.map((n,i)=>i%3===1?sample(v[i-1],v[i+1]):n));
test('a shared asphalt junction receives a kerb taper before its clearing boundary',()=>{
 const input=[road,crossing],before=JSON.stringify(input),meshes=[],tiles=prepareCarriagewayTiles(input);
 for(const tile of tiles){const data=meshCarriagewayTile(tile,()=>10,partition);for(const b of [data,data.edgeBands])if(b?.indices.length)meshes.push({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}});}
 assert.equal(JSON.stringify(input),before,'off-scene furniture preparation must not alter source roads');
 const contact=createRoadContactIndex(meshes);
 try{
  assert.ok(contact.sampleAt(3.9,10,10)>10.059,'the remote band retains its normal height');
  for(const boundary of[17,23])for(const delta of[-.001,0,.001])assert.ok(Math.abs(contact.sampleAt(3.9,boundary+delta,10)-10)<.001,'the junction edge cannot cut a nonzero roof');
  for(const range of[[14,18],[22,26]]){let previous=null;for(let i=0;i<=200;i++){const z=range[0]+(range[1]-range[0])*i/200,y=contact.sampleAt(3.9,z,10);assert.ok(Number.isFinite(y));if(previous!==null)assert.ok(Math.abs(y-previous)/.02<.04,'physical entry/exit stays within the authored taper grade');previous=y;}}
 }finally{contact.dispose();}
});

test('one source clearance is shared across cell boundaries and elevated roads do not clear ground kerbs',()=>{
 const target={...road,pts:[{x:0,z:100},{x:0,z:156}],edgeBandRecipe:{version:1,bands:recipe.bands.map(b=>({...b,endMeters:56}))}},other={...crossing,pts:[{x:-10,z:128},{x:10,z:128}]},tiles=prepareCarriagewayTiles([target,other]),recipes=new Set(),meshes=[];
 for(const tile of tiles){for(const s of tile.segments)if(s.road.edgeBandRecipe)recipes.add(JSON.stringify(s.road.edgeBandRecipe));const data=meshCarriagewayTile(tile,()=>10,partition);for(const b of[data,data.edgeBands])if(b?.indices.length)meshes.push({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}});}
 assert.equal(recipes.size,1,'neighbouring cells cannot author separate entry/exit tapers');
 const contact=createRoadContactIndex(meshes);try{for(const z of[124.999,125,125.001,127.999,128,128.001,130.999,131,131.001])assert.ok(Math.abs(contact.sampleAt(3.9,z,10)-10)<.001);}finally{contact.dispose();}
 const overpass=prepareCarriagewayTiles([road,{...crossing,structureSemantics:{terrainMode:'elevated'}}]),published=[];
 for(const tile of overpass){const data=meshCarriagewayTile(tile,()=>10,partition);for(const b of[data,data.edgeBands])if(b?.indices.length)published.push({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}});}
 const below=createRoadContactIndex(published);try{assert.ok(below.sampleAt(3.9,20,10)>10.059);}finally{below.dispose();}
});
