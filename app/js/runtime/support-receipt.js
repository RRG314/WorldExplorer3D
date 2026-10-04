// Explicit allowlists are the boundary. Never serialize the shared context,
// request, error object/stack, provider response, URL, account or capture data.
const operations=new Set(['runtime','provider-query','journal-save','inventory-save','condition-save','world-load','environment-transition','asset-load']);
const categories=new Set(['cancelled','timeout','rate-limited','permission','unavailable','response-limit','storage-full','storage-unavailable','request-failed','runtime-error','complete']);
const environments=new Set(['EARTH','SPACE_FLIGHT','MOON','MARS','PLANETARY','OCEAN']);
const modes=new Set(['walk','walking','driving','car','boat','plane','drone','space','submarine','diver','interior','title']);
const providers=new Map([
 ['open-meteo-current','weather-model'],['open-meteo-marine','marine-model'],
 ['noaa-water-level-stations','noaa-stations'],['noaa-water-level','noaa-observation'],['noaa-tide-predictions','noaa-prediction'],
 ['celestrak-gp','orbit-elements'],['usgs-earthquakes-day','earthquakes'],['opensky','aircraft'],
 ['panoramax','street-imagery'],['kartaview','street-imagery'],['geology-point','mapped-geology']
]);
const count=value=>Number.isFinite(value)&&value>=0?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value)):0;
export function supportFailureCategory(error) {
 if(error?.status===429)return 'rate-limited';
 if(error?.status===401||error?.status===403)return 'permission';
 if(error?.name==='QuotaExceededError')return 'storage-full';
 if(error?.name==='SecurityError'||error?.name==='InvalidStateError')return 'storage-unavailable';
 if(error?.name==='AbortError')return 'cancelled';
 if(error?.status>=500||error instanceof TypeError)return 'unavailable';
 return 'runtime-error';
}
function scope(source={}) {
 const build=String(source.buildId||'');
 return {
  buildId:/^\d+\.\d+\.\d+\+[a-f0-9]{7,40}\.[a-f0-9]{16,64}\.(?:staging|production)$/.test(build)?build:'source-preview-or-unavailable',
  sessionGeneration:count(source.sessionGeneration),worldGeneration:count(source.worldGeneration),
  environment:environments.has(source.environment)?source.environment:'unavailable',
  mode:modes.has(source.mode)?source.mode:'unavailable',
  transition:source.transition?{generation:count(source.transition.generation),from:environments.has(source.transition.from)?source.transition.from:'unavailable',to:environments.has(source.transition.to)?source.transition.to:'unavailable',phase:['requested','committed','completed','cancelled','failed'].includes(source.transition.phase)?source.transition.phase:'unavailable'}:null
 };
}
export function createSupportRecorder({now=()=>globalThis.performance?.now?.()??Date.now()}={}) {
 const started=now(),events=[];let getContext=()=>({}),sequence=0;
 const context=()=>{try{return scope(getContext());}catch{return scope();}};
 return Object.freeze({
  bindContext(read){if(typeof read==='function')getContext=read;},
  record({operation,provider,category,error}={}) {
   const item={sequence:++sequence,elapsedMs:count(now()-started),operation:operations.has(operation)?operation:'runtime',category:categories.has(category)?category:supportFailureCategory(error),provider:providers.get(provider)||null,...context()};
   events.push(item);if(events.length>32)events.shift();
  },
  snapshot(){return {schemaVersion:1,type:'WorldExplorerSupportReceipt',privacy:'allowlisted-categories-only',...context(),eventCount:sequence,events:events.map(item=>({...item,transition:item.transition?{...item.transition}:null}))};}
 });
}
export const supportRecorder=createSupportRecorder();
