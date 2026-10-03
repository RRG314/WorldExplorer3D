// Only Caltrans-owned current stills from the explicitly reviewed districts.
export const CALTRANS_PROVIDER=Object.freeze({id:'caltrans',name:'Caltrans',country:'California, USA',homepage:'https://cwwp2.dot.ca.gov/',terms:'https://dot.ca.gov/conditions-of-use',license:'Caltrans public information',licenseUrl:'https://dot.ca.gov/conditions-of-use',mode:'still',refreshMs:600000,coverage:'California districts 3 and 4',center:{lat:38,lon:-121.5}});
const DISTRICTS=[3,4];
export function normalizeCaltransCatalogue(data,district,now=Date.now()) {
 if(!DISTRICTS.includes(district)||!Array.isArray(data?.data))throw Error('California camera catalogue format is unavailable.');
 const unique=new Map();
 for(const row of data.data.slice(0,5000)){
  const c=row?.cctv,l=c?.location,s=c?.imageData?.static;
  if(c?.inService!=='true'||Number(l?.district)!==district)continue;
  const lat=Number(l.latitude),lon=Number(l.longitude),url=String(s?.currentImageURL||'');
  const match=url.match(/^https:\/\/cwwp2\.dot\.ca\.gov\/data\/d([34])\/cctv\/image\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})\.jpg$/);
  if(!match||Number(match[1])!==district||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<32||lat>43||lon< -125||lon> -113)continue;
  const id=`caltrans:${district}:${match[2]}:${match[3]}`;
  unique.set(id,Object.freeze({id,providerId:'caltrans',lat,lon,name:String(l.locationName||l.nearbyPlace||id).slice(0,160),country:'California, USA',district,mode:'still',presetIds:[id],imageUrl:url}));
 }
 return Object.freeze({schemaVersion:1,items:Object.freeze([...unique.values()]),indexedAt:now,updatedAt:null});
}
export function createCaltransCameraService({fetchImpl=globalThis.fetch,now=Date.now}={}){
 let cached=null,lastAttempt=0;
 async function read(district,signal){
  const controller=new AbortController(),cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,12000);
  try{
   const response=await fetchImpl(`https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD0${district}.json`,{signal:controller.signal,credentials:'omit',redirect:'error'});
   if(!response.ok)throw Error('California camera source is temporarily unavailable.');
   if(Number(response.headers?.get('content-length'))>3000000)throw Error('Camera source response exceeds the catalogue limit.');
   const text=await response.text();if(text.length>3000000)throw Error('Camera source response exceeds the catalogue limit.');
   return normalizeCaltransCatalogue(JSON.parse(text),district,now());
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 return {
  async catalogue({signal,force=false}={}){
   if(cached&&(!force&&now()-cached.indexedAt<3600000||now()-lastAttempt<60000))return cached;
   if(lastAttempt&&now()-lastAttempt<1200)throw Error('Camera source is busy. Retry in a moment.');
   lastAttempt=now();const items=[];
   // Publish atomically: a district failure cannot masquerade as full coverage.
   for(const district of DISTRICTS){const result=await read(district,signal);items.push(...result.items);}
   cached=Object.freeze({schemaVersion:1,items:Object.freeze(items),indexedAt:now(),updatedAt:null});return cached;
  },
  async detail(id,{signal}={}){
   if(!/^caltrans:[34]:[\w-]{1,100}:[\w-]{1,100}$/.test(id))throw Error('Unknown camera.');
   const catalogue=await this.catalogue({signal}),item=catalogue.items.find(v=>v.id===id);if(!item)throw Error('This camera is no longer in service.');
   // recordTimestamp describes catalogue metadata, NOT the image capture time.
   return {schemaVersion:1,id,name:item.name,checkedAt:now(),presets:[{id,name:'Current road still',imageUrl:item.imageUrl,capturedAt:null}]};
  }
 };
}
