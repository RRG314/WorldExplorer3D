import {normalizeOceanWaterContext} from './water-context.js';
import {OCEAN_DEPTH_MODEL,normalizeOceanDepthProfile} from './depth-model.js';
import {MARITIME_CATALOG} from '../transport/maritime-catalog.js?v=1';
// Device-local traversal state. This never owns inventory, rewards or cloud vessels.
export const OCEAN_VOYAGE_KEY='we3d.ocean.voyage.v1';
export const OCEAN_NATIVE_VOYAGE_KEY='we3d.ocean.voyage.v2';
export const OCEAN_STREAM_VOYAGE_KEY='we3d.ocean.voyage.v3';
export const OCEAN_STREAM_PREFERENCE_KEY='we3d.ocean.continuous.v1';
export function oceanStreamingPreference(){try{return globalThis.localStorage?.getItem(OCEAN_STREAM_PREFERENCE_KEY)!=='off';}catch{return true;}}
const text=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max;
const point=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
const wave=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<1e12&&Math.abs(p.z)<1e12;
const pose=p=>p&&['x','y','z','yaw'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<1e6);
export function validateOceanVoyage(v){
 if((v?.waterContext!==undefined&&!normalizeOceanWaterContext(v.waterContext))||![1,2,3].includes(v?.version)||(v.version>=2&&!normalizeOceanDepthProfile(v.depthProfile))||(v.version===3&&(!wave(v.frameWaveOffset)||!point(v.frameOrigin)||v.depthProfile?.model!==OCEAN_DEPTH_MODEL.GEOGRAPHIC||Math.hypot(v.sub?.x,v.sub?.z)>5000))||!text(v.id)||!text(v.subId)||!['underwater','aboard'].includes(v.stage)||!point(v.site)||!point(v.ship?.anchor)
  ||!text(v.ship?.transportEntityId)||!MARITIME_CATALOG.some(c=>c.id===v.ship?.transportCatalogId)||!Number.isFinite(v.ship.condition)||v.ship.condition<0||v.ship.condition>1
  ||Math.abs(v.site.lat-v.ship.anchor.lat)>1e-8||Math.abs(v.site.lon-v.ship.anchor.lon)>1e-8||!Number.isFinite(v.ship.yaw)||!pose(v.sub)||!Number.isFinite(v.sub.condition)||v.sub.condition<0||v.sub.condition>1
  ||!Number.isFinite(v.waveOffset?.x)||!Number.isFinite(v.waveOffset?.z)||!Number.isSafeInteger(v.revision)||v.revision<0||!Number.isFinite(v.savedAt))return null;
 // Bounded, allowlisted data: never serialize runtime objects or backpack contents.
 return {version:v.version,...(v.waterContext?{waterContext:normalizeOceanWaterContext(v.waterContext)}:{}),...(v.version===3?{frameOrigin:{lat:v.frameOrigin.lat,lon:v.frameOrigin.lon},frameWaveOffset:{x:v.frameWaveOffset.x,z:v.frameWaveOffset.z}}:{}),...(v.version>=2?{depthProfile:normalizeOceanDepthProfile(v.depthProfile)}:{}),id:v.id,subId:v.subId,stage:v.stage,revision:v.revision,savedAt:v.savedAt,
  site:{lat:v.site.lat,lon:v.site.lon,name:String(v.site.name||'Saved ocean site').slice(0,120),region:String(v.site.region||'Ocean').slice(0,120)},
  ship:{transportEntityId:v.ship.transportEntityId,transportCatalogId:v.ship.transportCatalogId,condition:v.ship.condition,yaw:v.ship.yaw,anchor:{lat:v.ship.anchor.lat,lon:v.ship.anchor.lon}},
  sub:{x:v.sub.x,y:v.sub.y,z:v.sub.z,yaw:v.sub.yaw,condition:v.sub.condition},waveOffset:{x:v.waveOffset.x,z:v.waveOffset.z}};
}
export function createOceanVoyageStore({storage,now=()=>Date.now()}={}){
 const target=()=>storage||globalThis.localStorage;
 const expected=new Map();
 const keys=[OCEAN_VOYAGE_KEY,OCEAN_NATIVE_VOYAGE_KEY,OCEAN_STREAM_VOYAGE_KEY];
 const decode=raw=>{try{return raw&&raw.length<=8192?validateOceanVoyage(JSON.parse(raw)):null;}catch{return null;}};
 return {
  read(){try{const records=keys.map(key=>{const raw=target()?.getItem(key)||null;expected.set(key,raw);return decode(raw);}).filter(Boolean);return records.sort((a,b)=>b.savedAt-a.savedAt||b.version-a.version)[0]||null;}catch{return null;}},
  write(value){try{
   const s=target();if(!s)return {saved:false,reason:'unavailable'};
   const key=value?.version===3?OCEAN_STREAM_VOYAGE_KEY:value?.version===2?OCEAN_NATIVE_VOYAGE_KEY:OCEAN_VOYAGE_KEY;
   const current=s.getItem(key)||null;
   for(const savedKey of keys)if(!expected.has(savedKey))expected.set(savedKey,s.getItem(savedKey)||null);
   // A different tab must not win merely by switching the save version.
   for(const [other,raw] of expected)if((s.getItem(other)||null)!==raw)return {saved:false,reason:'conflict'};
   // Preserve unreadable saves, including older previews that put v2 in v1.
   // Valid v2 records there remain readable, but all new v2 writes use v2.
   for(const savedKey of keys){const raw=s.getItem(savedKey);if(raw&&!decode(raw))return {saved:false,reason:'invalid-existing'};}
   const next=validateOceanVoyage({...value,revision:(value.revision||0)+1,savedAt:now()});
   if(!next)return {saved:false,reason:'invalid'};
   const raw=JSON.stringify(next);s.setItem(key,raw);expected.set(key,raw);
   return {saved:true,value:next};
  }catch{return {saved:false,reason:'unavailable'};}}
 };
}
