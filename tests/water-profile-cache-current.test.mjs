import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {resolveBodyWaveProfile} from '../app/js/world/water-motion-profile.js';
import {inferWaterRenderContext,resolveWaterMotionProfile,sampleWaterSurfaceMotion} from '../app/js/water-dynamics.js?v=9';
import {modeledWaveRenderControls} from '../app/js/world/water-optics-evidence.js?v=2';
// Uncached composition of the independent body/evidence authorities, preserving
// the pre-cache public result and wave sampling rather than a cache-key mirror.
function uncached(body,options={}){
 const s=body?.source||body||{},waterKind=inferWaterRenderContext({kindHint:s.waterKind||body?.waterKind,width:s.width,area:s.area});
 const fetch=s.bounds?Math.max(0,Math.min(s.bounds.maxX-s.bounds.minX,s.bounds.maxZ-s.bounds.minZ)*.25):s.shape==='waterway'?Math.max(0,Number(s.width)||0)*.5:Number(body?.shorelineDistance)||0;
 const wave=modeledWaveRenderControls(waterKind==='lake'?null:options.waveEvidence);
 const p=resolveWaterMotionProfile({waterKind,shorelineDistance:waterKind==='open_ocean'?420:fetch,intensity:wave.usable?wave.intensity:options.intensity,active:options.active!==false,energyScale:options.energyScale});
 if(wave.usable){p.speed*=wave.speedScale;p.waveEvidenceSource=wave.sourceId;p.modeledWaveHeightM=wave.waveHeightM;p.modeledWavePeriodS=wave.wavePeriodS;}
 return p;
}
test('cached body profiles and sampled water remain exactly equivalent across bodies, weather and settings',()=>{
 ctx.boatMode={seaState:'moderate'};
 for(let i=0;i<1200;i++){
  const body={source:{waterKind:['lake','harbor','channel','coastal','open_ocean',''][i%6],width:i%120,area:i*1000,
    ...(i%2?{bounds:{minX:-i,maxX:i*2,minZ:-40,maxZ:40}}:{shape:'waterway'})}};
  const options={intensity:(i%100)/99,active:i%3!==0,energyScale:.5+(i%10)/10,
    waveEvidence:{truthType:i%4?'modeled':'unknown',renderUsable:i%5!==0,waveHeightM:(i%17)/4,wavePeriodS:i%13,sourceId:'fixture'}};
  const expected=uncached(body,options),actual=resolveBodyWaveProfile(body,options);
  assert.deepEqual(actual,expected);assert.equal(resolveBodyWaveProfile({source:body.source},{...options}),actual);
  assert.deepEqual(sampleWaterSurfaceMotion(i,-i,i*.25,{profile:actual}),sampleWaterSurfaceMotion(i,-i,i*.25,{profile:expected}));
 }
});
test('every changing input invalidates safely and previously returned snapshots remain immutable',()=>{
 ctx.boatMode={seaState:'moderate'};
 const body={source:{width:20,area:1000,bounds:{minX:0,maxX:100,minZ:0,maxZ:80}}};
 const options={waveEvidence:{truthType:'modeled',renderUsable:true,waveHeightM:1,wavePeriodS:6,sourceId:'first'}};
 const mutate=[()=>body.source.waterKind='coastal',()=>body.source.width=120,()=>body.source.area=1e6,
  ()=>body.source.bounds.maxZ=800,()=>options.active=false,()=>options.energyScale=.2,()=>options.intensity=.9,
  ()=>options.waveEvidence.waveHeightM=3,()=>options.waveEvidence.wavePeriodS=12,()=>options.waveEvidence.sourceId='second',
  ()=>options.waveEvidence.renderUsable=false,()=>options.waveEvidence.truthType='unknown',()=>options.intensity=undefined,
  ()=>ctx.boatMode.waveIntensity=.25,()=>{ctx.boatMode.waveIntensity=undefined;ctx.boatMode.seaState='rough';},
  ()=>{delete body.source.bounds;body.source.shape='waterway';},()=>{delete body.source.shape;body.shorelineDistance=75;},
  ()=>body.source.bounds={minX:0,maxX:NaN,minZ:0,maxZ:50}];
 for(const change of mutate){const prior=resolveBodyWaveProfile(body,options),saved={...prior};change();assert.deepEqual(resolveBodyWaveProfile(body,options),uncached(body,options));assert.deepEqual(prior,saved);assert.throws(()=>{prior.speed=123;},TypeError);}
});
