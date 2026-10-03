// Public, credential-free regional provider. Media is displayed from its publisher,
// never proxied through an arbitrary URL endpoint or represented as live video.
export const CAMERA_PROVIDER = Object.freeze({
  id:'digitraffic',name:'Fintraffic / Digitraffic',country:'Finland',
  homepage:'https://www.digitraffic.fi/en/road-traffic/',
  terms:'https://www.digitraffic.fi/en/terms-of-service/',
  license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  mode:'still',refreshMs:600000,coverage:'Finnish road weather cameras'
});
const API='https://tie.digitraffic.fi/api/weathercam/v1/stations';
const stationId=value=>/^C\d{5}$/.test(String(value));
const presetId=value=>/^C\d{7}$/.test(String(value));
const collecting=properties=>properties?.collectionStatus==='GATHERING' && !['REMOVED','DISABLED','INACTIVE'].includes(properties?.state);
export function normalizeCameraCatalogue(data) {
  if(!Array.isArray(data?.features))throw Error('Camera catalogue format is unavailable.');
  const unique=new Map();
  for(const feature of (Array.isArray(data?.features)?data.features:[]).slice(0,5000)) {
    const p=feature?.properties,[lon,lat]=feature?.geometry?.coordinates||[];
    if(!stationId(p?.id)||!collecting(p)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
    const presets=(p.presets||[]).filter(v=>v.inCollection===true&&presetId(v.id)&&v.id.startsWith(p.id));
    if(!presets.length)continue;
    unique.set(p.id,Object.freeze({id:p.id,providerId:CAMERA_PROVIDER.id,lat,lon,
      name:String(p.name||p.id).replaceAll('_',' ').slice(0,160),country:'Finland',mode:'still',presetIds:presets.map(v=>v.id)}));
  }
  return Object.freeze({schemaVersion:1,items:Object.freeze([...unique.values()]),updatedAt:validTimestamp(data?.dataUpdatedTime),indexedAt:Date.now()});
}
function validTimestamp(value) {const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
export function cameraFreshness(capturedAt,now=Date.now()) {
  const time=Date.parse(capturedAt);
  if(!Number.isFinite(time)||time>now+120000)return 'Capture time unavailable';
  return now-time>30*60000?'Stale still image':'Recent still image';
}
export function normalizeCameraDetail(station,data,expectedId) {
  const p=station?.properties;
  if(!stationId(expectedId)||p?.id!==expectedId||!collecting(p)||data?.id!==expectedId)throw Error('This camera is no longer collecting images.');
  const presets=(p.presets||[]).filter(v=>v.inCollection===true&&presetId(v.id)&&v.id.startsWith(expectedId)).map(v=>{
    const url=`https://weathercam.digitraffic.fi/${v.id}.jpg`;
    if(v.imageUrl!==url)return null;
    const capturedAt=validTimestamp(data.presets?.find(entry=>entry.id===v.id)?.measuredTime);
    return Object.freeze({id:v.id,name:String(v.presentationName||v.id).slice(0,160),imageUrl:url,capturedAt});
  }).filter(Boolean);
  if(!presets.length)throw Error('This camera has no available public views.');
  return Object.freeze({schemaVersion:1,id:expectedId,name:String(p.names?.en||p.name||expectedId).replaceAll('_',' ').slice(0,160),presets,checkedAt:Date.now()});
}
export function filterCameraCatalogue(items,{query='',lat,lon,page=0,pageSize=20}={}) {
  const search=String(query).trim().toLocaleLowerCase();
  const matching=items.filter(v=>!search||`${v.name} ${v.id} ${v.country}`.toLocaleLowerCase().includes(search));
  if(Number.isFinite(lat)&&Number.isFinite(lon))matching.sort((a,b)=>distance(a,lat,lon)-distance(b,lat,lon));
  const size=Math.max(1,Math.min(40,pageSize)),pages=Math.max(1,Math.ceil(matching.length/size));
  const current=Math.max(0,Math.min(pages-1,Number(page)||0));
  return {items:matching.slice(current*size,(current+1)*size),total:matching.length,page:current,pages};
}
function distance(item,lat,lon){const dlon=((item.lon-lon+540)%360)-180;return (item.lat-lat)**2+(dlon*Math.cos(lat*Math.PI/180))**2;}
export function cameraMapClusters(items,cellDegrees=.4) {
  const groups=new Map();
  for(const item of items){const key=`${Math.floor(item.lat/cellDegrees)}:${Math.floor(item.lon/cellDegrees)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  return [...groups].map(([id,entries])=>({id,lat:entries.reduce((s,v)=>s+v.lat,0)/entries.length,lon:entries.reduce((s,v)=>s+v.lon,0)/entries.length,ids:entries.map(v=>v.id)}));
}
export function createPublicCameraService({fetchImpl=globalThis.fetch,now=Date.now}={}) {
  let catalogue=null,lastAttempt=0;
  const details=new Map();let detailAttempt=0;
  async function pace(delay,signal) {
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(delay<=0)return;
    await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);
      signal?.addEventListener('abort',abort,{once:true});
    });
  }
  async function json(url,signal) {
    const controller=new AbortController(),cancel=()=>controller.abort();
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,12000);
    try {
      const response=await fetchImpl(url,{signal:controller.signal,headers:{'Digitraffic-User':'WorldExplorer3D'},credentials:'omit',redirect:'error'});
      if(!response.ok)throw Error(response.status===429?'Camera source is busy. Retry in a minute.':'Camera source is temporarily unavailable.');
      if(Number(response.headers?.get('content-length'))>3000000)throw Error('Camera source response exceeds the catalogue limit.');
      const text=await response.text();if(text.length>3000000)throw Error('Camera source response exceeds the catalogue limit.');return JSON.parse(text);
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  return {
    async catalogue({signal,force=false}={}) {
      if(catalogue&&(!force&&now()-catalogue.indexedAt<3600000||now()-lastAttempt<60000))return catalogue;
      await pace(lastAttempt?Math.max(0,1200-(now()-lastAttempt)):0,signal);
      lastAttempt=now();catalogue=Object.freeze({...normalizeCameraCatalogue(await json(API,signal)),indexedAt:now()});return catalogue;
    },
    async detail(id,{signal}={}) {
      if(!stationId(id))throw Error('Unknown camera.');
      const cached=details.get(id);if(cached&&now()-cached.checkedAt<60000)return cached;
      await pace(detailAttempt?Math.max(0,1200-(now()-detailAttempt)):0,signal);
      detailAttempt=now();
      const [station,data]=await Promise.all([json(`${API}/${id}`,signal),json(`${API}/${id}/data`,signal)]);
      const result=Object.freeze({...normalizeCameraDetail(station,data,id),checkedAt:now()});details.set(id,result);
      while(details.size>24)details.delete(details.keys().next().value);
      return result;
    }
  };
}
