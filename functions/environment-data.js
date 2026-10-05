const crypto = require('node:crypto');
const {normalizeRequest,modelRequest,normalizeWeather,normalizeWaves,normalizeCurrents,normalizeNoaaWaves,combineMarine} = require('./environment-models');
const DAY=86400000;
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const USER_AGENT='WorldExplorer3D/5.4 (https://worldexplorer3d.io; environmental models)';

async function boundedText(response, limit=350000) {
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail(502,'Model response exceeds the limit.');}
  if(!response.body)throw fail(502,'Empty model response.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw fail(502,'Model response exceeds the limit.');}text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}
  finally{reader.releaseLock();}
}
function expiry(response,now,provider){
  const advertised=Date.parse(response.headers.get('expires'));
  // Honor MET's Expires; do not poll before it. Retain the representation for 304 revalidation.
  return provider==='met-norway'&&Number.isFinite(advertised)&&advertised>now?advertised:now+15*60000;
}
function retryDelay(response,now){
  const value=response.headers.get('retry-after');
  const ms=/^\d+$/.test(value||'')?Number(value)*1000:Date.parse(value)-now;
  return Math.max(60000,Number.isFinite(ms)?ms:0);
}
function createEnvironmentService({db,now=Date.now,fetchImpl=fetch,wait=sleep}={}) {
  const inFlight=new Map();
  async function read(request){
    if(!request)return null;
    const key=crypto.createHash('sha256').update(request.url).digest('hex');
    if(inFlight.has(key))return inFlight.get(key);
    const pending=readShared(request,key);inFlight.set(key,pending);
    try{return await pending;}finally{if(inFlight.get(key)===pending)inFlight.delete(key);}
  }
  async function readShared(request,key){
    const cacheRef=db.doc(`environmentDataCache/${key}`),controlRef=db.doc(`serviceControls/environment-${request.provider}`),owner=crypto.randomUUID();
    const at=now();
    const reservation=await db.runTransaction(async tx=>{
      const entry=await tx.get(cacheRef),cache=entry.data()||{};
      if(cache.expiresAtMs>at&&cache.payload!=null)return {cache};
      const control=(await tx.get(controlRef)).data()||{};
      if(cache.leaseUntilMs>at||control.cooldownUntilMs>at)throw fail(429,'Environmental model is refreshing. Try again shortly.');
      const day=Math.floor(at/DAY),count=control.day===day?Number(control.count)||0:0;
      if(count>=20000)throw fail(429,'Public model request budget reached.');
      const startAt=Math.max(at,Number(control.nextAtMs)||0);
      if(startAt-at>8000)throw fail(429,'Environmental model is busy. Try again shortly.');
      tx.set(controlRef,{...control,day,count:count+1,nextAtMs:startAt+request.intervalMs});
      tx.set(cacheRef,{...cache,owner,leaseUntilMs:at+40000,expiresAt:new Date(at+7*DAY)});
      return {previous:cache,startAt};
    });
    if(reservation.cache)return reservation.cache.payload;
    const controller=new AbortController();let timer;
    try{
      await wait(Math.max(0,reservation.startAt-now()));
      // A 429 received by another instance also cancels already queued upstream work.
      const control=await controlRef.get();
      if(Number(control.data()?.cooldownUntilMs)>now())throw fail(429,'Public model temporarily rate limited.');
      timer=setTimeout(()=>controller.abort(),request.provider==='pacioos-ww3'?8000:15000);
      const headers={Accept:request.provider==='hycom-espc'?'text/csv':request.provider==='noaa-ww3'?'application/xml':'application/json','User-Agent':USER_AGENT};
      if(reservation.previous.lastModified)headers['If-Modified-Since']=reservation.previous.lastModified;
      const response=await fetchImpl(request.url,{headers,signal:controller.signal,redirect:'follow'});
      if(response.status===429){const delay=retryDelay(response,now());await response.body?.cancel();await db.runTransaction(async tx=>{const value=(await tx.get(controlRef)).data()||{};tx.set(controlRef,{...value,cooldownUntilMs:Math.max(Number(value.cooldownUntilMs)||0,now()+delay)});});throw fail(429,'Public model temporarily rate limited.');}
      if(response.status!==304&&!response.ok){await response.body?.cancel();throw fail(502,'Public model is unavailable.');}
      const payload=response.status===304?reservation.previous.payload:await boundedText(response);
      if(payload==null)throw fail(502,'Model cache cannot be revalidated.');
      // Validate before publishing to the shared cache, including units/time/grid.
      decode(payload,request,now());
      if(controller.signal.aborted)throw fail(504,'Public model timed out.');
      await cacheRef.set({payload,lastModified:response.headers.get('last-modified')||reservation.previous.lastModified||'',
        fetchedAt:new Date(now()).toISOString(),expiresAtMs:expiry(response,now(),request.provider),expiresAt:new Date(now()+7*DAY),owner:'',leaseUntilMs:0});
      return payload;
    }catch(error){
      await db.runTransaction(async tx=>{const value=(await tx.get(cacheRef)).data()||{};if(value.owner===owner)tx.set(cacheRef,{...value,owner:'',leaseUntilMs:now()+30000});});
      throw error;
    }finally{clearTimeout(timer);}
  }
  function decode(payload,request,at){
    if(request.provider==='noaa-ww3')return normalizeNoaaWaves(payload,request,at);
    if(request.provider==='hycom-espc')return normalizeCurrents(payload,request,at);
    return request.provider==='met-norway'?normalizeWeather(JSON.parse(payload),request,at):normalizeWaves(JSON.parse(payload),request,at);
  }
  async function model(provider,location){const request=modelRequest(provider,location,now());return request?decode(await read(request),request,now()):null;}
  return async function query(input){
    const request=normalizeRequest(input);
    if(request.kind==='weather'){
      const results=await Promise.allSettled(request.locations.map(location=>model('met-norway',location)));
      if(results.every(result=>result.status==='rejected'))throw results[0].reason;
      // Preserve positional correspondence: a failed place must never inherit its neighbor's weather.
      return results.map(result=>result.status==='fulfilled'?result.value:null);
    }
    const location=request.locations[0];
    const waves=async()=>{try{const value=await model('pacioos-ww3',location);if(value)return value;}catch{}return model('noaa-ww3',location);};
    const results=await Promise.allSettled([waves(),model('hycom-espc',location)]);
    if(results.every(result=>result.status==='rejected'))throw results[0].reason;
    return combineMarine(results.map(result=>result.status==='fulfilled'?result.value:null),location,
      results.flatMap((result,i)=>result.status==='rejected'?[`${i===0?'Wave':'Current and temperature'} guidance is temporarily unavailable.`]:[]));
  };
}
function buildEnvironmentDataExport({functions,db,setCors,verifyAppCheck}){
  const query=createEnvironmentService({db});
  return functions.region('us-central1').runWith({invoker:'public',maxInstances:4,timeoutSeconds:60,memory:'256MB'}).https.onRequest(async(req,res)=>{
    if(setCors(req,res))return;
    res.set('Cache-Control','private, max-age=0, no-store');
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
    if(!await verifyAppCheck(req,res))return;
    try{res.status(200).json(await query(req.query));}
    catch(error){const status=error.name==='AbortError'?504:Number(error.statusCode)||502;if(status===429)res.set('Retry-After','60');res.status(status).json({error:status===400?'Valid model kind and coordinates are required.':'Environmental model is temporarily unavailable.'});}
  });
}
module.exports={createEnvironmentService,buildEnvironmentDataExport,boundedText};
