import {CAMERA_PROVIDER,createPublicCameraService,filterCameraCatalogue,cameraFreshness} from './public-camera-service.js';
const service=createPublicCameraService();
export function createPublicCameraState(){return {items:[],indexedAt:0,selectedId:'',detail:null,presetIndex:0,page:0,query:'',clusterIds:null,loading:false,error:'',mediaError:'',verified:new Set(),controller:null,token:0,timer:null};}
const available=state=>state.selector.api?.isOpen?.()&&state.panelMode==='live-earth'&&state.activeLayerId==='public-cameras'&&!document.hidden;
export function stopPublicCamera(state) {
  const camera=state.publicCamera;if(!camera)return;
  camera.token++;camera.controller?.abort();camera.controller=null;clearTimeout(camera.timer);camera.timer=null;camera.loading=false;
  state.selector.ui?.details?.querySelector('[data-public-camera-image]')?.removeAttribute('src');
}
function render(ctx,state){if(available(state))ctx.renderLiveEarthUi(ctx,state);}
export async function loadPublicCameras(ctx,state,force=false) {
  const camera=state.publicCamera;stopPublicCamera(state);const token=++camera.token;
  camera.controller=new AbortController();camera.loading=true;camera.error='';render(ctx,state);
  try{const catalogue=await service.catalogue({signal:camera.controller.signal,force});if(token!==camera.token)return;
    camera.items=catalogue.items;camera.indexedAt=catalogue.indexedAt;
  }catch(error){if(token!==camera.token)return;camera.error=error.name==='AbortError'?'Camera request timed out. Retry when ready.':error.message;}
  finally{if(token===camera.token){camera.loading=false;render(ctx,state);}}
  if(camera.selectedId&&token===camera.token&&available(state))await selectPublicCamera(ctx,state,camera.selectedId);
}
export async function selectPublicCamera(ctx,state,id,provider=service) {
  const camera=state.publicCamera,selected=camera.items.find(v=>v.id===id);if(!selected)return;
  stopPublicCamera(state);const token=++camera.token;camera.controller=new AbortController();camera.selectedId=id;camera.detail=null;camera.presetIndex=0;camera.loading=true;camera.error='';camera.mediaError='';
  state.selector.api?.setSelection?.(selected.lat,selected.lon,{name:selected.name,focus:true});
  state.selector.api?.setCameraDistance?.(1.3);render(ctx,state);
  try{const detail=await provider.detail(id,{signal:camera.controller.signal});if(token!==camera.token)return;camera.detail=detail;}
  catch(error){if(token!==camera.token)return;camera.error=error.name==='AbortError'?'Camera request timed out. Retry when ready.':error.message;}
  finally{if(token===camera.token){camera.loading=false;render(ctx,state);}}
}
export function publicCameraAction(ctx,state,action,value) {
  if(!action.startsWith('camera-'))return false;
  const camera=state.publicCamera;
  if(action==='camera-select')void selectPublicCamera(ctx,state,value);
  if(action==='camera-retry')void (camera.selectedId?selectPublicCamera(ctx,state,camera.selectedId):loadPublicCameras(ctx,state,true));
  if(action==='camera-back'){stopPublicCamera(state);camera.selectedId='';camera.detail=null;camera.error='';render(ctx,state);}
  if(action==='camera-page'){camera.page+=Number(value)||0;render(ctx,state);}
  if(action==='camera-next-site'){const index=camera.items.findIndex(v=>v.id===camera.selectedId);if(camera.items.length)void selectPublicCamera(ctx,state,camera.items[(index+1)%camera.items.length].id);}
  if(action==='camera-coverage'){state.selector.api?.setSelection?.(65,26,{name:'Finland camera coverage',focus:true});state.selector.api?.setCameraDistance?.(1.4);}
  if(action==='camera-all'){camera.clusterIds=null;camera.page=0;camera.query='';render(ctx,state);}
  if(action==='camera-view'){camera.presetIndex=(camera.presetIndex+Number(value)+camera.detail.presets.length)%camera.detail.presets.length;camera.mediaError='';render(ctx,state);}
  if(action==='camera-focus'||action==='camera-explore'){
    const selected=camera.items.find(v=>v.id===camera.selectedId);if(selected){
      state.selector.api.setSelection(selected.lat,selected.lon,{name:camera.detail?.name||selected.name,focus:true,arrivalMode:'walk'});
      if(action==='camera-explore')void state.selector.api.startHere?.();
      else state.selector.api.setCameraDistance?.(1.08);
    }
  }
  return true;
}
export function renderPublicCameraDetails(ctx,state) {
  const camera=state.publicCamera,escape=ctx.escapeHtml,provider=CAMERA_PROVIDER;
  const attribution=`<p class="globe-selector-live-detail-meta">Source: <a href="${provider.homepage}" target="_blank" rel="noopener noreferrer">Fintraffic / digitraffic.fi</a> · <a href="${provider.licenseUrl}" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Images displayed without alteration. <a href="${provider.terms}" target="_blank" rel="noopener noreferrer">Source terms</a>.</p>`;
  const button=(action,label,value='',disabled=false)=>`<button class="globe-selector-live-action-btn secondary" type="button" ${disabled?'disabled':''} data-live-earth-action="camera-${action}" data-id="${escape(value)}">${label}</button>`;
  let content='';
  if(camera.selectedId){
    const selected=camera.items.find(v=>v.id===camera.selectedId),preset=camera.detail?.presets[camera.presetIndex];
    content=`${button('back','All cameras')}<h3>${escape(camera.detail?.name||selected?.name||camera.selectedId)}</h3>`;
    if(preset){
      const stamp=preset.capturedAt?new Date(preset.capturedAt).toLocaleString():'Unknown';
      content+=`<img data-public-camera-image="${escape(preset.id)}" src="${escape(preset.imageUrl)}${preset.capturedAt?'?capture='+encodeURIComponent(preset.capturedAt):''}" alt="${escape(camera.detail.name+' — '+preset.name)}" referrerpolicy="no-referrer" style="width:100%;height:auto;display:block;aspect-ratio:16/9;object-fit:contain;background:#07111b">
      <p><strong>${escape(preset.name)}</strong> · Still ${camera.presetIndex+1} of ${camera.detail.presets.length}</p>
      <p data-camera-health>${escape(cameraFreshness(preset.capturedAt))} · Captured ${escape(stamp)}. Images normally update about every 10 minutes.</p>
      <p>${selected.lat.toFixed(5)}°, ${selected.lon.toFixed(5)}° · Finland</p><a class="globe-selector-live-action-btn" href="${escape(preset.imageUrl)}" target="_blank" rel="noopener noreferrer">Open full-size still</a>
      <div class="globe-selector-live-detail-actions">${button('view','Previous view','-1',camera.detail.presets.length<2)}${button('view','Next view','1',camera.detail.presets.length<2)}${button('retry','Refresh still')}${button('next-site','Next camera')}${button('focus','Show on map')}${button('explore','Explore here')}</div>`;
    }
  }else{
    const selection=ctx.selectorSelection(state)||{};
    const items=camera.clusterIds?camera.items.filter(v=>camera.clusterIds.includes(v.id)):camera.items;
    const page=filterCameraCatalogue(items,{query:camera.query,page:camera.page,lat:selection.lat,lon:selection.lon});camera.page=page.page;
    content=`<h3>Public cameras · Finland</h3><p>Road-weather stills from Finland. No live video; other countries are not covered yet.</p>
      <p>${camera.items.length} indexed camera sites · ${camera.verified.size} images opened this session. Availability varies.</p>
      ${button('coverage','Show Finland coverage')}<form data-camera-search><label for="publicCameraSearch">Search camera or place</label><input id="publicCameraSearch" name="query" type="search" maxlength="120" value="${escape(camera.query)}" placeholder="e.g. Helsinki" style="width:100%;box-sizing:border-box"><button type="submit" class="globe-selector-live-action-btn">Search</button></form>
      ${camera.clusterIds?button('all','Show all Finland'):''}<div class="globe-selector-live-list">${page.items.map(v=>`<button type="button" class="globe-selector-live-list-item" data-live-earth-action="camera-select" data-id="${escape(v.id)}"><span>${escape(v.name)}</span><small>Road weather · Still images</small></button>`).join('')}</div>
      ${!camera.loading&&!page.total?'<p>No cameras match this search. Current coverage is Finland.</p>':''}
      <p>${page.total} matching sites · Page ${page.page+1} of ${page.pages}</p><div class="globe-selector-live-detail-actions">${button('page','Previous page','-1',page.page===0)}${button('page','Next page','1',page.page===page.pages-1)}</div>`;
  }
  if(camera.loading)content+='<p role="status">Loading camera information…</p>';
  if(camera.error)content+=`<p role="alert">${escape(camera.error)}${camera.items.length?' Retaining the last indexed catalogue.':''}</p>${button('retry','Retry')}`;
  ctx.setDetailsHtml(state,`<section class="globe-selector-live-detail-card publicCameraPanel">${content}${attribution}</section>`);
  const details=state.selector.ui?.details;
  details?.querySelector('[data-camera-search]')?.addEventListener('submit',event=>{event.preventDefault();camera.query=new FormData(event.currentTarget).get('query')||'';camera.page=0;render(ctx,state);});
  const img=details?.querySelector('[data-public-camera-image]');
  if(img){const token=camera.token;
    const mark=(ok)=>{if(token!==camera.token||!img.isConnected)return;const health=details.querySelector('[data-camera-health]');
      if(ok){camera.verified.add(img.dataset.publicCameraImage);if(health)health.textContent+=' · Image loaded '+new Date().toLocaleTimeString();}
      else{img.hidden=true;if(health)health.textContent='Image unavailable. The source may be offline. Retry or choose another view.';}
    };
    img.addEventListener('load',()=>mark(true),{once:true});img.addEventListener('error',()=>mark(false),{once:true});
    clearTimeout(camera.timer);camera.timer=setTimeout(()=>{if(available(state))void selectPublicCamera(ctx,state,camera.selectedId);},provider.refreshMs);
  }
}
