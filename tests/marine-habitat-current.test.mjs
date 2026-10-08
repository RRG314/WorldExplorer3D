import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {createMarineHabitatPlan,marineHabitatCollision,CORAL_SHELF_SITE} from '../app/js/ocean/habitat-plan.js';
import {MODEL_ASSET_CATALOG} from '../app/js/assets/model-asset-catalog.js';
const plan=(sampleSeabedHeight=()=>-30,site=CORAL_SHELF_SITE)=>createMarineHabitatPlan({site,scale:100000,sampleSeabedHeight});
test('regional coral pack is deterministic, finite and does not invent coral in unknown oceans',()=>{
 const p=plan();assert.deepEqual(p,plan());assert.equal(p.corals.length,192);assert.equal(p.landmarks.length,3);assert.equal(p.truthType,'authored');
 for(const site of [{lat:0,lon:0},{lat:60,lon:147.7},null]){const generic=plan(()=>-30,site);assert.equal(generic.featured,false);assert.equal(generic.corals.length,0);assert.equal(generic.grass.length,0);}
 for(const height of [NaN,0,-2]){const p=plan(()=>height);assert.equal(p.corals.length,0);assert.equal(p.grass.length,0);assert.equal(p.rocks.length,0);}
});
test('a provider rebuild changes height without reshuffling remaining reef patches',()=>{
 const before=plan(),after=plan((x,z)=>x<0&&z<100?0:-35);
 for(const c of after.corals){const original=before.corals.find(o=>o.id===c.id);assert.equal(c.x,original.x);assert.equal(c.z,original.z);assert.equal(c.yaw,original.yaw);assert.equal(c.scale,original.scale);assert.ok(Math.abs(c.y-original.y+5)<1e-9);}
 assert.ok(after.corals.length<before.corals.length);
});
test('habitat positions stay geographically anchored after a changed launch origin',()=>{
 const a=plan(),b=plan(()=>-30,{lat:CORAL_SHELF_SITE.lat,lon:CORAL_SHELF_SITE.lon+.001});
 const dx=.001*100000*Math.cos(CORAL_SHELF_SITE.lat*Math.PI/180);
 assert.ok(Math.abs(a.corals[0].x-b.corals[0].x-dx)<1e-6);assert.equal(a.corals[0].z,b.corals[0].z);
});
test('coral and foundation collisions protect close approaches while preserving clear water',()=>{
 const p=plan(),r=p.rocks[0],c=p.corals[0];assert.equal(marineHabitatCollision(p,r,.4),true);assert.equal(marineHabitatCollision(p,{x:c.x,y:c.y+c.scale,z:c.z},.4),true);
 assert.equal(marineHabitatCollision(p,{x:0,y:-5,z:0},3),false);assert.equal(marineHabitatCollision(p,{x:r.x,y:r.y+20,z:r.z},.4),false);
});
test('every coral GLB has traceable rights and measured near/far budgets with no remote decoder',async()=>{
 const manifest=JSON.parse(await readFile('app/assets/models/marine/asset-manifest.json','utf8'));const io=new NodeIO();let total=0;
 for(const record of manifest.assets){assert.equal(record.license,'CC0-1.0');assert.match(record.source,/^https:\/\/3d-api.si.edu\/content\//);assert.match(record.sourceSha256,/^[a-f0-9]{64}$/);
  for(const [level,suffix] of [['near',''],['far','-lod']]){const asset=MODEL_ASSET_CATALOG.find(a=>a.id===`marine-${record.id}${suffix}`),bytes=await readFile(`.${asset.url}`);total+=bytes.length;
   assert.equal(createHash('sha256').update(bytes).digest('hex'),record[level].sha256);assert.ok(bytes.length<=asset.budgets.bytes);
   const doc=await io.readBinary(bytes),triangles=doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
   assert.equal(triangles,record[level].triangles);assert.ok(triangles<=asset.budgets.triangles);assert.ok(!doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression'));
  }
 }assert.ok(total<1.6e6);assert.ok(manifest.assets.every(a=>a.far.triangles<a.near.triangles*.3));
});

test('authored sound starts only on request, mutes when paused/hidden, and closes on disposal',async()=>{
 const {createOceanSoundscape}=await import('../app/js/ocean/soundscape.js');const original=globalThis.document;let hidden=false,instances=0,stopped=0,closed=0,level=0;
 const parameter={setTargetAtTime(value){level=value}};const node=()=>({connect(){return this},disconnect(){},start(){},stop(){stopped++},frequency:{setTargetAtTime(){}},gain:parameter});
 class Audio{constructor(){instances++;this.currentTime=0;this.sampleRate=100;this.state='running'}createGain(){return node()}createBiquadFilter(){return node()}createBuffer(){return {getChannelData:()=>new Float32Array(200)}}createBufferSource(){return node()}async resume(){}async close(){closed++;this.state='closed'}}
 globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){}})};
 try{const sound=createOceanSoundscape({host:{append(){}},AudioContextCtor:Audio,hidden:()=>hidden});assert.equal(instances,0);await sound.toggle();assert.equal(instances,1);sound.update({speed:4});assert.ok(level>0);sound.update({paused:true});assert.equal(level,0);hidden=true;sound.update();assert.equal(level,0);hidden=false;await sound.toggle();sound.update();assert.equal(level,0);sound.dispose();sound.dispose();assert.equal(stopped,1);assert.equal(closed,1);assert.equal(await sound.toggle(),false);}
 finally{globalThis.document=original;}
});
