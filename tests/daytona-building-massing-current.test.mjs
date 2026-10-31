import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash}from'node:crypto';
import {DAYTONA_INFIELD_BOUNDARY,DAYTONA_BUILDING_CONTEXT_SOURCE_SHA256,prepareDaytonaBuildingMassing} from '../app/js/world/daytona-building-massing.js';
import {compileMappedVenueLayout}from'../app/js/racing/venue-layout.js';import {earthCoordinateFrame}from'../app/js/earth-core/coordinate-frame.js';import {interpretBuildingSemantics}from'../app/js/building-semantics.js';
test('infield massing is bound to the existing exact source loop and adopted source hash',async()=>{
 const bytes=await fs.readFile(new URL('../app/assets/racing/daytona/source.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),DAYTONA_BUILDING_CONTEXT_SOURCE_SHA256);
 assert.deepEqual(DAYTONA_INFIELD_BOUNDARY,compileMappedVenueLayout(JSON.parse(bytes)).points.map(p=>[p.lat,p.lon]));
 const frame=earthCoordinateFrame({lat:29.185,lon:-81.071},100000),context={worldLoadRuntimeState:{venuePack:{id:'daytona-tri-oval',sourceSha256:DAYTONA_BUILDING_CONTEXT_SOURCE_SHA256}},geoToWorld:(lat,lon)=>frame.toWorld(lat,lon)},p=[{x:-5,z:-5},{x:5,z:-5},{x:5,z:5},{x:-5,z:5}],resolve=prepareDaytonaBuildingMassing(context);
 assert.equal(resolve(p,'yes',100),4);assert.equal(resolve(p,'shed',100),3.2);assert.equal(resolve(p,'warehouse',1200),6);assert.equal(resolve(p,'office',100),null);
 const outside=p.map(p=>({x:p.x+1500,z:p.z}));assert.equal(resolve(outside,'yes',100),null);assert.equal(resolve([p[0],p[1],outside[0]],'yes',100),null,'a building crossing outside the oval retains ordinary rules');
 for(const venue of [{id:'ordinary-city',sourceSha256:DAYTONA_BUILDING_CONTEXT_SOURCE_SHA256},{id:'daytona-tri-oval',sourceSha256:'0'.repeat(64)}])assert.equal(prepareDaytonaBuildingMassing({...context,worldLoadRuntimeState:{venuePack:venue}})(p,'yes',100),null);
 context.geoToWorld=()=>{throw Error('live geographic read');};assert.equal(resolve(p,'yes',100),4,'the local preparation performs no runtime or ground reads');
});
test('normal semantics retain explicit height and levels over the venue fallback',()=>{
 for(const tags of [{building:'yes',height:'42.6'},{building:'yes','building:levels':'4'}]){const original=interpretBuildingSemantics(tags,{buildingType:'yes',fallbackHeight:14}),contextual=interpretBuildingSemantics(tags,{buildingType:'yes',fallbackHeight:4});assert.deepEqual(contextual,original);}
 const original=interpretBuildingSemantics({building:'yes'},{buildingType:'yes',fallbackHeight:14}),contextual=interpretBuildingSemantics({building:'yes'},{buildingType:'yes',fallbackHeight:4});assert.equal(original.heightSource,'fallback');assert.equal(contextual.heightMeters,4);
});

test('regional LOD retains the same adopted infield fallback and explicit heights',async()=>{
 const {resolveFarBuildingMassing}=await import('../app/js/terrain/far-building-massing.js?v=2');
 const venue={id:'daytona-tri-oval',sourceSha256:DAYTONA_BUILDING_CONTEXT_SOURCE_SHA256},ring=[[-81.0711,29.1849],[-81.0709,29.1849],[-81.0709,29.1851],[-81.0711,29.1851]],building={identity:'test',ring,widthMeters:20,depthMeters:20,centerLat:29.185,centerLon:-81.071,properties:{building:'yes'}};
 const massing=resolveFarBuildingMassing(building,null,400,1,{venuePack:venue});assert.equal(massing.heightMeters,4);assert.equal(massing.heightSource,'reviewed_venue_context_estimate');
 for(const properties of [{building:'yes',height:'42.6'},{building:'yes','building:levels':'4'},{building:'yes','building:part':'yes'}])assert.deepEqual(resolveFarBuildingMassing({...building,properties},null,400,1,{venuePack:venue}),resolveFarBuildingMassing({...building,properties},null,400,1));
 const outside={...building,ring:ring.map(([lon,lat])=>[lon-.1,lat])};assert.deepEqual(resolveFarBuildingMassing(outside,null,400,1,{venuePack:venue}),resolveFarBuildingMassing(outside,null,400,1));
});
