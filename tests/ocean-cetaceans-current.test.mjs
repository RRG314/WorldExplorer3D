import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {commonDolphinEligibility,dolphinWaterEnvelope,dolphinTargetDepth} from '../app/js/ocean/cetacean-rules.js';
import {createCetaceanLife} from '../app/js/ocean/cetacean-life.js';
import {createOceanFishLifeApi} from '../app/js/ocean/fish-life.js';
import {createFishPopulationContext} from '../app/js/fishing/population-authority.js';
const depthProfile={model:'geographic-metres-v1',entryDepthMeters:180};
const context=(options={})=>createFishPopulationContext({latitude:34,longitude:-120,waterKind:'open_ocean',accessMode:'underwater',...options});
const volume=(units=1.1,bottom=-180)=>({surfaceY:0,bottomY:bottom/units,metersPerWorldUnit:units});

test('common dolphins require reviewed offshore regions and metre-scale habitat, independent of fish catch eligibility',()=>{
 assert.equal(commonDolphinEligibility(context(),depthProfile).region,'california-current');
 assert.equal(commonDolphinEligibility(context({latitude:39,longitude:-70}),depthProfile).region,'northwest-atlantic');
 assert.equal(commonDolphinEligibility({...context(),playable:false,candidateSpeciesIds:[]},depthProfile).allowed,true);
 for(const options of [{waterKind:'lake'},{waterKind:'coastal'},{waterKind:'river'},{latitude:-18,longitude:147},{latitude:34,longitude:-70},{latitude:60},{latitude:null},{habitat:'coral-reef'},{accessMode:'shore'}])assert.equal(commonDolphinEligibility(context(options),depthProfile).allowed,false,JSON.stringify(options));
 assert.equal(commonDolphinEligibility(context(),{model:'authored-depth-v1'}).allowed,false);
 assert.deepEqual(dolphinWaterEnvelope({volume:volume()}),volume());
});

test('dolphin bottom habitat and surface/feeding depths are separate, including unknown water rejection',()=>{
 assert.ok(dolphinWaterEnvelope(volume()));assert.equal(dolphinWaterEnvelope(volume(1,-30)),null);assert.equal(dolphinWaterEnvelope(volume(1,-4000)),null);
 for(const v of [null,{...volume(),bottomY:null},{...volume(),metersPerWorldUnit:0},{...volume(),surfaceY:NaN}])assert.equal(dolphinWaterEnvelope(v),null);
 assert.equal(dolphinTargetDepth(0),.08);assert.equal(dolphinTargetDepth(52),.08);assert.ok(dolphinTargetDepth(28.5)>12);
});

test('cetaceans swim without teleporting, surface repeatedly, avoid hulls, pause, and retire leases',async()=>{
 const oceanMode={depthProfile},scene=new THREE.Scene(),leases=[];let blocked=false;
 const api=createCetaceanLife({THREE,oceanMode,sampleWater:()=>volume(),isBlocked:p=>blocked||Math.hypot(p.x-45,p.z-80)<8,
  loadVisual:async()=>{const visual={root:new THREE.Group(),updates:[],disposed:0,update(dt){this.updates.push(dt)},dispose(){this.disposed++}};leases.push(visual);return visual;}});
 await api.init(scene,context());assert.equal(oceanMode.cetaceans.length,3);
 const shallow=[Infinity,Infinity,Infinity],deep=[0,0,0];
 for(let frame=0;frame<3600;frame++){
  const before=oceanMode.cetaceans.map(a=>a.mesh.position.clone());api.update(1/30);
  oceanMode.cetaceans.forEach((a,i)=>{const p=a.mesh.position;assert.ok(p.distanceTo(before[i])<.09);assert.ok(Math.hypot(p.x-45,p.z-80)>=8);assert.ok(p.y>=-20/1.1&&p.y<=.12/1.1);assert.equal(a.mesh.visible,true);if(frame>1500){shallow[i]=Math.min(shallow[i],-p.y*1.1);deep[i]=Math.max(deep[i],-p.y*1.1);}});
 }
 assert.ok(shallow.every(v=>v<.15));assert.ok(deep.every(v=>v>11));
 const before=oceanMode.cetaceans.map(a=>a.mesh.position.toArray());api.update(0);assert.deepEqual(oceanMode.cetaceans.map(a=>a.mesh.position.toArray()),before);
 blocked=true;api.update(.1);assert.ok(oceanMode.cetaceans.every(a=>!a.mesh.visible));assert.deepEqual(oceanMode.cetaceans.map(a=>a.mesh.position.toArray()),before);
 api.clear();api.clear();assert.equal(scene.children.length,0);assert.ok(leases.every(l=>l.disposed===1));
});

test('late model completion is fenced from a new region and failed models remain absent',async()=>{
 const oceanMode={depthProfile},scene=new THREE.Scene(),pending=[],leases=[];
 const api=createCetaceanLife({THREE,oceanMode,sampleWater:()=>volume(),isBlocked:()=>false,loadVisual:()=>new Promise(resolve=>pending.push(()=>{const v={root:new THREE.Group(),dispose(){this.disposed=(this.disposed||0)+1}};leases.push(v);resolve(v)}))});
 const first=api.init(scene,context());assert.equal(pending.length,3);await api.init(scene,context({latitude:-18,longitude:147}));pending.forEach(done=>done());await first;
 assert.equal(scene.children.length,0);assert.equal(oceanMode.cetaceans.length,0);assert.ok(leases.every(l=>l.disposed===1));
 const failed=createCetaceanLife({THREE,oceanMode,sampleWater:()=>volume(),isBlocked:()=>false,loadVisual:async()=>{throw Error('offline')}});
 await failed.init(scene,context());failed.update(.1);assert.ok(oceanMode.cetaceans.every(a=>a.visualState==='unavailable'&&!a.mesh.visible));failed.clear();
});

test('existing ocean life owner updates and clears mammals even without a playable fish pool',async()=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;const mode={depthProfile,fishEntities:[],fishSchools:[]},scene=new THREE.Scene();
 const api=createOceanFishLifeApi({oceanMode:mode,disposeObject3D(){},sampleWater:()=>volume(),loadCetaceanVisual:async()=>({root:new THREE.Group(),update(){},dispose(){}})});
 try{api.initFishLife(scene,{...context(),playable:false,candidateSpeciesIds:[]});await mode.fishVisualsReady;api.updateFishLife(0,.1);
 assert.equal(mode.fishEntities.length,0);assert.equal(mode.cetaceans.length,3);assert.ok(mode.cetaceans.every(a=>a.mesh.visible));api.clearFishLife();assert.equal(scene.children.length,0);
 }finally{api.clearFishLife();if(prior===undefined)delete globalThis.THREE;else globalThis.THREE=prior;}
});
