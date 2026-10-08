import {filterCameraCatalogue,cameraFreshness} from './public-camera-service.js';
import {CAMERA_PROVIDERS,cameraProvider,createPublicCameraDirectory,normalizeCameraFavorites,cameraJournalReference} from './public-camera-directory.js';
const service=createPublicCameraDirectory();
export function createPublicCameraState(){return {providerId:'digitraffic',items:[],indexedAt:0,selectedId:'',detail:null,presetIndex:0,page:0,query:'',clusterIds:null,loading:false,error:'',notice:'',mediaError:'',verified:new Set(),controller:null,token:0,timer:null,wall:[],wallOpen:false,favorites:[],favoritesOnly:false,saving:false};}
const available=state=>state.selector.api?.isOpen?.()&&state.panelMode==='live-earth'&&state.activeLayerId==='public-cameras'&&!document.hidden;
export function stopPublicCamera(state) {
 const camera=state.publicCamera;if(!camera)return;
 camera.token++;camera.controller?.abort();camera.controller=null;clearTimeout(camera.timer);camera.timer=null;camera.loading=false;
 const details=state.selector.ui?.details;details?.classList?.remove('public-camera-wall');
 const images=details?.querySelectorAll?.('[data-public-camera-image]')||[details?.querySelector?.('[data-public-camera-image]')];
 for(const img of images)img?.removeAttribute('src');
}
function render(ctx,state){if(available(state))ctx.renderLiveEarthUi(ctx,state);}
async function profileStore(ctx){if(!ctx.discoveryProfileStore){const {createIndexedDbDiscoveryProfileStore}=await import('../discovery/profile-store.js?v=5');ctx.discoveryProfileStore ||= createIndexedDbDiscoveryProfileStore();}return ctx.discoveryProfileStore;}
export async function loadPublicCameras(ctx,state,force=false) {
 const camera=state.publicCamera;stopPublicCamera(state);const token=++camera.token;
 camera.controller=new AbortController();camera.loading=true;camera.error='';render(ctx,state);
 try{const catalogue=await service.catalogue({providerId:camera.providerId,signal:camera.controller.signal,force});if(token!==camera.token)return;
  camera.items=catalogue.items;camera.indexedAt=catalogue.indexedAt;
 }catch(error){if(token!==camera.token)return;camera.error=error.name==='AbortError'?'Camera request timed out. Retry when ready.':error.message;}
 finally{if(token===camera.token){camera.loading=false;render(ctx,state);}}
 try{const profile=await (await profileStore(ctx)).getProfile();if(token===camera.token){camera.favorites=normalizeCameraFavorites(profile.publicCameraFavorites);render(ctx,state);}}catch{/* Browsing remains usable without local storage. Saving explains failures. */}
 if(token!==camera.token||!available(state))return;
 if(camera.wallOpen)await refreshCameraWall(ctx,state);
 else if(camera.selectedId)await selectPublicCamera(ctx,state,camera.selectedId);
}
export async function selectPublicCamera(ctx,state,id,provider=service) {
 const camera=state.publicCamera,selected=camera.items.find(v=>v.id===id);if(!selected)return;
 stopPublicCamera(state);const token=++camera.token;camera.controller=new AbortController();camera.wallOpen=false;camera.selectedId=id;camera.detail=null;camera.presetIndex=0;camera.loading=true;camera.error='';camera.mediaError='';camera.notice='';
 state.selector.api?.setSelection?.(selected.lat,selected.lon,{name:selected.name,focus:true});state.selector.api?.setCameraDistance?.(1.3);render(ctx,state);
 try{const detail=await provider.detail(id,{signal:camera.controller.signal});if(token!==camera.token)return;camera.detail=detail;}
 catch(error){if(token!==camera.token)return;camera.error=error.name==='AbortError'?'Camera request timed out. Retry when ready.':error.message;}
 finally{if(token===camera.token){camera.loading=false;render(ctx,state);}}
}
export async function refreshCameraWall(ctx,state,provider=service){
 const camera=state.publicCamera;stopPublicCamera(state);const token=++camera.token;camera.controller=new AbortController();camera.loading=true;camera.error='';render(ctx,state);
 for(const entry of camera.wall){
  try{const detail=await provider.detail(entry.item.id,{signal:camera.controller.signal});if(token!==camera.token)return;entry.detail=detail;entry.error='';if(!detail.presets.some(v=>v.id===entry.presetId))entry.presetId=detail.presets[0].id;}
  catch(error){if(token!==camera.token)return;entry.error=error.name==='AbortError'?'Source request timed out.':error.message;}
 }
 if(token===camera.token){camera.loading=false;render(ctx,state);}
}
async function saveCamera(ctx,state,journal=false){
 const camera=state.publicCamera,item=camera.items.find(v=>v.id===camera.selectedId),preset=camera.detail?.presets[camera.presetIndex];if(!item||camera.saving)return;
 camera.saving=true;camera.error='';camera.notice='';render(ctx,state);
 try{
  const store=await profileStore(ctx);
  if(journal){
   if(!preset||!camera.verified.has(preset.id))throw Error('Wait for the still image to load before saving its reference.');
   const result=await store.recordExplorerEvent(cameraJournalReference(item,preset,camera.detail.checkedAt));
   if(!result.recorded&&result.reason!=='already-recorded')throw Error('The Journal could not save this reference.');
   camera.notice='Remote-view reference saved to Journal. No visit or exploration reward was awarded.';
  }else{
   const profile=await store.saveProfile(current=>{const favorites=normalizeCameraFavorites(current.publicCameraFavorites),exists=favorites.includes(item.id);if(!exists&&favorites.length>=100)throw Error('Favorites are full. Remove one before adding another.');return {...current,publicCameraFavorites:exists?favorites.filter(id=>id!==item.id):[...favorites,item.id]};});
   camera.favorites=normalizeCameraFavorites(profile.publicCameraFavorites);camera.notice=camera.favorites.includes(item.id)?'Camera saved to favorites.':'Camera removed from favorites.';
  }
 }catch(error){camera.error=error.message||'Local save failed. Retry when storage is available.';}
 finally{camera.saving=false;render(ctx,state);}
}
export function publicCameraAction(ctx,state,action,value) {
 if(!action.startsWith('camera-'))return false;
 const camera=state.publicCamera;
 if(action==='camera-select')void selectPublicCamera(ctx,state,value);
 if(action==='camera-retry')void (camera.wallOpen?refreshCameraWall(ctx,state):camera.selectedId?selectPublicCamera(ctx,state,camera.selectedId):loadPublicCameras(ctx,state,true));
 if(action==='camera-region'&&CAMERA_PROVIDERS[value]&&value!==camera.providerId){stopPublicCamera(state);Object.assign(camera,{providerId:value,items:[],indexedAt:0,selectedId:'',detail:null,clusterIds:null,page:0,query:'',wallOpen:false,error:'',notice:''});void loadPublicCameras(ctx,state);}
 if(action==='camera-back'){stopPublicCamera(state);camera.selectedId='';camera.detail=null;camera.wallOpen=false;camera.error='';camera.notice='';render(ctx,state);}
 if(action==='camera-page'){camera.page+=Number(value)||0;render(ctx,state);}
 if(action==='camera-next-site'){const index=camera.items.findIndex(v=>v.id===camera.selectedId);if(camera.items.length)void selectPublicCamera(ctx,state,camera.items[(index+1)%camera.items.length].id);}
 if(action==='camera-coverage'){const p=cameraProvider(camera.providerId);state.selector.api?.setSelection?.(p.center.lat,p.center.lon,{name:p.coverage,focus:true});state.selector.api?.setCameraDistance?.(1.4);}
 if(action==='camera-all'){camera.clusterIds=null;camera.page=0;camera.query='';camera.favoritesOnly=false;render(ctx,state);}
 if(action==='camera-favorites'){camera.favoritesOnly=!camera.favoritesOnly;camera.page=0;render(ctx,state);}
 if(action==='camera-favorite')void saveCamera(ctx,state);
 if(action==='camera-journal')void saveCamera(ctx,state,true);
 if(action==='camera-wall-add'){
  const item=camera.items.find(v=>v.id===camera.selectedId),preset=camera.detail?.presets[camera.presetIndex];
  if(item&&preset&&!camera.wall.some(v=>v.presetId===preset.id)&&camera.wall.length<4){camera.wall.push({item,detail:camera.detail,presetId:preset.id,error:''});camera.notice='View added to camera wall.';render(ctx,state);}
 }
 if(action==='camera-wall'){camera.wallOpen=true;void refreshCameraWall(ctx,state);}
 if(action==='camera-wall-remove'){camera.wall=camera.wall.filter(v=>v.presetId!==value);render(ctx,state);}
 if(action==='camera-view'&&camera.detail?.presets.length){camera.presetIndex=(camera.presetIndex+Number(value)+camera.detail.presets.length)%camera.detail.presets.length;camera.mediaError='';render(ctx,state);}
 if(action==='camera-focus'||action==='camera-explore'){
  const selected=camera.items.find(v=>v.id===camera.selectedId);if(selected){state.selector.api.setSelection(selected.lat,selected.lon,{name:camera.detail?.name||selected.name,focus:true,arrivalMode:'walk'});if(action==='camera-explore')void state.selector.api.startHere?.();else state.selector.api.setCameraDistance?.(1.08);}
 }
 return true;
}
export function renderPublicCameraDetails(ctx,state) {
 const camera=state.publicCamera,escape=ctx.escapeHtml,provider=cameraProvider(camera.providerId);
 const button=(action,label,value='',disabled=false)=>`<button class="globe-selector-live-action-btn secondary" type="button" ${disabled?'disabled':''} data-live-earth-action="camera-${action}" data-id="${escape(value)}">${label}</button>`;
 const attribution=p=>`<p class="globe-selector-live-detail-meta">Source: <a href="${p.homepage}" target="_blank" rel="noopener noreferrer">${escape(p.name)}</a> · <a href="${p.licenseUrl}" target="_blank" rel="noopener noreferrer">${escape(p.license)}</a>. Images displayed without alteration. <a href="${p.terms}" target="_blank" rel="noopener noreferrer">Source terms</a>.</p>`;
 const still=(item,detail,preset,compact=false)=>`<article data-camera-view><img data-public-camera-image="${escape(preset.id)}" src="${escape(preset.imageUrl)}?${preset.capturedAt?'capture='+encodeURIComponent(preset.capturedAt):'checked='+Math.floor(detail.checkedAt/600000)}" alt="${escape(detail.name+' — '+preset.name)}" referrerpolicy="no-referrer" style="width:100%;height:auto;display:block;aspect-ratio:16/9;object-fit:contain;background:#07111b"><p data-camera-health>${escape(cameraFreshness(preset.capturedAt))} · Captured ${escape(preset.capturedAt?new Date(preset.capturedAt).toLocaleString():'Unknown')}.</p>${compact?'<details><summary>Time, location and source</summary>':''}<p>${item.lat.toFixed(5)}°, ${item.lon.toFixed(5)}° · ${escape(item.country)}. Checked ${escape(new Date(detail.checkedAt).toLocaleString())}. Source update intervals vary; this viewer refreshes every 10 minutes.</p><a class="globe-selector-live-action-btn" href="${escape(preset.imageUrl)}" target="_blank" rel="noopener noreferrer">Open full-size still</a>${compact?attribution(cameraProvider(item.id))+'</details>':''}</article>`;
 let content=`<div class="globe-selector-live-detail-actions" aria-label="Camera coverage">${Object.values(CAMERA_PROVIDERS).map(p=>button('region',escape(p.country),p.id,camera.providerId===p.id)).join('')}${camera.wallOpen?button('back','Browse cameras'):button('wall',`Camera wall (${camera.wall.length}/4)`,'',!camera.wall.length)}</div>`;
 if(camera.wallOpen){
  content+=`<h3>Camera wall · ${camera.wall.length} of 4 views</h3><p>Regional still images, not live video. Add views from either region. The wall stays in this session; favorites are saved on this device.</p><div data-camera-wall>${camera.wall.map(entry=>{const preset=entry.detail.presets.find(v=>v.id===entry.presetId);return `<section><h4>${escape(entry.detail.name)}</h4>${entry.error?`<p role="alert">${escape(entry.error)} Last metadata retained; image freshness is unverified.</p>`:''}${preset?still(entry.item,entry.detail,preset,true):''}${button('wall-remove','Remove view',entry.presetId)}</section>`;}).join('')}</div>${button('retry','Refresh wall')}`;
 }else if(camera.selectedId){
  const selected=camera.items.find(v=>v.id===camera.selectedId),preset=camera.detail?.presets[camera.presetIndex];
  content+=`${button('back','All cameras')}<h3>${escape(camera.detail?.name||selected?.name||camera.selectedId)}</h3>`;
  if(preset){content+=`${still(selected,camera.detail,preset)}<p><strong>${escape(preset.name)}</strong> · Still ${camera.presetIndex+1} of ${camera.detail.presets.length}</p><div class="globe-selector-live-detail-actions">${button('view','Previous view','-1',camera.detail.presets.length<2)}${button('view','Next view','1',camera.detail.presets.length<2)}${button('retry','Refresh still')}${button('next-site','Next camera')}${button('favorite',camera.favorites.includes(camera.selectedId)?'Remove favorite':'Save favorite','',camera.saving)}${button('journal','Save Journal reference','',camera.saving)}${button('wall-add','Add to camera wall','',camera.wall.length>=4||camera.wall.some(v=>v.presetId===preset.id))}${button('focus','Show on map')}${button('explore','Explore here')}</div>`;}
 }else{
  const selection=ctx.selectorSelection(state)||{};let items=camera.clusterIds?camera.items.filter(v=>camera.clusterIds.includes(v.id)):camera.items;if(camera.favoritesOnly)items=items.filter(v=>camera.favorites.includes(v.id));
  const page=filterCameraCatalogue(items,{query:camera.query,page:camera.page,lat:selection.lat,lon:selection.lon});camera.page=page.page;
  content+=`<h3>Public cameras · ${escape(provider.country)}</h3><p>${escape(provider.coverage)}. Still images only; coverage outside these regions is not available.</p><p>${camera.items.length} indexed sites · ${camera.verified.size} images opened this session.${camera.indexedAt?' Catalogue checked '+escape(new Date(camera.indexedAt).toLocaleString())+'.':''}</p>${button('coverage',`Show ${escape(provider.country)} coverage`)}${button('favorites',camera.favoritesOnly?'Show all sites':'Favorites in this region')}<form data-camera-search><label for="publicCameraSearch">Search camera or place</label><input id="publicCameraSearch" name="query" type="search" maxlength="120" value="${escape(camera.query)}" placeholder="Camera or place name" style="width:100%;box-sizing:border-box"><button type="submit" class="globe-selector-live-action-btn">Search</button></form>${camera.clusterIds?button('all','Show all cameras'):''}<div class="globe-selector-live-list">${page.items.map(v=>`<button type="button" class="globe-selector-live-list-item" data-live-earth-action="camera-select" data-id="${escape(v.id)}"><span>${escape(v.name)}</span><small>Road camera · Still images${camera.favorites.includes(v.id)?' · Favorite':''}</small></button>`).join('')}</div>${!camera.loading&&!page.total?'<p>No cameras match this search or favorites filter in this region.</p>':''}<p>${page.total} matching sites · Page ${page.page+1} of ${page.pages}</p><div class="globe-selector-live-detail-actions">${button('page','Previous page','-1',page.page===0)}${button('page','Next page','1',page.page===page.pages-1)}</div>`;
 }
 if(camera.loading)content+='<p role="status">Loading camera information…</p>';
 if(camera.notice)content+=`<p role="status">${escape(camera.notice)}</p>`;
 if(camera.error)content+=`<p role="alert">${escape(camera.error)}${camera.items.length?' Last indexed catalogue retained.':''}</p>${button('retry','Retry')}`;
 const focused=document.activeElement?.closest?.('[data-live-earth-action]');const focusAction=focused?.dataset.liveEarthAction,focusId=focused?.dataset.id;
 ctx.setDetailsHtml(state,`<section class="globe-selector-live-detail-card publicCameraPanel">${content}${camera.wallOpen?'':attribution(provider)}</section>`);
 const details=state.selector.ui?.details;details?.classList?.toggle('public-camera-wall',camera.wallOpen);
 details?.querySelector('[data-camera-search]')?.addEventListener('submit',event=>{event.preventDefault();camera.query=new FormData(event.currentTarget).get('query')||'';camera.page=0;render(ctx,state);});
 if(focusAction)Array.from(details?.querySelectorAll('[data-live-earth-action]')||[]).find(el=>el.dataset.liveEarthAction===focusAction&&el.dataset.id===focusId&&!el.disabled)?.focus({preventScroll:true});
 const images=details?.querySelectorAll('[data-public-camera-image]')||[];clearTimeout(camera.timer);camera.timer=null;
 for(const img of images){const token=camera.token;let marked=false;
  const mark=ok=>{if(marked||token!==camera.token||!img.isConnected)return;marked=true;const health=img.closest('[data-camera-view]')?.querySelector('[data-camera-health]');if(ok){camera.verified.add(img.dataset.publicCameraImage);if(health)health.textContent+=' · Image loaded '+new Date().toLocaleTimeString();}else{img.hidden=true;if(health)health.textContent='Image unavailable. The source may be offline. Retry or choose another view.';}};
  img.addEventListener('load',()=>mark(true),{once:true});img.addEventListener('error',()=>mark(false),{once:true});if(img.complete)queueMicrotask(()=>mark(img.naturalWidth>0));
 }
 if(images.length&&!camera.loading&&available(state))camera.timer=setTimeout(()=>{if(available(state))void(camera.wallOpen?refreshCameraWall(ctx,state):selectPublicCamera(ctx,state,camera.selectedId));},provider.refreshMs);
}
