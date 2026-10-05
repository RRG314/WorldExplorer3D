const test=require('node:test'),assert=require('node:assert/strict');
const {queryAircraft,normalizeAdsbLolState}=require('../functions/geospatial');

test('aircraft queries use only the public ODbL endpoint and reuse cached observations',async()=>{
 let calls=0;const now=Date.now(),query={lat:39.2904,lon:-76.6122,radiusKm:20,limit:2};
 const fetchImpl=async url=>{calls++;assert.equal(new URL(url).host,'api.adsb.lol');return new Response(JSON.stringify({now,ac:[{hex:'abcdef',lat:39.3,lon:-76.6,seen_pos:2,alt_geom:10000,gs:180,track:45,geom_rate:600}]}));};
 const result=await queryAircraft(query,{force:true,fetchImpl});assert.equal(result.provider,'adsb-lol');assert.deepEqual(result.warnings,[]);assert.equal(result.items.length,1);
 assert.equal(result.items[0].altitudeM,3048);assert.equal(result.items[0].verticalRateMps,3.048);assert.equal(result.items[0].observedAt,new Date(now-2000).toISOString());
 assert.equal((await queryAircraft(query,{fetchImpl})).cache,'memory');assert.equal(calls,1);
});
test('absent aircraft fields stay unknown and missing coordinates do not become Null Island',()=>{
 const query={lat:1,lon:2},now=Date.now();
 assert.equal(normalizeAdsbLolState({hex:'abcdef',lat:null,lon:null},query,now),null);
 const row=normalizeAdsbLolState({hex:'abcdef',lat:0,lon:0,alt_geom:null,alt_baro:null,gs:null,track:null,geom_rate:null,baro_rate:null},query,now);
 for(const key of['altitudeM','velocityKt','headingDeg','verticalRateMps'])assert.equal(row[key],null);
 assert.equal(row.observedAt,'');assert.ok(row.distanceKm>200);
 assert.equal(normalizeAdsbLolState({hex:'abcdef',lat:1,lon:2,seen_pos:1e30},query,now),null);
});
test('invalid aircraft queries are rejected before upstream access',async()=>{
 for(const lat of [null,undefined,'',true,91,-91])await assert.rejects(queryAircraft({lat,lon:2},{force:true,fetchImpl:()=>assert.fail('Invalid coordinates reached upstream')}),error=>error.statusCode===400);
 for(const lon of [null,'',181,-181])await assert.rejects(queryAircraft({lat:1,lon},{force:true,fetchImpl:()=>assert.fail('Invalid coordinates reached upstream')}),error=>error.statusCode===400);
});
test('malformed or stale aircraft responses reject instead of publishing empty live success',async()=>{
 for(const payload of[{now:Date.now(),states:[]},{now:Date.now()-3600000,ac:[]}])await assert.rejects(queryAircraft({lat:30,lon:20},{force:true,fetchImpl:async()=>new Response(JSON.stringify(payload))}),/malformed or stale/);
 const {createAircraftService}=await import('../app/js/geospatial/aircraft.js');
 const service=createAircraftService({fetchImpl:async()=>new Response(JSON.stringify({provider:'adsb-lol',fetchedAt:new Date().toISOString(),items:[{id:'plane',lat:1,lon:2,headingDeg:null}]}))});
 const response=await service.search({lat:1,lon:2});assert.equal(response.items[0].provenance.sourceId,'adsb-lol');assert.equal(response.items[0].headingDeg,null);
 const wrong=createAircraftService({fetchImpl:async()=>new Response(JSON.stringify({provider:'unconfigured-license-provider',items:[]}))});await assert.rejects(wrong.search({lat:1,lon:2}),/source is unavailable/);
});
test('aircraft details do not invent speed, northward heading or a recent observation time',async()=>{
 const {renderLiveEarthDetails}=await import('../app/js/live-earth/controller-ui.js');let html='';
 const selected={id:'plane',label:'Unreported',speedKt:null,headingDeg:null,lat:1,lon:2,routeLabel:'ADSB.lol observation',dataSource:'adsb-lol'};
 renderLiveEarthDetails({escapeHtml:String,selectorSelection:()=>null,selectedAircraft:()=>selected,setDetailsHtml:(_state,value)=>{html=value;}},{selector:{ui:{details:{}}},activeLayerId:'aircraft',aircraftItems:[selected],aircraftRoutes:[],aircraftSourceMode:'observed'});
 assert.match(html,/Speed unavailable/);assert.match(html,/Heading unavailable/);assert.match(html,/observation time unavailable/);assert.doesNotMatch(html,/null kt|heading 0°|observed recently/);
});
