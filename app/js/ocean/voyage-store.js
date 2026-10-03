import {MARITIME_CATALOG} from '../transport/maritime-catalog.js?v=1';
// Device-local traversal state. This never owns inventory, rewards or cloud vessels.
export const OCEAN_VOYAGE_KEY='we3d.ocean.voyage.v1';
const text=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max;
const point=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
const pose=p=>p&&['x','y','z','yaw'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<1e6);
export function validateOceanVoyage(v){
 if(v?.version!==1||!text(v.id)||!text(v.subId)||!['underwater','aboard'].includes(v.stage)||!point(v.site)||!point(v.ship?.anchor)
  ||!text(v.ship?.transportEntityId)||!MARITIME_CATALOG.some(c=>c.id===v.ship?.transportCatalogId)||!Number.isFinite(v.ship.condition)||v.ship.condition<0||v.ship.condition>1
  ||Math.abs(v.site.lat-v.ship.anchor.lat)>1e-8||Math.abs(v.site.lon-v.ship.anchor.lon)>1e-8||!Number.isFinite(v.ship.yaw)||!pose(v.sub)||!Number.isFinite(v.sub.condition)||v.sub.condition<0||v.sub.condition>1
  ||!Number.isFinite(v.waveOffset?.x)||!Number.isFinite(v.waveOffset?.z)||!Number.isSafeInteger(v.revision)||v.revision<0||!Number.isFinite(v.savedAt))return null;
 // Bounded, allowlisted data: never serialize runtime objects or backpack contents.
 return {version:1,id:v.id,subId:v.subId,stage:v.stage,revision:v.revision,savedAt:v.savedAt,
  site:{lat:v.site.lat,lon:v.site.lon,name:String(v.site.name||'Saved ocean site').slice(0,120),region:String(v.site.region||'Ocean').slice(0,120)},
  ship:{transportEntityId:v.ship.transportEntityId,transportCatalogId:v.ship.transportCatalogId,condition:v.ship.condition,yaw:v.ship.yaw,anchor:{lat:v.ship.anchor.lat,lon:v.ship.anchor.lon}},
  sub:{x:v.sub.x,y:v.sub.y,z:v.sub.z,yaw:v.sub.yaw,condition:v.sub.condition},waveOffset:{x:v.waveOffset.x,z:v.waveOffset.z}};
}
export function createOceanVoyageStore({storage,now=()=>Date.now()}={}){
 const target=()=>storage||globalThis.localStorage;
 let expectedRaw;
 return {
  read(){try{const raw=target()?.getItem(OCEAN_VOYAGE_KEY)||null;expectedRaw=raw;if(!raw||raw.length>8192)return null;return validateOceanVoyage(JSON.parse(raw));}catch{return null;}},
  write(value){try{
   const s=target();if(!s)return {saved:false,reason:'unavailable'};
   const current=s.getItem(OCEAN_VOYAGE_KEY)||null;
   if(expectedRaw===undefined)expectedRaw=current;
   if(current!==expectedRaw)return {saved:false,reason:'conflict'};
   if(current&&(current.length>8192||!validateOceanVoyage(JSON.parse(current))))return {saved:false,reason:'invalid-existing'};
   const next=validateOceanVoyage({...value,revision:(value.revision||0)+1,savedAt:now()});
   if(!next)return {saved:false,reason:'invalid'};
   const raw=JSON.stringify(next);s.setItem(OCEAN_VOYAGE_KEY,raw);expectedRaw=raw;
   return {saved:true,value:next};
  }catch{return {saved:false,reason:'unavailable'};}}
 };
}
