import './capture-theme.js';
import {sameCaptureBuilding} from '../../../functions/capture-target.mjs';
import {listMyRealityCaptures,getMyRealityCapture,getRealityCaptureAssetAccess} from '../../../js/community-reality-capture-api.js?v=4';
import {listLocalCaptureDrafts,loadLocalCaptureDraft} from './local-draft-store.js?v=1';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';
import {mountCaptureStep} from './workspace-navigation.js';

export async function chooseReusablePhotos({uid,building,captureId,kind,signal}) {
 const dialog=document.createElement('dialog');dialog.className='realityCaptureDialog';
 dialog.innerHTML='<header><h2>Reuse your photos</h2><button data-close>Back to building</button></header><p>Select photos to copy into this contribution. Originals and previous placements stay with their source.</p><label>Photo source<select data-source></select></label><p role="status">Finding your photos…</p><div data-photos></div><button data-import>Use selected photos</button>';
 document.body.append(dialog);dialog.showModal();
 const $=s=>dialog.querySelector(s),sources=[],urls=[],selected=new Map();let generation=0,closed=false;
 const assertOwner=()=>{signal.throwIfAborted();if(getCurrentUser()?.uid!==uid)throw Error('Account changed. Reopen this building.');};
 let finish;const result=new Promise(resolve=>finish=resolve);
 const close=value=>{if(closed)return;closed=true;generation++;urls.forEach(URL.revokeObjectURL);dialog.captureStepDispose?.();dialog.close();dialog.remove();signal.removeEventListener('abort',abort);finish(value||[]);};
 const abort=()=>close();signal.addEventListener('abort',abort,{once:true});
 $('[data-close]').onclick=()=>close();dialog.oncancel=e=>{e.preventDefault();close();};
 mountCaptureStep(dialog,{building,section:'Photos',requestClose:()=>close()});
 async function show(){const ticket=++generation;selected.clear();$('[data-photos]').replaceChildren();urls.splice(0).forEach(URL.revokeObjectURL);$('[role=status]').textContent='Loading source…';
  try{assertOwner();const source=sources[Number($('[data-source]').value)];if(!source){$('[role=status]').textContent='No reusable photos yet. Add photos from your device.';return;}
   const photos=await source.load();assertOwner();if(ticket!==generation)return;
   for(const [index,photo] of photos.entries()){const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #53606a';const check=document.createElement('input');check.type='checkbox';check.onchange=()=>check.checked?selected.set(photo.id,{photo,source}):selected.delete(photo.id);label.append(check,document.createTextNode(`Photo ${index+1}`));
    const preview=document.createElement('button');preview.type='button';preview.textContent='Preview';preview.style.width='auto';preview.onclick=async e=>{e.preventDefault();try{assertOwner();const blob=await source.blob(photo);assertOwner();if(ticket!==generation)return;const image=document.createElement('img'),url=URL.createObjectURL(blob);urls.push(url);image.src=url;image.alt=`Source photo ${index+1}`;image.style.cssText='width:100%;max-height:180px;object-fit:contain';label.after(image);preview.remove();}catch(e){$('[role=status]').textContent=e.message;}};label.append(preview);$('[data-photos]').append(label);
   }$('[role=status]').textContent=`${photos.length} photos available. ${source.legacy?'Legacy device recovery: only selected photos will be copied into this environment.':''}`;
  }catch(e){if(!closed)$('[role=status]').textContent=e.message;}
 }
 $('[data-source]').onchange=show;
 $('[data-import]').onclick=async()=>{if(!selected.size){$('[role=status]').textContent='Select at least one photo.';return;}if(kind==='exterior'&&[...selected.values()].some(v=>v.source.kind==='interior_room')&&!confirm('Use these interior photos in an exterior contribution? Photos placed on an approved exterior become publicly visible.'))return;
  $('[data-import]').disabled=true;try{const files=[];for(const {photo,source} of selected.values()){assertOwner();const blob=await source.blob(photo);assertOwner();files.push(new File([blob],`reused-${photo.id}.jpg`,{type:'image/jpeg'}));}$('[role=status]').textContent='Photos copied to this device. Save to account when ready.';close(files);}catch(e){$('[role=status]').textContent=e.message;}finally{if(!closed)$('[data-import]').disabled=false;}
 };
 try{const response=await listMyRealityCaptures({worldId:building.worldId,sourceBuildingId:building.sourceBuildingId});assertOwner();
  for(const capture of response.captures||[]){if(capture.captureId===captureId||!sameCaptureBuilding(capture.building,building))continue;sources.push({kind:capture.captureKind,label:`Saved ${capture.captureKind==='interior_room'?'interior':'exterior'} · ${capture.status} · ${new Date(capture.updatedAtMs||capture.createdAtMs).toLocaleDateString()}`,load:async()=>(await getMyRealityCapture(capture.captureId)).photos||[],blob:async photo=>{const access=await getRealityCaptureAssetAccess(capture.captureId,'original',photo.path);const response=await fetch(access.url,{cache:'no-store',signal});if(!response.ok)throw Error('Photo unavailable. Try refreshing its source.');return response.blob();}});}
  for(const legacy of [false,true])for(const draft of await listLocalCaptureDrafts({legacy})){if(draft.uid!==uid&&draft.ownerUid!==uid&&draft.ownerUid!=='local-device')continue;if(draft.target&&!sameCaptureBuilding(draft.target,building))continue;sources.push({legacy,kind:draft.kind,label:`${legacy?'Legacy device':'Device'} · ${draft.target?.label||'photo batch'}`,load:async()=>{const loaded=await loadLocalCaptureDraft(draft.id,{legacy});return loaded.photos.filter(p=>p.blob);},blob:async photo=>photo.blob});}
  if(closed)return result;for(const [i,source] of sources.entries())$('[data-source]').add(new Option(source.label,String(i)));await show();
 }catch(e){if(!closed)$('[role=status]').textContent=e.message;}
 return result;
}
