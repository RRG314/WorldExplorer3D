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

test('mapped water shader and contact share a body profile regardless of walking or boating',async()=>{
 const {buildBoatWaveProfile,applyWaveUniformsToMaterial}=await import('../app/js/boat-mode/surface-effects.js');
 const source=normalizeWaterBody({pts:ring(200),surfaceY:12,kindHint:'lake'});
 ctx.waterAreas=[source];ctx.waterways=[];ctx.activeWaterOpticsEvidence=null;
 const material={userData:{weWaterWaveConfig:{waterBody:source,waterKind:'lake',waveBase:.4,waveScale:.55},weWaterWaveShader:{uniforms:Object.fromEntries(['weWaveTime','weWaveSpeed','weWaveScale','weWaveAmplitude','weWaveSecondaryAmplitude','weWaveSwellAmplitude','weWaveRippleAmplitude'].map(k=>[k,{value:0}]))}}};
 let first;
 for(const active of [false,true]){
  ctx.boatMode={active,waveIntensity:.46};
  const cpu=sampleDynamicWaterAt(12,15,null,{time:8}).profile;
  const bundle=buildBoatWaveProfile(material,.46,8);applyWaveUniformsToMaterial(material,bundle);
  assert.deepEqual(bundle.profile,cpu);
  assert.equal(material.userData.weWaterWaveShader.uniforms.weWaveScale.value,cpu.spatialScale);
  assert.equal(material.userData.weWaterWaveShader.uniforms.weWaveAmplitude.value,cpu.primaryAmplitude);
  if(first)assert.deepEqual(cpu,first);first=cpu;
 }
});

test('wake contact height agrees with the shader expression at stern, bow and turns',async()=>{
 const {WAKE_EXPRESSION,sampleBoatWakeHeight}=await import('../app/js/boat-mode/wake-field.js');
 const expression=new Function('side','stern','bow','spread','strength','bowWave','splash','smoothstep','exp','pow','abs','max',`return (${WAKE_EXPRESSION})`);
 const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
 for(const angle of [0,.6,2.8])for(const x of [-15,0,4,80])for(const z of [-32,-4,0,6,25]){
  const wake={x:2,z:1,forwardX:Math.sin(angle),forwardZ:Math.cos(angle),spread:.8,strength:1.1,bowWave:.9,splash:.3};
  const dx=x-wake.x,dz=z-wake.z,side=dx*wake.forwardZ-dz*wake.forwardX,along=dx*wake.forwardX+dz*wake.forwardZ;
  const gpu=expression(side,Math.max(0,-along),Math.max(0,along),.8,1.1,.9,.3,smooth,Math.exp,Math.pow,Math.abs,Math.max);
  assert.ok(Math.abs(gpu-sampleBoatWakeHeight(x,z,wake))<1e-12);
 }
 const {buildSyntheticBoatCandidate}=await import('../app/js/boat-mode/water-query.js');
 const body=buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean',surfaceY:.08});
 ctx.boat={x:0,z:0,angle:0};ctx.boatMode={active:false,currentWater:body,waveIntensity:.3};
 const without=sampleDynamicWaterAt(0,4,body,{time:3});
 ctx.boatMode.active=true;ctx.boatMode.bowWaveStrength=1;
 const withWake=sampleDynamicWaterAt(0,4,body,{time:3});assert.ok(withWake.surfaceY>without.surfaceY);
 assert.ok(Math.abs(Math.hypot(...Object.values(withWake.normal))-1)<1e-9);
});

test('water volume preserves unknown depth/current and has explicit immersion boundaries',async()=>{
 const {describeWaterVolume,sampleImmersion,waterCurrentSample}=await import('../app/js/world/water-volume-sample.js');
 const candidate={waterKind:'open_ocean',id:'sea'};
 const volume=describeWaterVolume({candidate,surfaceY:3,baseY:2,normal:{x:0,y:1,z:0},time:9,metersPerUnit:2});
 assert.equal(volume.gameplayDepthMeters,null);assert.equal(volume.depthEvidence.depthMeters,null);assert.equal(volume.current.vectorMetersPerSecond,null);
 assert.equal(sampleImmersion(volume,3,5).state,'dry');assert.equal(sampleImmersion(volume,2,4).fraction,.5);
 assert.equal(sampleImmersion(volume,0,2).headSubmerged,true);assert.equal(sampleImmersion(null,0,2).state,'unknown');
 const evidence={truthType:'modeled',sourceId:'fixture',renderUsable:true,validAt:'2026-10-02T12:00:00Z',currentVelocityKph:3.6,currentDirectionDeg:90,currentDirectionConvention:'direction-current-flows-to'};
 const now=Date.parse(evidence.validAt);
 assert.equal(waterCurrentSample(evidence,'open_ocean',now).vectorMetersPerSecond.x,1);
 assert.equal(waterCurrentSample(evidence,'lake',now).truthType,'unknown');
 assert.equal(waterCurrentSample(evidence,'coastal',now+4*3600000).truthType,'unknown');
 assert.equal(waterCurrentSample({...evidence,currentVelocityKph:null},'coastal',now).truthType,'unknown');
});

test('horizon water retains metre-scale contact geometry around the vessel',async()=>{
 const {waterPatchCoordinate}=await import('../app/js/world/water-patch-geometry.js');
 const coords=Array.from({length:129},(_,i)=>waterPatchCoordinate(i,128,14000));
 assert.equal(coords[0],-14000);assert.equal(coords[128],14000);assert.equal(coords[64],0);
 for(let i=1;i<coords.length;i++)assert.ok(coords[i]>coords[i-1]);
 for(let i=33;i<=96;i++)assert.ok(coords[i]-coords[i-1]<=1.000001);
});


test('mapped vessel footprint startup uses its water area and buffered island boundary',async()=>{
 const {isPointInsideWaterAreaFootprint}=await import('../app/js/boat-mode/water-geometry.js');
 const area=normalizeWaterBody({pts:ring(200),holes:[ring(10)],navigable:true});
 assert.equal(isPointInsideWaterAreaFootprint(area,40,0,8),true);
 assert.equal(isPointInsideWaterAreaFootprint(area,12,0,8),false);
 assert.equal(isPointInsideWaterAreaFootprint(area,198,0,8),false);
});

test('bounded transition water cannot leak onto land after exiting the boat',async()=>{
 const {buildSyntheticBoatCandidate}=await import('../app/js/boat-mode/water-query.js');
 ctx.waterAreas=[];ctx.waterways=[];ctx.boatMode={active:true,currentWater:buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean'})};
 assert.equal(resolveWaterSampleCandidate(1000,0),null);
 assert.ok(resolveWaterSampleCandidate(0,0));ctx.boatMode.active=false;
 assert.equal(resolveWaterSampleCandidate(0,0),null);
});

test('water wave phase survives a translated marine origin',async()=>{
 const {buildSyntheticBoatCandidate}=await import('../app/js/boat-mode/water-query.js');
 ctx.boatMode={active:false};ctx.activeWaterOpticsEvidence=null;
 const ocean={source:{waterKind:'open_ocean',surfaceY:.08,waveOffset:{x:17,z:28}}};
 const before=sampleDynamicWaterAt(36,-14,ocean,{time:42});
 const boat=buildSyntheticBoatCandidate(0,0,{waterKind:'open_ocean',surfaceY:.08,waveOffset:{x:53,z:14}});
 const after=sampleDynamicWaterAt(0,0,boat,{time:42});
 assert.equal(before.surfaceY,after.surfaceY);assert.deepEqual(before.normal,after.normal);
});


test('shore casts resolve mapped non-navigable ponds and island banks without granting boat access',async()=>{
 const {nearestFishingWater}=await import('../app/js/fishing/water-access.js');
 const pond=normalizeWaterBody({pts:ring(10),surfaceY:50,kindHint:'lake',navigable:false});
 const fixture={waterAreas:[pond],waterways:[]};
 const bank=nearestFishingWater(fixture,15,0,42,{referenceY:50});
 assert.equal(bank.source,pond);assert.equal(bank.distanceToWater,5);assert.ok(bank.entryPoint.x<10);
 assert.equal(pond.navigable,false);
 assert.equal(nearestFishingWater(fixture,15,0,42,{referenceY:100}),null);
 pond.holes=[ring(2)];const island=nearestFishingWater(fixture,0,0,42,{referenceY:50});
 assert.equal(island.inside,false);assert.ok(Math.max(Math.abs(island.entryPoint.x),Math.abs(island.entryPoint.z))>2);
 const buried=normalizeWaterBody({shape:'waterway',pts:[{x:0,z:0},{x:10,z:0}],width:3,structureSemantics:{terrainMode:'subgrade'}});
 assert.equal(nearestFishingWater({waterAreas:[],waterways:[buried]},1,3,42),null);
});
