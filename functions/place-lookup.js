const crypto=require('node:crypto');
const DAY=86400000,MAX_DAILY=5000;
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
function normalizeLookup(input={}){
 const kind=input.kind==='reverse'?'reverse':'search',language=String(input.language||input['accept-language']||'en').slice(0,12).replace(/[^a-zA-Z-]/g,'')||'en';
 if(kind==='search'){const q=String(input.q||'').trim().replace(/\s+/g,' ').slice(0,120);if(q.length<2)throw fail(400,'Enter at least two characters or coordinates.');return {kind,q,language};}
 const lat=Number(input.lat),lon=Number(input.lon);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw fail(400,'Valid coordinates are required.');return {kind,lat:Number(lat.toFixed(4)),lon:Number(lon.toFixed(4)),language};
}
function lookupUrl(query,base='https://nominatim.openstreetmap.org/'){
 const root=new URL(base);if(root.protocol!=='https:'||root.username||root.password||root.search||root.hash)throw fail(503,'Place lookup configuration is unavailable.');
 const url=new URL(query.kind,root.href.endsWith('/')?root.href:root.href+'/');
 url.searchParams.set('format','jsonv2');url.searchParams.set('addressdetails','1');url.searchParams.set('accept-language',query.language);
 if(query.kind==='search'){url.searchParams.set('q',query.q);url.searchParams.set('limit','8');url.searchParams.set('namedetails','1');url.searchParams.set('extratags','1');}
 else{url.searchParams.set('lat',query.lat);url.searchParams.set('lon',query.lon);url.searchParams.set('zoom','10');}
 return url.href;
}
async function boundedJson(response){
 if(!response.ok)throw fail(502,'Place source is unavailable. Try coordinates or a saved place.');
 if(Number(response.headers.get('content-length'))>2000000){await response.body?.cancel();throw fail(502,'Place response exceeds the limit.');}
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000){await reader.cancel();throw fail(502,'Place response exceeds the limit.');}text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{reader.releaseLock();}
}
function cleanResult(value){
 if(!value||typeof value!=='object')return null;const lat=Number(value.lat),lon=Number(value.lon);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return null;
 const result={lat:String(lat),lon:String(lon)};
 for(const key of ['osm_type','osm_id','name','display_name','category','class','type','addresstype'])if(value[key]!=null)result[key]=String(value[key]).slice(0,key==='display_name'?500:160);
 for(const key of ['address','namedetails','extratags']){result[key]={};for(const [k,v] of Object.entries(value[key]||{}).slice(0,40))if(typeof v==='string'||typeof v==='number')result[key][String(k).slice(0,60)]=String(v).slice(0,240);}
 if(Array.isArray(value.boundingbox)&&value.boundingbox.length===4&&value.boundingbox.every(v=>Number.isFinite(Number(v))))result.boundingbox=value.boundingbox.map(String);
 return result;
}
function createPlaceLookupService({db,now=Date.now,fetchImpl=fetch,baseUrl=()=>process.env.PLACE_LOOKUP_BASE_URL||'https://nominatim.openstreetmap.org/'}={}){
 const controlRef=db.doc('serviceControls/placeLookup');
 return async function query(input={}){
  const request=normalizeLookup(input),url=lookupUrl(request,baseUrl()),key=crypto.createHash('sha256').update(url).digest('hex'),cacheRef=db.doc(`placeLookupCache/${key}`),owner=crypto.randomUUID(),at=now();
  // One application-wide lease, including all instances and both lookup kinds.
  const cached=await db.runTransaction(async tx=>{
   const entry=await tx.get(cacheRef);if(entry.exists&&entry.data().expiresAtMs>at)return entry.data();
   const control=await tx.get(controlRef),value=control.data()||{};
   if(Number(value.nextAtMs)>at)throw fail(429,'Place search is busy. Retry in a moment or enter coordinates.');
   const day=Math.floor(at/DAY),count=value.day===day?Number(value.count)||0:0;if(count>=MAX_DAILY)throw fail(429,'Place lookup daily budget reached. Use saved places or coordinates.');
   tx.set(controlRef,{owner,nextAtMs:at+15000,day,count:count+1});return null;
  });
  if(cached)return {payload:cached.payload,fetchedAt:cached.fetchedAt,cache:'shared',source:'OpenStreetMap / Nominatim-compatible geocoder'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let succeeded=false;
  try{
   const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json','User-Agent':'WorldExplorer3D/5.4 (https://worldexplorer3d.io; place lookup)'}});
   const data=await boundedJson(response);if(controller.signal.aborted)throw fail(504,'Place lookup timed out.');
   if(request.kind==='search'&&!Array.isArray(data)||request.kind==='reverse'&&(!data||Array.isArray(data)||data.error))throw fail(502,'Place source returned an unavailable result.');
   const payload=request.kind==='search'?data.slice(0,8).map(cleanResult).filter(Boolean):cleanResult(data)||{},fetchedAt=new Date(now()).toISOString();
   await cacheRef.set({payload,fetchedAt,expiresAtMs:now()+7*DAY,expiresAt:new Date(now()+7*DAY)});succeeded=true;return {payload,fetchedAt,cache:'upstream',source:'OpenStreetMap / Nominatim-compatible geocoder'};
  }finally{
   clearTimeout(timer);
   await db.runTransaction(async tx=>{const snapshot=await tx.get(controlRef);if(snapshot.data()?.owner===owner)tx.update(controlRef,{nextAtMs:now()+(succeeded?1100:10000),owner:''});});
  }
 };
}
function buildPlaceLookupExport({functions,db,setCors,verifyAppCheck}){
 const query=createPlaceLookupService({db});
 return functions.region('us-central1').runWith({invoker:'public',maxInstances:4,timeoutSeconds:20}).https.onRequest(async(req,res)=>{
  if(setCors(req,res))return;if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});if(!await verifyAppCheck(req,res))return;
  try{const result=await query(req.query);res.set('Cache-Control','private, max-age=0, no-store');res.status(200).json(result.payload);}
  catch(error){const status=error.name==='AbortError'?504:Number(error.statusCode)||502;if(status===429)res.set('Retry-After','2');res.status(status).json({error:status===429?error.message:'Place lookup unavailable. Try saved places or coordinates.'});}
 });
}
module.exports={normalizeLookup,lookupUrl,cleanResult,createPlaceLookupService,buildPlaceLookupExport};
