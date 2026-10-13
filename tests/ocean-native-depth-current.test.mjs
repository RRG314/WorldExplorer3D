import test from 'node:test';
import assert from 'node:assert/strict';
import {OCEAN_DEPTH_MODEL,normalizeOceanDepthProfile,geographicBottomY,extendPresentationDepth} from '../app/js/ocean/depth-model.js';
test('geographic ocean keeps metres at both scuba and abyssal depths',()=>{
 for(const units of [.5,1,1.11,2])for(const depth of [5,18,30,40,200,1000,6000,11000])assert.ok(Math.abs(geographicBottomY(-depth,units)*units+depth)<1e-8);
 assert.equal(geographicBottomY(null,1),null);assert.equal(geographicBottomY(-80,0),null);
 assert.equal(normalizeOceanDepthProfile({model:OCEAN_DEPTH_MODEL.GEOGRAPHIC,entryDepthMeters:null}),null);
 assert.equal(normalizeOceanDepthProfile({model:'unknown',entryDepthMeters:80}),null);
});
test('missing depth rendering extends a bounded grid without inventing a shallow cliff or altering evidence',()=>{
 const grid={size:2,extent:900,values:[-1000,-2000,-3000,-4000]},before=JSON.stringify(grid);
 assert.equal(extendPresentationDepth(grid,0,0,80),-2500);
 assert.equal(extendPresentationDepth(grid,900,900,80),-4000);
 assert.equal(extendPresentationDepth(grid,1200,1200,80),-4000);
 assert.ok(Math.abs(extendPresentationDepth(grid,900.001,0,80)-extendPresentationDepth(grid,899.999,0,80))<.01);
 assert.equal(JSON.stringify(grid),before);
 const gap={size:2,extent:900,values:[null,-2000,-3000,-4000]};assert.ok(extendPresentationDepth(gap,-900,-900,80)<-2000);assert.equal(gap.values[0],null);
 assert.equal(extendPresentationDepth(null,1200,1200,80),-80);
});

import {createOceanBathymetryApi} from '../app/js/ocean/bathymetry.js';
import {validateOceanVoyage,createOceanVoyageStore,OCEAN_VOYAGE_KEY} from '../app/js/ocean/voyage-store.js';
import {prepareSurfaceVoyage,ensureOceanVoyage} from '../app/js/ocean/voyage.js';
import {createSeabedMapData} from '../app/js/ocean/navigation-map.js';
import {submarineFloorLimit,resolveSubmarineTerrainMotion} from '../app/js/ocean/submarine-terrain-motion.js';
const pose=(p={})=>({x:0,y:-25,z:0,yaw:0,pitch:0,roll:0,...p});
test('submarine stops before a rising bed without snapping up or rotating its hull into the slope',()=>{
 const floor=(x,z)=>z>=4?-10:-40,previous=pose();
 const hit=resolveSubmarineTerrainMotion(previous,pose({z:1,yaw:.1}),floor);
 assert.equal(hit.blocked,true);assert.deepEqual(hit.pose,previous);
 const clear=resolveSubmarineTerrainMotion(previous,pose({z:-1}),floor);assert.equal(clear.blocked,false);assert.equal(clear.pose.z,-1);
 const ridge=(x,z)=>x>.1&&x<1.4&&z>.1&&z<1.4?-10:-40;
 assert.ok(submarineFloorLimit(previous,ridge)>-10,'interior footprint catches a ridge missed by centre and corners');
});
test('submarine settles onto level ground, can ascend out of a late-data overlap and cannot skip a cliff',()=>{
 const floor=()=>-30,previous=pose({y:-28});
 const settled=resolveSubmarineTerrainMotion(previous,pose({y:-29}),floor);
 assert.ok(settled.pose.y>=-28.4);assert.ok(settled.pose.y<=previous.y);
 const embedded=pose({y:-31}),up=resolveSubmarineTerrainMotion(embedded,pose({y:-30.8}),floor);
 assert.equal(up.pose.y,-30.8);assert.equal(up.blocked,false);
 const down=resolveSubmarineTerrainMotion(embedded,pose({y:-31.2}),floor);assert.equal(down.blocked,true);assert.equal(down.pose.y,embedded.y);
 assert.equal(resolveSubmarineTerrainMotion(previous,pose({z:1000}),floor).blocked,true);
});
test('one native seabed sampler serves rendered terrain, water volume and map, with truthful gaps',()=>{
 const mode={launchSite:{lat:25,lon:-70},depthProfile:{model:OCEAN_DEPTH_MODEL.GEOGRAPHIC,entryDepthMeters:3000},globalBathymetryGrid:{size:2,extent:900,values:[-20,-40,-60,-80]},bathymetryReady:true};
 const api=createOceanBathymetryApi({appCtx:{SCALE:100000,METERS_PER_WORLD_UNIT:1.11},oceanMode:mode});
 const evidence=api.sampleSeabedEvidence(0,0);
 assert.equal(evidence.presentationMode,'geographic-bathymetry-metres');assert.ok(Math.abs(evidence.presentationWorldY*1.11+50)<1e-8);
 assert.equal(api.sampleSeabedHeight(0,0),evidence.presentationWorldY);
 const outside=api.sampleSeabedEvidence(1200,1200);assert.equal(outside.bathymetry.truthType,'unknown');assert.equal(outside.presentationMode,'origin-grid-depth-extension');assert.ok(Math.abs(outside.presentationWorldY*1.11+80)<1e-8);
 mode.globalBathymetryGrid=null;assert.ok(Math.abs(api.sampleSeabedHeight(0,0)*1.11+3000)<1e-8);assert.equal(api.sampleSeabedEvidence(0,0).bathymetry.truthType,'unknown');
 mode.depthProfile={model:OCEAN_DEPTH_MODEL.LEGACY};assert.ok(api.sampleSeabedHeight(0,0)>-200);
});
test('new depth profiles survive save, vessel recovery and resume while version-one layouts stay legacy',()=>{
 const profile={model:OCEAN_DEPTH_MODEL.GEOGRAPHIC,entryDepthMeters:3000};
 const saved=prepareSurfaceVoyage({lat:25,lon:-70},{x:0,z:0},profile);
 assert.equal(saved.version,2);assert.deepEqual(saved.depthProfile,profile);
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const store=createOceanVoyageStore({storage});assert.equal(store.write(saved).saved,true);assert.deepEqual(store.read().depthProfile,profile);
 const ctx={boatMode:{},oceanMode:{active:true,depthProfile:profile,launchSite:saved.site,waveOffset:saved.waveOffset,submarine:{position:{x:12,y:-800,z:30},yaw:0}}};
 const journey=ensureOceanVoyage(ctx,{store});journey.begin({voyageResume:store.read()},ctx.oceanMode);journey.surfaced();journey.begin({parentVessel:journey.current.ship},ctx.oceanMode);assert.deepEqual(journey.current.depthProfile,profile);assert.equal(journey.current.id,saved.id);
 const legacy={...saved,version:1};delete legacy.depthProfile;
 const retained=validateOceanVoyage(legacy);assert.deepEqual(retained,legacy);
 journey.begin({voyageResume:legacy},ctx.oceanMode);journey.begin({parentVessel:journey.current.ship},ctx.oceanMode);assert.equal(journey.current.version,1);assert.equal(Object.hasOwn(journey.current,'depthProfile'),false);
 const before=storage.getItem(OCEAN_VOYAGE_KEY);assert.equal(store.write({...saved,depthProfile:{model:'future'}}).saved,false);assert.equal(storage.getItem(OCEAN_VOYAGE_KEY),before);
});
test('deep geographic contours have a bounded interval while shallow contours retain ten metres',()=>{
 const map=range=>createSeabedMapData({sample:(x,z)=>({presentationWorldY:-(100+(x+300)/600*range),bathymetry:{truthType:'unknown'}}),metersPerWorldUnit:1});
 const deep=map(11000),shallow=map(60);assert.ok(deep.contourIntervalMeters>=450);assert.ok(deep.contours.length<10000);assert.equal(shallow.contourIntervalMeters,10);
});
