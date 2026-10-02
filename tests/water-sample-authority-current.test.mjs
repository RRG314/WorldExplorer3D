import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {sampleDynamicWaterAt, resolveWaterSampleCandidate} from '../app/js/boat-mode/water-query.js';
import {normalizeWaterBody} from '../app/js/world/water-body-contract.js';
import {createSurfaceQuery} from '../app/js/world/surface-contract.js';
const ring=(r)=>[{x:-r,z:-r},{x:r,z:-r},{x:r,z:r},{x:-r,z:r}];
test('shore water queries use small non-navigable lake datum instead of sea-level fallback',()=>{
 ctx.boatMode={};ctx.waterways=[];ctx.waterAreas=[normalizeWaterBody({pts:ring(10),surfaceY:1500,kindHint:'lake',navigable:false})];
 const sample=sampleDynamicWaterAt(0,0,null,{time:4});assert.equal(sample.baseY,1500);assert.equal(sample.profile.waterKind,'lake');
 assert.equal(sample.coverage,'known-water-body');assert.ok(Math.abs(Math.hypot(sample.normal.x,sample.normal.y,sample.normal.z)-1)<1e-9);
 ctx.sampleDynamicWaterAt=sampleDynamicWaterAt;
 const query=createSurfaceQuery(ctx,{});const surface=query.waterAt(0,0,{time:4});
 assert.equal(surface.position.y,sample.surfaceY);assert.deepEqual(surface.normal,sample.normal);
});
test('water coverage excludes island holes and resolves varying river profiles',()=>{
 ctx.boatMode={};ctx.waterAreas=[normalizeWaterBody({pts:ring(10),holes:[ring(2)],surfaceY:100})];ctx.waterways=[];
 assert.equal(resolveWaterSampleCandidate(0,0),null);assert.ok(resolveWaterSampleCandidate(5,0));
 ctx.waterAreas=[];ctx.waterways=[normalizeWaterBody({shape:'waterway',pts:[{x:0,z:0},{x:10,z:0}],width:4,surfaceProfile:[{x:0,z:0,y:100},{x:10,z:0,y:110}]})];
 assert.ok(resolveWaterSampleCandidate(5,0));assert.equal(sampleDynamicWaterAt(5,0,null,{time:0}).baseY,105);
 assert.equal(resolveWaterSampleCandidate(5,20),null);
});

test('local boat shader uniforms and CPU buoyancy share the modeled profile and spatial scale',async()=>{
 const {getBoatWaveProfile}=await import('../app/js/boat-mode/water-query.js');
 const {buildBoatWaveProfile,applyWaveUniformsToMaterial}=await import('../app/js/boat-mode/surface-effects.js');
 ctx.boatMode={active:true,currentWater:{waterKind:'open_ocean',shorelineDistance:150},shorelineDistance:150,waveIntensity:.1};
 ctx.activeWaterOpticsEvidence={wave:{truthType:'modeled',renderUsable:true,waveHeightM:3,wavePeriodS:9,sourceId:'fixture'}};
 const shader={uniforms:Object.fromEntries(['weWaveTime','weWaveSpeed','weWaveScale','weWaveAmplitude','weWaveSecondaryAmplitude','weWaveSwellAmplitude','weWaveRippleAmplitude'].map(key=>[key,{value:0}]))};
 const material={userData:{weWaterWaveConfig:{localPatch:true,waveBase:1},weWaterWaveShader:shader}};
 const cpu=getBoatWaveProfile(ctx.boatMode.currentWater);const bundle=buildBoatWaveProfile(material,.1,42);
 assert.deepEqual(bundle.profile,cpu);assert.equal(cpu.waveEvidenceSource,'fixture');
 applyWaveUniformsToMaterial(material,bundle);assert.equal(shader.uniforms.weWaveTime.value,42);assert.equal(shader.uniforms.weWaveScale.value,cpu.spatialScale);assert.equal(shader.uniforms.weWaveAmplitude.value,cpu.primaryAmplitude);
 ctx.activeWaterOpticsEvidence=null;
});

test('generated shader wave equations agree numerically with CPU sampling across space and time',async()=>{
 const {buildWaterShaderLibrary,sampleWaterSurfaceMotion,resolveWaterMotionProfile,MAX_SAFE_WATER_TROUGH_DEPTH}=await import('../app/js/water-dynamics.js');
 const library=buildWaterShaderLibrary();
 const keys=['weWaveTime','weWaveSpeed','weWaveScale','weWaveAmplitude','weWaveSecondaryAmplitude','weWaveSwellAmplitude','weWaveRippleAmplitude'];
 const components=['Primary','Secondary','Swell','Ripples'].map(name=>{
   const expression=library.match(new RegExp(`float weWave${name}\\(vec2 worldXZ\\) \\{\\s*return ([^;]+);`))[1];
   // Evaluate generated scalar GLSL directly (only sin/vec2 need adapters).
   return new Function('worldXZ',...keys,'sin','vec2',`return ${expression}`);
 });
 for(const waterKind of ['lake','coastal','open_ocean'])for(const time of [0,4,80])for(const x of [-150,0,211]){
   const profile=resolveWaterMotionProfile({waterKind,shorelineDistance:120,intensity:.7});const z=x*.61;
   const values=[time,profile.speed,profile.spatialScale,profile.primaryAmplitude,profile.secondaryAmplitude,profile.swellAmplitude,profile.rippleAmplitude];
   const gpu=Math.max(-MAX_SAFE_WATER_TROUGH_DEPTH,components.reduce((sum,f)=>sum+f({x,y:z},...values,Math.sin,(x,y)=>({x,y})),0));
   const cpu=sampleWaterSurfaceMotion(x,z,time,{profile}).height;
   assert.ok(Math.abs(cpu-gpu)<0.0002,`${waterKind} ${x} ${time}: CPU ${cpu} shader ${gpu}`);
 }
});

test('missing water coverage does not turn terrain into a numeric waterline',async()=>{
 const {waterSurfaceYAt}=await import('../app/js/boat-mode/water-query.js');
 ctx.boatMode={};ctx.waterAreas=[];ctx.waterways=[];ctx.elevationWorldYAtWorldXZ=()=>320;
 assert.ok(Number.isNaN(waterSurfaceYAt(0,0,null,{time:0})));
 const query=createSurfaceQuery(ctx,{});const unknown=query.waterAt(0,0,{time:0});
 assert.equal(unknown.traversal.boat,false);assert.equal(unknown.provenance.confidence,0);
});
test('ocean weather cannot become inland lake wave evidence',async()=>{
 const {getBoatWaveProfile}=await import('../app/js/boat-mode/water-query.js');
 ctx.boatMode={waveIntensity:.2,shorelineDistance:100};ctx.activeWaterOpticsEvidence={wave:{truthType:'modeled',renderUsable:true,waveHeightM:4,wavePeriodS:2,sourceId:'marine-grid'}};
 const lake=getBoatWaveProfile({waterKind:'lake',shorelineDistance:0});assert.equal(lake.waveEvidenceSource,undefined);
 ctx.activeWaterOpticsEvidence=null;
});

test('direct Ocean launch can create its bounded surface boat without Earth terrain loaded',async()=>{
 const {buildSyntheticBoatCandidate}=await import('../app/js/boat-mode/water-query.js');
 delete ctx.elevationWorldYAtWorldXZ;ctx.boatMode={};
 const candidate=buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean'});
 assert.ok(candidate);assert.equal(candidate.surfaceY,.08);assert.equal(candidate.synthetic,true);
});

test('accepted marine and terrain origins use one validated coordinate commit',async()=>{
 const {commitEarthLocationOrigin}=await import('../app/js/earth-core/location-origin.js');
 const ctx={LOC:{lat:39,lon:-76}},location={lat:0,lon:-140};commitEarthLocationOrigin(ctx,location);
 location.lat=50;assert.equal(ctx.LOC.lat,0);
 assert.throws(()=>commitEarthLocationOrigin(ctx,{lat:null,lon:1}),/valid geographic/);assert.equal(ctx.LOC.lon,-140);
});


test('direct Ocean boat remains offshore without Earth helpers and respects island clearance',async()=>{
 const {buildSyntheticBoatCandidate}=await import('../app/js/boat-mode/water-query.js');
 const {measureBoatShorelineDistance,resolveBoatSpawnPoint,pointInsideBoatCandidate}=await import('../app/js/boat-mode/water-geometry.js');
 delete ctx.pointInPolygon;delete ctx.elevationWorldYAtWorldXZ;
 const candidate=buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean',surfaceY:.08});
 assert.ok(measureBoatShorelineDistance(candidate,0,0)>400);
 const spawn=resolveBoatSpawnPoint(candidate,2,3);assert.equal(spawn.x,2);assert.equal(spawn.z,3);
 const island={type:'area',source:normalizeWaterBody({pts:ring(100),holes:[ring(10)]})};
 assert.equal(measureBoatShorelineDistance(island,12,0),2);
 assert.equal(pointInsideBoatCandidate(island,12,0,3),false);
 assert.equal(pointInsideBoatCandidate(island,14,0,3),true);
 assert.equal(measureBoatShorelineDistance(island,0,0),0);
});
