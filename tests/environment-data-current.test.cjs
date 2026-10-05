const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeRequest,modelRequest,normalizeWeather,normalizeWaves,normalizeCurrents,wmoCode}=require('../functions/environment-models');
const {createEnvironmentService,buildEnvironmentDataExport,boundedText}=require('../functions/environment-data');
const at=Date.parse('2026-10-05T20:30:00Z'),time='2026-10-05T20:00:00Z',point={lat:-18.5,lon:147.5};
const weather=(temp=21)=>({properties:{meta:{updated_at:time},timeseries:[{time,data:{instant:{details:{air_temperature:temp,wind_speed:5,wind_from_direction:312,relative_humidity:40,cloud_area_fraction:10}},next_1_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}}}]}});
const waves=()=>({table:{columnNames:['time','depth','latitude','longitude','Thgt','Tdir','Tper','whgt','shgt','sdir','sper'],columnUnits:['UTC','m','degrees_north','degrees_east','meters','degrees','second','meters','meters','degrees','seconds'],rows:[[time,0,-18.5,147.5,1.2,98,9,1,.5,79,8]]}});
const csv=(lat=-18.48,lon=147.52,u=.008,v=.075,temp=24.19)=>`time,latitude[unit="degrees_north"],longitude[unit="degrees_east"],ssu[unit="m/s"],ssv[unit="m/s"],sst[unit="degC"]\n${time},${lat},${lon},${u},${v},${temp}\n`;
function database(){
 const docs=new Map();let tail=Promise.resolve();const copy=value=>value===undefined?undefined:structuredClone(value);
 const db={doc:path=>({path,set:async value=>docs.set(path,copy(value)),get:async()=>({data:()=>copy(docs.get(path))})}),runTransaction:fn=>{const run=tail.then(async()=>{const writes=[];const result=await fn({get:async ref=>({exists:docs.has(ref.path),data:()=>copy(docs.get(ref.path))}),set:(ref,value)=>writes.push([ref.path,copy(value)])});for(const [key,value]of writes)docs.set(key,value);return result;});tail=run.catch(()=>{});return run;}};
 return {db,docs};
}
test('public request rejects invalid/mismatched/oversized coordinates and cannot select an upstream URL',()=>{
 for(const input of [{kind:'unknown',latitude:1,longitude:2},{kind:'weather',latitude:'',longitude:0},{kind:'weather',latitude:'1,2',longitude:2},{kind:'marine',latitude:'1,2',longitude:'3,4'},{kind:'weather',latitude:91,longitude:0},{kind:'weather',latitude:Array(17).fill(1).join(','),longitude:Array(17).fill(2).join(',')}])assert.throws(()=>normalizeRequest(input),e=>e.statusCode===400);
 const request=normalizeRequest({kind:'weather',latitude:39.2904,longitude:-76.6122,url:'http://localhost'});const model=modelRequest('met-norway',request.locations[0],at);assert.equal(new URL(model.url).host,'api.met.no');assert.equal(model.lat,39.29);
 assert.equal(modelRequest('pacioos-ww3',{lat:80,lon:0},at),null);assert.equal(modelRequest('hycom-espc',{lat:-85,lon:0},at),null);
 const dateline=modelRequest('pacioos-ww3',{lat:0,lon:-179.9},at);assert.equal(dateline.lon,-180);assert.ok(dateline.url.includes(`(${time})`));
});
test('weather uses the current forecast, converts m/s, and leaves absent measurements unknown',()=>{
 const request=modelRequest('met-norway',point,at),result=normalizeWeather(weather(),request,at);
 assert.equal(result.current.wind_speed_10m,18);assert.equal(result.current.temperature_2m,21);assert.equal(result.current.precipitation,0);
 for(const key of ['apparent_temperature','visibility','snowfall','showers','rain'])assert.equal(result.current[key],null);
 assert.equal(wmoCode('heavysleet_day'),69);assert.equal(wmoCode('rainandthunder_night'),95);assert.equal(wmoCode('new-unrecognized-symbol'),null);
 const raw=weather();raw.properties.timeseries[0].time='2026-10-04T00:00:00Z';assert.throws(()=>normalizeWeather(raw,request,at),/current forecast/);
 raw.properties.timeseries[0].time='2026-10-06T00:00:00Z';assert.throws(()=>normalizeWeather(raw,request,at),/current forecast/);
});
test('independent marine grids preserve wave from-direction and current toward-bearing, units and missing cells',()=>{
 const waveRequest=modelRequest('pacioos-ww3',point,at),currentRequest=modelRequest('hycom-espc',point,at);
 const wave=normalizeWaves(waves(),waveRequest,at);assert.equal(wave.fields.wave_direction,98);assert.equal(wave.validAt,time.replace('Z','.000Z'));
 const current=normalizeCurrents(csv(),currentRequest,at);assert.ok(Math.abs(current.fields.ocean_current_velocity-Math.hypot(.008,.075)*3.6)<1e-8);assert.ok(current.fields.ocean_current_direction>6&&current.fields.ocean_current_direction<7);
 assert.equal(normalizeCurrents(csv(-18.48,147.52,0,0),currentRequest,at).fields.ocean_current_direction,null);
 const missing=normalizeCurrents(csv(-18.48,147.52,'NaN','NaN','NaN'),currentRequest,at);assert.equal(missing.fields.ocean_current_velocity,null);assert.equal(missing.fields.sea_surface_temperature,null);
 assert.throws(()=>normalizeCurrents(csv().replace('m/s','knots'),currentRequest,at),/units/);
 const changed=waves();changed.table.columnUnits[4]='feet';assert.throws(()=>normalizeWaves(changed,waveRequest,at),/units/);
 changed.table.columnUnits[4]='meters';changed.table.rows[0][0]='2026-10-11T18:00:00Z';assert.throws(()=>normalizeWaves(changed,waveRequest,at),/current window/);
});
test('shared cache honors MET expiry and uses exact Last-Modified on conditional refresh',async()=>{
 const {db}=database();let clock=at,calls=0;const modified='Mon, 05 Oct 2026 19:19:25 GMT';
 const service=createEnvironmentService({db,now:()=>clock,wait:async()=>{},fetchImpl:async(url,opts)=>{calls++;assert.match(opts.headers['User-Agent'],/WorldExplorer3D.*worldexplorer3d.io/);if(calls===1)return new Response(JSON.stringify(weather()),{headers:{Expires:new Date(at+600000).toUTCString(),'Last-Modified':modified}});assert.equal(opts.headers['If-Modified-Since'],modified);return new Response(null,{status:304,headers:{Expires:new Date(clock+600000).toUTCString()}});}});
 const q={kind:'weather',latitude:39.29,longitude:-76.61};await service(q);clock+=599999;await service(q);assert.equal(calls,1);clock+=2;assert.equal((await service(q))[0].current.temperature_2m,21);assert.equal(calls,2);await service(q);assert.equal(calls,2);
});
test('two instances share a pending-point lease; successful points coalesce and cross-instance reads reuse cache',async()=>{
 const {db}=database();let calls=0,resolve;const config={db,now:()=>at,wait:async()=>{},fetchImpl:async()=>{calls++;return new Promise(r=>resolve=()=>r(new Response(JSON.stringify(weather()))));}};
 const one=createEnvironmentService(config),two=createEnvironmentService(config),q={kind:'weather',latitude:1,longitude:2};const a=one(q),b=one(q);while(!resolve)await new Promise(r=>setImmediate(r));await assert.rejects(two(q),e=>e.statusCode===429);resolve();assert.deepEqual(await a,await b);await two(q);assert.equal(calls,1);
});
test('provider 429 cools down other coordinates and overlarge/invalid responses never become cached empty weather',async()=>{
 const {db}=database();let calls=0;const service=createEnvironmentService({db,now:()=>at,wait:async()=>{},fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}});}});
 await assert.rejects(service({kind:'weather',latitude:1,longitude:2}),e=>e.statusCode===429);await assert.rejects(service({kind:'weather',latitude:3,longitude:4}),e=>e.statusCode===429);assert.equal(calls,1);
 let canceled=false;await assert.rejects(boundedText(new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(200000));},cancel(){canceled=true;}}))),/exceeds/);assert.equal(canceled,true);
});
test('partial batches retain order and partial marine failures retain the successful source provenance',async()=>{
 const {db}=database();const service=createEnvironmentService({db,now:()=>at,wait:async()=>{},fetchImpl:async url=>{if(url.includes('lat=1.00'))throw Error('offline');if(url.includes('api.met.no'))return new Response(JSON.stringify(weather(10)));if(url.includes('pacioos'))return new Response(JSON.stringify(waves()));throw Error('offline');}});
 const result=await service({kind:'weather',latitude:'1,2',longitude:'3,4'});assert.equal(result[0],null);assert.equal(result[1].current.temperature_2m,10);
 const marine=await service({kind:'marine',latitude:-18.5,longitude:147.5});assert.equal(marine.current.wave_height,1.2);assert.equal(marine.current.ocean_current_velocity,undefined);assert.equal(marine.sources[0].sourceId,'pacioos-ww3');assert.equal(marine.warnings.length,1);
});
test('HTTP handler authenticates before reads; non-GET requests cannot consume upstream budget',async()=>{
 let reads=0;const functions={region:()=>({runWith:()=>({https:{onRequest:fn=>fn}})})},res={set(){},status(code){this.code=code;return this},json(value){this.value=value;return this}};
 const handler=buildEnvironmentDataExport({functions,db:{doc:()=>{reads++;}},setCors:()=>false,verifyAppCheck:async(req,res)=>{res.status(401).json({error:'Unauthenticated'});return false;}});
 await handler({method:'GET',query:{kind:'weather',latitude:1,longitude:2}},res);assert.equal(res.code,401);assert.equal(reads,0);await handler({method:'POST'},res);assert.equal(res.code,405);assert.equal(reads,0);
});

test('a wave provider outage uses the public NOAA model with its own time and no invented swell',async()=>{
 const {db}=database();const calls=[];
 const noaa=`<stationFeatureCollection><stationFeature date="2026-10-05T21:00:00Z"><station latitude="-18.500" longitude="147.500"/><data name="Significant_height_of_combined_wind_waves_and_swell_surface" units="m">1.09</data><data name="Primary_wave_direction_surface" units="degree_true">81.21</data><data name="Primary_wave_mean_period_surface" units="s">8.9</data><data name="Significant_height_of_wind_waves_surface" units="m">1.09</data></stationFeature></stationFeatureCollection>`;
 const service=createEnvironmentService({db,now:()=>at,wait:async()=>{},fetchImpl:async url=>{calls.push(new URL(url).host);return url.includes('pacioos')?new Response('unknown dataset',{status:404}):url.includes('unidata')?new Response(noaa):new Response(csv());}});
 const result=await service({kind:'marine',latitude:-18.5,longitude:147.5});assert.deepEqual(calls.sort(),['ncss.hycom.org','pae-paha.pacioos.hawaii.edu','tds.scigw.unidata.ucar.edu'].sort());
 assert.equal(result.sources[0].sourceId,'noaa-ww3');assert.equal(result.sources[0].validAt,'2026-10-05T21:00:00.000Z');assert.equal(result.sources[1].validAt,'2026-10-05T20:00:00.000Z');assert.equal(result.current.wave_height,1.09);assert.equal(result.current.swell_wave_height,undefined);assert.equal(result.warnings.length,0);
 const {normalizeNoaaWaves}=require('../functions/environment-models');assert.throws(()=>normalizeNoaaWaves(noaa.replace('units="m"','units="ft"'),modelRequest('noaa-ww3',point,at),at),/units/);
});
