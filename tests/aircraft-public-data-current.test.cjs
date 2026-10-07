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

test('IPv4 aircraft deadline includes connection setup and a trickling body', async t => {
 const https=require('node:https'),{EventEmitter}=require('node:events');
 t.mock.timers.enable({apis:['setTimeout']});
 for(const bodyStarted of [false,true]) {
  const request=new EventEmitter();let receive;
  request.destroy=error=>{request.destroyed=true;request.emit('error',error);};
  const mock=t.mock.method(https,'get',(_url,_options,callback)=>{receive=callback;return request;});
  const pending=queryAircraft({lat:39,lon:-76},{force:true});
  const rejection=assert.rejects(pending,{name:'AbortError'});
  if(bodyStarted) {
   const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};
   receive(response);response.emit('data','{');
   t.mock.timers.tick(8000);response.emit('data','"ac":');
   t.mock.timers.tick(999);
  } else t.mock.timers.tick(8999);
  assert.notEqual(request.destroyed,true);
  t.mock.timers.tick(1);await rejection;assert.equal(request.destroyed,true);mock.mock.restore();
 }
});

test('completed IPv4 aircraft responses clear the deadline and interrupted bodies reject', async t => {
 const https=require('node:https'),{EventEmitter}=require('node:events');
 t.mock.timers.enable({apis:['setTimeout']});
 for(const interrupted of [false,true]) {
  const request=new EventEmitter();let receive;
  request.destroy=error=>{request.destroyed=true;request.emit('error',error);};
  const mock=t.mock.method(https,'get',(_url,_options,callback)=>{receive=callback;return request;});
  const pending=queryAircraft({lat:38,lon:-76},{force:true});
  const settled=interrupted?assert.rejects(pending,/interrupted/):pending;
  const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};receive(response);
  if(interrupted)response.emit('aborted');
  else {response.emit('data',JSON.stringify({now:Date.now(),ac:[]}));response.emit('end');}
  const result=await settled;if(!interrupted)assert.equal(result.provider,'adsb-lol');
  t.mock.timers.tick(9000);assert.notEqual(request.destroyed,true);mock.mock.restore();
 }
});

test('aircraft client accepts a valid gateway response after ten seconds but still cancels a stalled request', async t => {
 const {createAircraftService}=await import('../app/js/geospatial/aircraft.js');
 t.mock.timers.enable({apis:['setTimeout']});
 let signal,reply;
 const service=createAircraftService({fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(resolve=>{reply=resolve;});}});
 const pending=service.search({lat:39,lon:-76});await Promise.resolve();
 t.mock.timers.tick(14000);assert.equal(signal.aborted,false);
 reply(new Response(JSON.stringify({provider:'adsb-lol',fetchedAt:new Date().toISOString(),items:[]})));
 assert.equal((await pending).providerId,'adsb-lol');
 const stalled=service.search({lat:38,lon:-76});await Promise.resolve();
 const rejected=assert.rejects(stalled,{name:'AbortError'});
 t.mock.timers.tick(19999);assert.equal(signal.aborted,false);
 t.mock.timers.tick(1);await rejected;assert.equal(signal.aborted,true);
});
