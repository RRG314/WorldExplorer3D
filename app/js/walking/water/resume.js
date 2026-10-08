// This is a local traversal checkpoint, separate from Journal rewards and cloud
// receipts. Resume always revalidates the current world and starts at its surface.
export const SWIM_RESUME_KEY='we3d.swimming.resume.v1';
const finitePose=p=>p && ['x','z','yaw'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<1e7);
export function validateSwimResume(value,now=Date.now()) {
  if(value?.version!==1||typeof value.owner!=='string'||value.owner.length<1||value.owner.length>80||!Number.isFinite(value.savedAt)||now-value.savedAt>86400000||value.savedAt>now+60000
    ||!Number.isFinite(value.origin?.lat)||Math.abs(value.origin.lat)>90||!Number.isFinite(value.origin?.lon)||Math.abs(value.origin.lon)>180
    ||!finitePose(value.pose)||!Number.isFinite(value.airSeconds)||value.airSeconds<0||value.airSeconds>180
    ||!['none','scuba'].includes(value.equipment))return null;
  return {version:1,owner:value.owner,savedAt:value.savedAt,origin:{lat:value.origin.lat,lon:value.origin.lon},pose:{x:value.pose.x,z:value.pose.z,yaw:value.pose.yaw},airSeconds:value.airSeconds,equipment:value.equipment};
}
export function createSwimResumeStore({storage,now=()=>Date.now()}={}) {
  const target=()=>storage || globalThis.localStorage;
  const owner=globalThis.crypto?.randomUUID?.() || `swim-${Date.now()}-${Math.random()}`;
  return {
    read(origin){try{const raw=target()?.getItem(SWIM_RESUME_KEY);if(!raw||raw.length>2048)return null;const value=validateSwimResume(JSON.parse(raw),now());return value && Math.abs(value.origin.lat-origin?.lat)<1e-7 && Math.abs(value.origin.lon-origin?.lon)<1e-7 ? value:null}catch{return null}},
    write(origin,pose,resources){try{const value=validateSwimResume({version:1,owner,savedAt:now(),origin,pose,airSeconds:resources.airSeconds,equipment:resources.equipment},now());if(!value)return false;target()?.setItem(SWIM_RESUME_KEY,JSON.stringify(value));return !!target()}catch{return false}},
    clear(){try{const raw=target()?.getItem(SWIM_RESUME_KEY);if(raw&&raw.length<=2048&&JSON.parse(raw).owner===owner)target()?.removeItem(SWIM_RESUME_KEY)}catch{/* Storage denial never interrupts traversal. */}}
  };
}
