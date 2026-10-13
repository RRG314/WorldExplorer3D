import {MATERIAL_VARIANTS} from '../world/building-exterior-catalog.js?v=1';
import {FACADE_TEXTURES} from '../world/building-surface-catalog.js';
export const REGIONAL_SURFACE_IDS=Object.freeze([...new Set(Object.values(MATERIAL_VARIANTS).map(m=>m.texture))]);
let shared=null;
// One bounded atlas, owned by the renderer family across regional eviction.
// Decode only one source at a time. All sources are the same licensed surface
// assets used by the starting district; no window images or new model owner.
export function sharedRegionalFacadeAtlas(){
 if(shared)return shared;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
 const context=canvas.getContext('2d');context.fillStyle='#b0aaa0';context.fillRect(0,0,2048,2048);
 const texture=new THREE.CanvasTexture(canvas);texture.name='regional-shared-building-surfaces';texture.anisotropy=4;
 const state={status:'loading',loaded:0,failed:[],bytes:2048*2048*4};shared={texture,state};
 shared.ready=(async()=>{
  for(const [index,id] of REGIONAL_SURFACE_IDS.entries()){
   const img=new Image();
   try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=FACADE_TEXTURES[id];});
    context.drawImage(img,(index%4)*512,Math.floor(index/4)*512,512,512);state.loaded++;texture.needsUpdate=true;
   }catch{state.failed.push(id);}finally{img.onload=img.onerror=null;img.src='';}
  }
  state.status=state.failed.length?'degraded':'ready';return state;
 })();
 texture.userData ||= {};texture.userData.regionalSurfaceState=state;return shared;
}
