import {mountCaptureStep} from './workspace-navigation.js';
import './capture-theme.js';
import {wallDirections} from './orientation.js';
import {mountCaptureMap} from './map-context.js';
import {loadClassicScript} from '../modules/script-loader.js?v=56';
import {vendorScriptsCritical} from '../modules/manifest.js?v=599';
import {createCaptureViewer} from './result-viewer.js?v=2';
import {wallFootprint,validateQuad,rectifyPhoto,buildHybridShell,buildWallPatch} from './hybrid-geometry.js?v=1';
import {loadLocalCaptureDraft,saveLocalCaptureDraft,deleteLocalCaptureDraft} from './local-draft-store.js?v=1';
import {normalizeManualRoom,manualRoomFootprint,manualRoomSurfaceSize,ROOM_SURFACE_NAMES} from '../../../functions/capture-room-geometry.mjs';

// The host supplies the existing authenticated asset/save APIs. No public URLs,
// alternate uploader, reconstruction queue, or world-geometry authority here.
export async function openHybridEditor({capture,photos,loadPhoto,save,submit,signal,onClose,initialWall=0,saveScope='account',inWorld=false,notice=''}) {
  const isRoom=capture.captureKind==='interior_room';
  let pts=isRoom?manualRoomFootprint(capture.hybridPreview?.room||capture.room):wallFootprint(capture.building);
  if(!photos.length)throw Error('No saved photographs are available for this capture.');
  if(!globalThis.THREE)await loadClassicScript(vendorScriptsCritical[0]);
  signal.throwIfAborted();
  const T=globalThis.THREE, abort=new AbortController();
  const dialog=document.createElement('dialog'); dialog.className='captureHybridEditor';
  if(inWorld)dialog.classList.add('captureInWorld');
  dialog.setAttribute('aria-label','Build a photo-supported building preview');
  dialog.innerHTML=`<style>
    .captureHybridEditor{box-sizing:border-box;color-scheme:dark;background:#09222d;color:#e3f5fa;border:1px solid #68c4d0;border-radius:12px;width:min(1000px,96vw);max-height:94dvh;padding:18px;overflow:auto;overscroll-behavior:contain;font:14px/1.5 'Poppins',sans-serif}
    .captureHybridEditor *{box-sizing:border-box}.captureHybridEditor::backdrop{background:#000b}
    .captureHybridEditor h2{margin:0;font:700 18px/1.3 'Orbitron',sans-serif}.captureHybridEditor header{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:-18px;background:#09222d;z-index:5;padding:8px 0;border-bottom:1px solid #426573}
    .captureHybridEditor button,.captureHybridEditor select,.captureHybridEditor input{font:inherit;min-height:44px;background:#143844;color:#e3f5fa;border:1px solid #72b5c2;border-radius:6px;padding:8px;max-width:100%}
    .captureHybridEditor button{cursor:pointer}.captureHybridEditor button:disabled{opacity:.5;cursor:default}
    .captureHybridEditor :focus-visible{outline:3px solid #ffcc55;outline-offset:2px}
    .captureHybridEditor label{display:flex;flex-direction:column;gap:4px}.captureHybridEditor p{margin:10px 0}
    .captureHybridEditor .hybridColumns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.captureHybridEditor .hybridFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}
    .captureHybridEditor canvas[data-photo]{display:block;width:auto;max-width:100%;max-height:340px;height:auto;margin:auto;touch-action:none;border:1px solid #5ba1ac}
    .captureHybridEditor canvas[data-plan]{width:100%;height:160px}.captureHybridEditor [data-status]{padding:10px;background:#153b47;border-left:3px solid #ffc966;min-height:44px}
    .captureHybridEditor [data-patches] button{margin:4px}.captureHybridEditor [data-patches] li{margin:6px 0}
    .captureHybridEditor h3{margin:10px 0 6px}.captureHybridEditor details{border:1px solid #426573;border-radius:8px;padding:10px;margin:12px 0}
    .captureHybridEditor summary{cursor:pointer;min-height:34px}.captureHybridEditor [data-thumbnails]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
    .captureHybridEditor [data-thumbnails] button{padding:3px;font-size:12px;overflow:hidden}.captureHybridEditor [data-thumbnails] img{width:100%;height:76px;object-fit:cover;display:block;border-radius:4px}
    .captureHybridEditor [aria-pressed=true]{outline:3px solid #ffcc55;outline-offset:-3px}.captureHybridEditor [data-wall-buttons]{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
    .captureHybridEditor .hybridWall{position:relative;width:100%;height:180px;margin:10px 0;touch-action:none;background:#817c72;background-image:linear-gradient(#fff3 1px,transparent 1px),linear-gradient(90deg,#fff3 1px,transparent 1px);background-size:25% 25%;border:2px solid #81bdc9;overflow:hidden}
    .captureHybridEditor .hybridWall [data-existing-region]{position:absolute;background:#263f47bb;border:1px solid #c8e4e8;pointer-events:none;font-size:12px;overflow:hidden}.captureHybridEditor [data-existing-region] img{width:100%;height:100%;display:block}
    .captureHybridEditor [data-placement]{position:absolute;border:3px solid #ffcc55;background:#ffcc5526;cursor:move;min-width:8px;min-height:8px;touch-action:none}
    .captureHybridEditor [data-placement] img{width:100%;height:100%;pointer-events:none;opacity:.85}.captureHybridEditor [data-resize]{position:absolute;width:30px;height:30px;right:-3px;bottom:-3px;background:#ffcc55;color:#132830;text-align:center;cursor:nwse-resize}
    .captureHybridEditor .hybridActions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.captureHybridEditor [data-add],.captureHybridEditor [data-save]{background:#186070}
    .captureHybridEditor .hybridBuilding{grid-column:1;grid-row:1}.captureHybridEditor .hybridPlacement{grid-column:1;grid-row:2}.captureHybridEditor .hybridPhoto{grid-column:2;grid-row:1/span 2}
    @media(max-width:700px){.captureHybridEditor .hybridColumns{display:flex;flex-direction:column}.captureHybridEditor .hybridBuilding{order:1}.captureHybridEditor .hybridPhoto{order:2}.captureHybridEditor .hybridPlacement{order:3}.captureHybridEditor{padding:12px}}
  </style><header><h2>Photos + mapped building</h2><button data-close aria-label="Close building preview">Close</button></header>
  <p>Tap a building side, choose a photo, then place it. Missing areas keep the mapped building. No measurements or 3D processing charge needed.</p>
  <p data-status role="status" aria-live="polite">Start by tapping a wall on the building, or use the side buttons.</p>
  <div class="hybridColumns"><section class="hybridBuilding" aria-label="Building side"><h3>1. Choose a building side</h3>
    <div data-viewer></div><div class="hybridActions"><button data-rotate>Rotate view</button><button data-closer>Zoom in</button><button data-farther>Zoom out</button><button data-reset>Reset view</button></div>
    <div data-wall-buttons aria-label="Choose a building side"></div><p data-side-label></p>
    <canvas data-plan aria-label="Building footprint, north up; highlighted wall matches the 3D selection" style="width:100%;height:auto"></canvas>
    <p data-orientation-help>North is up on this plan. Directions describe where each outside wall faces, not the camera direction. Match this outline to the map before placing photos.</p>
    <a data-map-context target="_blank" rel="noopener noreferrer">Check this building on the map</a>
    <button data-face-wall>Look straight at selected wall</button>
    <button data-mark-front>Mark selected wall as street-facing</button><p data-front-reference></p>
    <details data-map-panel><summary>See surrounding streets and match a wall</summary><div data-map-preview></div></details>
    </section><section class="hybridPlacement" aria-label="Wall placement"><h3>3. Place the photo on this side</h3><p>Start with the whole wall, or choose a grid section. Drag the yellow box to move it; drag its lower-right handle to resize.</p>
    <div class="hybridActions"><button data-whole>Whole wall</button><button data-tile>Grid section</button><label>Grid<select data-grid><option value="2">2 × 2</option><option value="4" selected>4 × 4</option><option value="8">8 × 8</option></select></label></div>
    <div class="hybridWall" data-wall-board aria-label="Wall placement. Drag the selected region or use arrow keys; Shift plus arrows resizes."><div data-existing></div><div data-placement tabindex="0" role="group" aria-label="Selected photo region"><img data-placement-image alt="Cropped photo preview" hidden><span data-resize aria-hidden="true">↘</span></div></div>
    <div class="hybridActions"><button data-add>Place photo on wall</button><button data-new>Add another photo patch</button></div>
    <ul data-patches aria-label="Placed photo patches"></ul><button data-undo>Undo last edit</button>
  </section><section class="hybridPhoto" aria-label="Photo alignment"><h3>2. Choose a photo and crop</h3>
    <div data-thumbnails aria-label="Your saved photos"></div><div class="hybridActions"><button data-prev-photos>Previous photos</button><span data-photo-page></span><button data-next-photos>More photos</button></div>
    <p>Drag the four yellow corners around the flat wall area in your photo. Keep sky and neighboring walls outside the outline.</p>
    <canvas data-photo aria-label="Photo corners. Tap four corners, drag handles, or use the coordinate fields below." tabindex="0"></canvas>
    <button data-clear>Redraw crop with four taps</button>
    <details data-advanced><summary>Advanced · exact crop, placement and building details</summary>
    <label>Saved photo<select data-photo-choice></select></label>
    <div class="hybridFields"><label>Selected corner<select data-corner><option value="0">1 · Top-left</option><option value="1">2 · Top-right</option><option value="2">3 · Bottom-right</option><option value="3">4 · Bottom-left</option></select></label>
    <label>Photo X (%)<input data-x type="number" min="0" max="100" step="0.1"></label><label>Photo Y (%)<input data-y type="number" min="0" max="100" step="0.1"></label></div>
    <label>Mapped wall<select data-wall></select></label><p>Wall percentages run from its numbered start corner to the next corner; height runs from ground to eaves. A close-up must cover only its actual portion, not the whole wall.</p>
    <div class="hybridFields"><label>Left (%)<input data-region="0" type="number" min="0" max="100" value="0"></label><label>Bottom (%)<input data-region="1" type="number" min="0" max="100" value="0"></label><label>Right (%)<input data-region="2" type="number" min="0" max="100" value="100"></label><label>Top (%)<input data-region="3" type="number" min="0" max="100" value="100"></label></div>
    <label>Preview wall / eaves height (metres)<input data-height type="number" min="1" max="1200" step="0.1"></label><p data-height-evidence></p>
    <div class="hybridFields"><label>Procedural roof<select data-roof><option value="unknown">Unknown · flat cap</option><option value="flat">Flat</option><option value="gabled">Gabled / pitched</option><option value="hipped">Hipped</option></select></label><label>Roof rise (metres)<input data-rise type="number" min="0.3" max="20" step="0.1" value="2"></label></div><button data-rebuild>Apply preview dimensions</button>
    <p>Photo patches retain shadows and objects visible in the source. Uncovered walls and the roof use procedural geometry, not observed details. Roof rise starts at a provisional 2 m. Dimension edits here do not alter the mapped world, doors or collisions.</p>
    </details>
    <p>This places the visible photo on a flat wall; it does not recover hidden detail or remove objects in the photo. Rotate the building to check your work.</p>
  </section></div><button data-save>Save private preview to account</button>
    <p data-saved role="status"></p>
    <section data-recovery hidden><p data-recovery-copy></p><button data-recover>Restore unsaved placements</button><button data-discard-recovery>Discard device draft</button></section>
    <section data-publication hidden><h3>Send these walls for approval</h3>
    <p>Only the cropped wall images are submitted. Your original photos stay private. Approval adds these patches to this mapped building; uncovered areas remain unchanged.</p>
    <button data-submit>Submit saved walls for approval</button><p data-submission role="status"></p></section>
  `;
  const $=s=>dialog.querySelector(s), cache=new Map(), snapshots=[], thumbs=new Map(),patchThumbs=new Map();
  if(inWorld){$('[data-close]').textContent='Back to photos';$('[data-close]').setAttribute('aria-label',capture.authoredLayout?'Back to interior':'Back to photos');}
  const deviceOnly=saveScope==='device',savedWhere=deviceOnly?'on this device':'to account';
  if(deviceOnly)$('[data-save]').textContent='Save preview in my local world';
  if(capture.authoredLayout)$('[data-save]').textContent='Save room photos and home layout';
  let preview=structuredClone(capture.hybridPreview||{revision:0,footprintSignature:capture.footprintSignature,heightMeters:capture.building?.spatialContext?.wallHeightMeters||capture.buildingDetails?.heightMeters||capture.building?.spatialContext?.height?.meters||6,roofShape:['flat','gabled','hipped'].includes(capture.buildingDetails?.roofShape)?capture.buildingDetails.roofShape:'unknown',roofRiseMeters:2,patches:[]});
  if(isRoom){preview.room=normalizeManualRoom(preview.room||capture.room);preview.heightMeters=preview.room.heightMeters;preview.roofShape='flat';}
  const presentationBuilding=()=>isRoom?{...capture.building,manualRoom:preview.room}:capture.building;
  if(isRoom){
    dialog.setAttribute('aria-label','Edit private room photos');
    dialog.querySelector('h2').textContent='Your private room';
    dialog.querySelector('header + p').textContent='Choose a wall, floor or ceiling, then place a cropped photo. This room stays private; public sharing requires your choice and approval.';
    $('[data-advanced] summary').textContent='Advanced · room dimensions and exact placement';
    $('[data-height]').min='1.8';$('[data-height]').max='12';
    $('[data-roof]').closest('.hybridFields').hidden=true;
    const dimensions=document.createElement('div');dimensions.className='hybridFields';
    dimensions.innerHTML='<label>Room width (m)<input data-room-edit-width type="number" min="1.5" max="80" step="0.1"></label><label>Room length (m)<input data-room-edit-length type="number" min="1.5" max="80" step="0.1"></label>';
    $('[data-rebuild]').before(dimensions);
    $('[data-room-edit-width]').value=preview.room.widthMeters;$('[data-room-edit-length]').value=preview.room.lengthMeters;
    $('[data-publication] h3').textContent='Review this room';
    $('[data-publication] p').textContent='Cropped images remain protected. Submitting for review does not make your room public.';
    $('[data-submit]').textContent='Submit private room for review';
    dialog.querySelector('.hybridBuilding h3').textContent='1. Choose a room surface';
    if(capture.authoredLayout){$('[data-rebuild]').hidden=true;dimensions.hidden=true;$('[data-height]').closest('label').hidden=true;$('[data-height-evidence]').hidden=true;}
  }
  let quad=[],selected=0,bitmap=null,viewer=null,busy=false,closed=false,editId=null,drag=false,dirty=false,highlight=null,photoPage=0,thumbnailBusy=false;
  let showPhotos=true,photoMeshes=[];
  const compare=document.createElement('button');compare.textContent='Show without photos';compare.setAttribute('aria-pressed','false');$('[data-reset]').after(compare);
  compare.onclick=()=>{showPhotos=!showPhotos;for(const mesh of photoMeshes)mesh.visible=showPhotos;compare.textContent=showPhotos?'Show without photos':'Show photo placements';compare.setAttribute('aria-pressed',String(!showPhotos));};
  const localKey=JSON.stringify(['capture-wall-edit-v1',capture.ownerUid,capture.captureId,...(capture.authoredRoomId?[capture.authoredRoomId]:[])]);
  let recovery=null;
  try { recovery=(await loadLocalCaptureDraft(localKey)).draft; } catch { /* Account Save still works when device storage is unavailable. */ }
  const status=t=>{$('[data-status]').textContent=t;};
  $('[data-publication]').hidden=typeof submit!=='function';
  if(preview.revision)$('[data-saved]').textContent=`Saved ${savedWhere} · revision ${preview.revision} · ${preview.patches.length} photo patches.`;
  const active=()=>{abort.signal.throwIfAborted();signal.throwIfAborted();};
  function setBusy(value){busy=value;dialog.querySelectorAll('button:not([data-close]),input,select').forEach(e=>e.disabled=value);pageButtons();}
  function pageButtons(){$('[data-prev-photos]').disabled=busy||thumbnailBusy||photoPage===0;$('[data-next-photos]').disabled=busy||thumbnailBusy||(photoPage+1)*6>=photos.length;}
  async function run(fn){if(busy||closed)return;setBusy(true);try{await fn();}catch(e){if(!closed)status(e.message);}finally{
    if(dirty&&!closed){
      try { await saveLocalCaptureDraft({id:localKey,baseRevision:preview.revision,preview:structuredClone(preview)});$('[data-saved]').textContent='Placements saved on this device for recovery. Save to account to use them on your other devices.'; }
      catch { $('[data-saved]').textContent='Unsaved changes. Device recovery is unavailable; save to account before closing.'; }
    }
    if(!closed)setBusy(false);
  }}
  function close(){if(closed)return;closed=true;abort.abort();viewer?.dispose();for(const b of cache.values())b.close?.();cache.clear();thumbs.clear();signal.removeEventListener('abort',close);dialog.captureStepDispose?.();dialog.close();dialog.remove();onClose?.();}
  signal.addEventListener('abort',close,{once:true});
  if(recovery?.preview){
    $('[data-recovery]').hidden=false;
    const same=recovery.baseRevision===preview.revision&&recovery.preview.footprintSignature===preview.footprintSignature;
    $('[data-recover]').hidden=false;
    $('[data-recovery-copy]').textContent=same?'This device has unsaved photo placements from your last visit. Inspect them or keep the account version.':`Device edits were based on version ${recovery.baseRevision}; your account is version ${preview.revision}. Inspect them before explicitly saving. Nothing is overwritten automatically.`;
  }
  $('[data-recover]').onclick=()=>run(async()=>{if(recovery.preview.footprintSignature!==preview.footprintSignature)throw Error('The mapped outline changed. Keep this device draft; its photos must be aligned with the updated building before saving.');const currentRevision=preview.revision;remember();preview={...structuredClone(recovery.preview),revision:currentRevision};dirty=true;$('[data-height]').value=preview.heightMeters;$('[data-roof]').value=preview.roofShape;$('[data-rise]').value=preview.roofRiseMeters;$('[data-recovery]').hidden=true;await rebuild();status('Inspecting device placements. Save explicitly to replace the account placements with this draft, or Undo to return to the account version.');});
  $('[data-discard-recovery]').onclick=()=>run(async()=>{await deleteLocalCaptureDraft(localKey);recovery=null;$('[data-recovery]').hidden=true;});
  const requestClose=()=>{if(busy){status('Wait for the current operation to finish before closing.');return;}if(dirty&&!confirm('These edits have not been saved to your account. Close the editor and keep only the device recovery draft?'))return;close();};
  mountCaptureStep(dialog,{building:capture.building,section:capture.authoredLayout?'Interior · room photos':'Exterior · photo placement',requestClose,parentLabel:capture.authoredLayout?'Back to floor plan':'Back to building'});
  $('[data-close]').onclick=requestClose;dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});
  const photoSelect=$('[data-photo-choice]');
  const photoName=document.createElement('label');photoName.textContent='Photo label (optional)';const nameInput=document.createElement('input');nameInput.maxLength=60;nameInput.dataset.photoName='';photoName.append(nameInput);$('[data-photo]').before(photoName);
  const photoTitle=(id,index)=>preview.photoLabels?.[id]||`Photo ${index+1}`;
  nameInput.onchange=()=>run(async()=>{remember();preview.photoLabels={...preview.photoLabels,[photoSelect.value]:nameInput.value.trim()};for(const [i,p] of photos.entries())photoSelect.options[i].textContent=photoTitle(p.id,i);await loadThumbnails();status('Photo label updated in this draft. Save to keep it across devices.');});
  const rotateCrop=document.createElement('button');rotateCrop.textContent='Rotate photo 90°';rotateCrop.dataset.rotatePhoto='';$('[data-clear]').after(rotateCrop);
  rotateCrop.onclick=()=>{if(busy||quad.length!==4)return;quad=[quad[3],quad[0],quad[1],quad[2]];drawPhoto();cropPreview();status('Photo orientation adjusted. Choose Place photo to apply this crop.');};
  photos.forEach((p,i)=>photoSelect.add(new Option(photoTitle(p.id,i),p.id)));
  const directions=wallDirections(pts);
  let mapContext=null;
  $('[data-map-panel]').hidden=isRoom;
  $('[data-map-panel]').addEventListener('toggle',()=>{if($('[data-map-panel]').open&&!mapContext){mapContext=mountCaptureMap($('[data-map-preview]'),capture.building,pts,selectWall,abort.signal);mapContext.select(Number($('[data-wall]').value));}});
  const surfaceNames=isRoom?[...pts.map((_,i)=>`Wall ${i+1}`),'Floor','Ceiling']:directions.map(d=>`Wall ${d.wall+1} · faces ${d.compass} · ${d.length.toFixed(1)} m`);
  const geo=capture.building;
  $('[data-map-context]').hidden=isRoom||!Number.isFinite(geo?.lat)||!Number.isFinite(geo?.lon);
  if(!$('[data-map-context]').hidden)$('[data-map-context]').href=`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=19/${geo.lat}/${geo.lon}`;
  if(isRoom){$('[data-orientation-help]').textContent='Room plan: wall numbers match this room’s saved layout. This local room view does not imply a street-facing side.';$('[data-face-wall]').hidden=true;$('[data-mark-front]').hidden=true;}
  surfaceNames.forEach((label,i)=>$('[data-wall]').add(new Option(label,String(i))));
  surfaceNames.forEach((label,i)=>{const b=document.createElement('button');b.textContent=isRoom?label:`${i+1} · ${directions[i].compass}`;b.dataset.side=i;b.onclick=()=>selectWall(i);$('[data-wall-buttons]').append(b);});
  $('[data-height]').value=preview.heightMeters;
  $('[data-roof]').value=preview.roofShape||'unknown';$('[data-rise]').value=preview.roofRiseMeters||2;
  $('[data-height-evidence]').textContent=capture.buildingDetails?.heightMeters?'Starting height: your unverified measurement.':capture.building?.spatialContext?.height?.meters?`Starting height: ${capture.building.spatialContext.height.evidence} map snapshot. Check this against the actual eaves; it may include the roof or be inaccurate.`:'No mapped height; 6 m is only a provisional preview value.';
  async function photo(id){
    if(cache.has(id))return cache.get(id);
    const data=await loadPhoto(id,abort.signal);active();
    if(!(data instanceof Blob)||data.size>32*1024*1024)throw Error('Photo exceeds the private preview limit.');
    const image=await createImageBitmap(data,{imageOrientation:'from-image',resizeWidth:2048,resizeQuality:'high'});
    if(closed){image.close();active();}
    // Keep only the current photo and patch inputs, with a hard working-set cap.
    if(cache.size>=4){const key=cache.keys().next().value;cache.get(key).close();cache.delete(key);}
    cache.set(id,image);return image;
  }
  const getRegion=()=>[...dialog.querySelectorAll('[data-region]')].map(e=>Number(e.value)/100);
  function setRegion(region){dialog.querySelectorAll('[data-region]').forEach(e=>e.value=Number((region[Number(e.dataset.region)]*100).toFixed(2)));drawPlacement();}
  function boxStyle(el,r){el.style.left=`${r[0]*100}%`;el.style.top=`${(1-r[3])*100}%`;el.style.width=`${(r[2]-r[0])*100}%`;el.style.height=`${(r[3]-r[1])*100}%`;}
  function drawPlacement(){
    const r=getRegion();boxStyle($('[data-placement]'),r);
    const existing=$('[data-existing]');existing.replaceChildren();
    preview.patches.filter(p=>p.wall===Number($('[data-wall]').value)&&p.id!==editId).forEach(p=>{const el=document.createElement('div');el.dataset.existingRegion=p.id;const image=document.createElement('img');image.alt='Placed photo';if(patchThumbs.has(p.id)){image.src=patchThumbs.get(p.id);el.append(image);}else el.textContent='Placed photo';boxStyle(el,p.region);existing.append(el);});
    $('[data-placement]').setAttribute('aria-label',`Photo region: left ${Math.round(r[0]*100)}%, bottom ${Math.round(r[1]*100)}%, right ${Math.round(r[2]*100)}%, top ${Math.round(r[3]*100)}%. Arrow keys move; Shift plus arrows resize.`);
  }
  function cropPreview(){
    try{if(!bitmap||quad.length!==4)throw Error('Incomplete crop');const c=rectifyPhoto(bitmap,quad,1,192);$('[data-placement-image]').src=c.toDataURL('image/jpeg',.8);$('[data-placement-image]').hidden=false;c.width=c.height=0;}
    catch{$('[data-placement-image]').hidden=true;}
  }
  function selectWall(wall,internal=false){
    if((busy&&!internal)||closed)return;
    $('[data-wall]').value=wall;editId=null;drawPlan();drawPlacement();
    mapContext?.select(wall);
    dialog.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.side)===wall)));
    $('[data-side-label]').textContent=`Selected: ${$('[data-wall]').selectedOptions[0].textContent}. Yellow shows the selected surface.`;
    if(highlight){const mesh=buildWallPatch(T,presentationBuilding(),preview.heightMeters,{wall,region:[0,0,1,1]},null);highlight.geometry.dispose();highlight.geometry=mesh.geometry;mesh.material.dispose();viewer?.redraw();}
  }
  function pickWall({point}){
    if(busy||point.y<0||point.y>preview.heightMeters+.02)return;
    if(isRoom&&(point.y<.02||Math.abs(point.y-preview.heightMeters)<.02)){
      selectWall(point.y<.02?pts.length:pts.length+1);return;
    }
    let best=-1,distance=Infinity;
    pts.forEach((a,i)=>{const b=pts[(i+1)%pts.length],dx=b.x-a.x,dz=b.z-a.z,u=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz))),d=Math.hypot(point.x-a.x-u*dx,point.z-a.z-u*dz);if(d<distance){distance=d;best=i;}});
    if(best>=0&&distance<.1){selectWall(best);status(`Side ${best+1} selected. Choose a photo, crop it, then place it on this wall.`);}
  }
  async function thumbnailPage(){
    if(thumbnailBusy)return;thumbnailBusy=true;pageButtons();
    try{
    const host=$('[data-thumbnails]');host.replaceChildren();
    const start=photoPage*6;
    $('[data-photo-page]').textContent=`${start+1}–${Math.min(start+6,photos.length)} of ${photos.length}`;
    for(const [offset,p] of photos.slice(start,start+6).entries()){
      active();const b=document.createElement('button');b.dataset.photoId=p.id;b.setAttribute('aria-label',`Choose saved photo ${start+offset+1}`);b.setAttribute('aria-pressed',String(photoSelect.value===p.id));b.textContent='Loading photo…';host.append(b);
      b.onclick=()=>run(async()=>{photoSelect.value=p.id;await selectPhoto();status('Photo selected. Adjust the yellow crop corners, then choose Place photo on wall.');});
      try{
        if(!thumbs.has(p.id)){const blob=await loadPhoto(p.id,abort.signal);active();if(!(blob instanceof Blob)||blob.size>32*1024*1024)throw Error('Photo exceeds preview limit');const image=await createImageBitmap(blob,{imageOrientation:'from-image',resizeWidth:160});try{active();const c=document.createElement('canvas');c.width=160;c.height=Math.max(1,Math.round(image.height/image.width*160));c.getContext('2d').drawImage(image,0,0,c.width,c.height);thumbs.set(p.id,c.toDataURL('image/jpeg',.75));c.width=c.height=0;}finally{image.close();}}
        const img=document.createElement('img');img.src=thumbs.get(p.id);img.alt=`Saved photo ${start+offset+1}`;const uses=[...new Set(preview.patches.filter(patch=>patch.photoId===p.id).map(patch=>surfaceNames[patch.wall]))];b.replaceChildren(img,document.createTextNode(`${photoTitle(p.id,start+offset)} · ${uses.length?uses.join(', '):'Not placed'}`));
      }catch(e){active();b.textContent=`Photo ${start+offset+1} · tap to retry`;}
    }
    }finally{thumbnailBusy=false;if(!closed)pageButtons();}
  }
  function coordinates(){const p=quad[selected];$('[data-corner]').value=selected;$('[data-x]').value=p?(p[0]*100).toFixed(1):'';$('[data-y]').value=p?(p[1]*100).toFixed(1):'';}
  function drawPhoto(updateFields=true){
    const c=$('[data-photo]');if(!bitmap)return;
    c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
    ctx.strokeStyle='#ffcb55';ctx.lineWidth=c.width/220;ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(p[0]*c.width,p[1]*c.height):ctx.moveTo(p[0]*c.width,p[1]*c.height));if(quad.length===4)ctx.closePath();ctx.stroke();
    quad.forEach((p,i)=>{ctx.fillStyle=i===selected?'#fff':'#ffcb55';ctx.beginPath();ctx.arc(p[0]*c.width,p[1]*c.height,c.width/65,0,Math.PI*2);ctx.fill();ctx.fillStyle='#05202b';ctx.font=`bold ${c.width/48}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p[0]*c.width,p[1]*c.height);});if(updateFields)coordinates();
  }
  async function selectPhoto(){nameInput.value=preview.photoLabels?.[photoSelect.value]||'';bitmap=await photo(photoSelect.value);active();quad=[[.08,.08],[.92,.08],[.92,.92],[.08,.92]];selected=0;editId=null;drawPhoto();cropPreview();drawPlacement();dialog.querySelectorAll('[data-photo-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.photoId===photoSelect.value)));}
  function drawPlan(){
    $('[data-front-reference]').textContent=Number.isInteger(preview.streetFacingWall)?`Your street-facing reference: wall ${preview.streetFacingWall+1}. User supplied—not verified map data.`:isRoom?'':'Street-facing side not identified. Check the map, then mark the correct wall.';
    const c=$('[data-plan]');c.width=640;c.height=320;const ctx=c.getContext('2d');ctx.clearRect(0,0,640,320);
    const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minx=Math.min(...xs),minz=Math.min(...zs),dx=Math.max(...xs)-minx,dz=Math.max(...zs)-minz,scale=Math.min(500/dx,220/dz);
    const xy=p=>[70+(p.x-minx)*scale,50+(p.z-minz)*scale];ctx.fillStyle='#cdebf1';ctx.font='20px system-ui';ctx.fillText('N ↑',560,32);
    pts.forEach((p,i)=>{const a=xy(p),b=xy(pts[(i+1)%pts.length]);ctx.strokeStyle=i===Number($('[data-wall]').value)?'#ffcb55':'#7fb1bc';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(String(i+1),(a[0]+b[0])/2,(a[1]+b[1])/2-8);ctx.fillStyle='#ffcb55';ctx.fillRect(a[0]-3,a[1]-3,6,6);});
    const entrance=!isRoom&&capture.building?.spatialContext?.entrance;
    if(entrance){const [x,y]=xy(entrance);ctx.fillStyle='#4edb97';ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.fillText('Entrance reference',20,310);}
    if(isRoom){ctx.clearRect(550,0,90,40);ctx.fillStyle='#cdebf1';ctx.fillText('Room',550,32);}
  }
  function remember(){snapshots.push(structuredClone(preview));if(snapshots.length>10)snapshots.shift();dirty=true;$('[data-saved]').textContent='Unsaved preview changes.';}
  function patchList(){
    const ul=$('[data-patches]');ul.replaceChildren();
    preview.patches.forEach(p=>{const li=document.createElement('li');li.append(`${surfaceNames[p.wall]} · ${photoTitle(p.photoId,photos.findIndex(x=>x.id===p.photoId))} `);
      const replace=document.createElement('button');replace.textContent='Replace with selected photo';replace.onclick=()=>run(async()=>{validateQuad(quad);remember();p.photoId=photoSelect.value;p.quad=structuredClone(quad);await rebuild();status('The selected photo and crop replaced this placement. Its surface and region are unchanged. Save to keep it.');});li.append(replace);
      const destination=document.createElement('select');destination.setAttribute('aria-label',`Move photo patch ${p.id} to surface`);
      surfaceNames.forEach((name,i)=>destination.add(new Option(name,String(i))));destination.value=String(p.wall);
      const relocate=document.createElement('button');relocate.textContent='Move to this surface';
      relocate.onclick=()=>run(async()=>{const wall=Number(destination.value);if(wall===p.wall)return;if(preview.patches.some(q=>q.id!==p.id&&q.wall===wall&&Math.min(q.region[2],p.region[2])-Math.max(q.region[0],p.region[0])>.001&&Math.min(q.region[3],p.region[3])-Math.max(q.region[1],p.region[1])>.001))throw Error('That surface already has a photo here. Choose an empty surface or adjust its existing photo first.');remember();p.wall=wall;if(!isRoom)p.orientationVersion=2;selectWall(wall,true);await rebuild();status('Photo moved in this draft. Check crop and proportions on the new surface, then save and submit for review. The live building is unchanged.');});
      if(!isRoom&&p.orientationVersion!==2)li.append('Older image orientation retained. Adjusting or moving uses the corrected outside-facing orientation. ');
      li.append(destination,relocate);
      const edit=document.createElement('button');edit.textContent='Adjust';edit.onclick=()=>run(async()=>{photoSelect.value=p.photoId;bitmap=await photo(p.photoId);quad=structuredClone(p.quad);selected=0;selectWall(p.wall,true);editId=p.id;setRegion(p.region);drawPhoto();cropPreview();status('Adjust this patch, then choose Place photo on wall to update it.');});
      const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>run(async()=>{remember();preview.patches=preview.patches.filter(x=>x.id!==p.id);await rebuild();});li.append(edit,remove);ul.append(li);
    });
  }
  async function rebuild(){
    photoMeshes=[];
    active();patchThumbs.clear();if(isRoom)pts=manualRoomFootprint(preview.room);const group=buildHybridShell(T,presentationBuilding(),preview.heightMeters,preview);
    try{
      highlight=buildWallPatch(T,presentationBuilding(),preview.heightMeters,{wall:Number($('[data-wall]').value),region:[0,0,1,1]},null);
      highlight.material.color.set('#ffcc55');highlight.material.transparent=true;highlight.material.opacity=.22;highlight.material.depthWrite=false;highlight.material.polygonOffsetFactor=-1;highlight.material.polygonOffsetUnits=-1;group.add(highlight);
      for(const p of preview.patches){const b=await photo(p.photoId);active();const a=pts[p.wall],end=pts[(p.wall+1)%pts.length];const size=isRoom?manualRoomSurfaceSize(preview.room,p.wall):[Math.hypot(end.x-a.x,end.z-a.z),preview.heightMeters];const aspect=size[0]*(p.region[2]-p.region[0])/(size[1]*(p.region[3]-p.region[1]));const canvas=rectifyPhoto(b,p.quad,aspect),texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;const mesh=buildWallPatch(T,presentationBuilding(),preview.heightMeters,p,texture);mesh.visible=showPhotos;photoMeshes.push(mesh);group.add(mesh);const thumb=document.createElement('canvas');thumb.width=192;thumb.height=192;thumb.getContext('2d').drawImage(canvas,0,0,192,192);patchThumbs.set(p.id,thumb.toDataURL('image/jpeg',.75));thumb.width=thumb.height=0;}
      active();const view=viewer?.getView();viewer?.dispose();viewer=await createCaptureViewer($('[data-viewer]'),null,abort.signal,{model:group,alignment:{},fitScale:.65,view,onPick:pickWall,label:'Tap a wall to select it. Drag to rotate; pinch or scroll to zoom. Side buttons also select walls.'});
      active();bitmap=await photo(photoSelect.value);drawPhoto();cropPreview();patchList();drawPlacement();await thumbnailPage();
    }catch(e){group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});throw e;}
  }
  photoSelect.onchange=()=>run(selectPhoto);$('[data-wall]').onchange=()=>selectWall(Number($('[data-wall]').value));
  $('[data-face-wall]').onclick=()=>{const d=directions[Number($('[data-wall]').value)];if(!d||!viewer)return;viewer.faceDirection(d.normal);};
  $('[data-mark-front]').onclick=()=>{if(busy)return;remember();preview.streetFacingWall=Number($('[data-wall]').value);drawPlan();status('Street-facing reference marked. Save to account to keep it; existing photos have not been moved.');};
  const loadThumbnails=()=>thumbnailPage().catch(e=>{if(!closed)status(e.message);});
  $('[data-prev-photos]').onclick=()=>{photoPage=Math.max(0,photoPage-1);void loadThumbnails();};
  $('[data-next-photos]').onclick=()=>{photoPage=Math.min(Math.ceil(photos.length/6)-1,photoPage+1);void loadThumbnails();};
  $('[data-whole]').onclick=()=>setRegion([0,0,1,1]);
  $('[data-tile]').onclick=()=>{const n=Number($('[data-grid]').value);setRegion([0,1-1/n,1/n,1]);status('Drag this section to the part of the wall shown in your crop. Use another patch for the next section.');};
  $('[data-grid]').onchange=()=>{$('[data-wall-board]').style.backgroundSize=`${100/Number($('[data-grid]').value)}% ${100/Number($('[data-grid]').value)}%`;};
  dialog.querySelectorAll('[data-region]').forEach(e=>e.oninput=drawPlacement);
  const board=$('[data-wall-board]'),placement=$('[data-placement]');let move=null;
  board.onpointerdown=e=>{
    if(busy)return;e.preventDefault();const rect=board.getBoundingClientRect();
    if(!e.target.closest('[data-placement]')){const n=Number($('[data-grid]').value),x=Math.min(n-1,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*n))),y=Math.min(n-1,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*n)));setRegion([x/n,1-(y+1)/n,(x+1)/n,1-y/n]);}
    move={id:e.pointerId,x:e.clientX,y:e.clientY,r:getRegion(),rect,resize:!!e.target.closest('[data-resize]')};board.setPointerCapture(e.pointerId);
  };
  function shiftRegion(r,dx,dy,resize){
    if(resize)return [r[0],Math.max(0,Math.min(r[3]-.02,r[1]+dy)),Math.max(r[0]+.02,Math.min(1,r[2]+dx)),r[3]];
    dx=Math.max(-r[0],Math.min(1-r[2],dx));dy=Math.max(-r[1],Math.min(1-r[3],dy));return [r[0]+dx,r[1]+dy,r[2]+dx,r[3]+dy];
  }
  board.onpointermove=e=>{if(move?.id===e.pointerId&&!busy)setRegion(shiftRegion(move.r,(e.clientX-move.x)/move.rect.width,-(e.clientY-move.y)/move.rect.height,move.resize));};
  board.onpointerup=board.onpointercancel=()=>{move=null;};
  placement.onkeydown=e=>{const d={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,.01],ArrowDown:[0,-.01]}[e.key];if(d&&!busy){e.preventDefault();setRegion(shiftRegion(getRegion(),...d,e.shiftKey));}};
  $('[data-corner]').onchange=()=>{selected=Number($('[data-corner]').value);drawPhoto();};
  const c=$('[data-photo]');const pointer=e=>{const r=c.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  c.onpointerdown=e=>{if(busy)return;e.preventDefault();const p=pointer(e);if(quad.length<4){selected=quad.length;quad.push(p);}else{selected=quad.reduce((best,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(quad[best][0]-p[0],quad[best][1]-p[1])?i:best,0);quad[selected]=p;}drag=true;c.setPointerCapture(e.pointerId);drawPhoto();};
  c.onpointermove=e=>{if(drag&&!busy){quad[selected]=pointer(e);drawPhoto();}};c.onpointerup=c.onpointercancel=()=>{drag=false;cropPreview();};
  // Do not rewrite the focused fields while a person is entering a coordinate:
  // blur-time formatting can move the caret and silently change their number.
  for(const key of ['x','y'])$(`[data-${key}]`).oninput=()=>{if($('[data-x]').value===''||$('[data-y]').value==='')return;const x=Number($('[data-x]').value)/100,y=Number($('[data-y]').value)/100;if([x,y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&selected<=quad.length){quad[selected]=[x,y];drawPhoto(false);cropPreview();}};
  c.onkeydown=e=>{const offset={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]}[e.key];if(offset&&quad[selected]&&!busy){e.preventDefault();quad[selected]=quad[selected].map((v,i)=>Math.max(0,Math.min(1,v+offset[i]*(e.shiftKey?10:1))));drawPhoto();cropPreview();}};
  $('[data-clear]').onclick=()=>{quad=[];selected=0;drawPhoto();cropPreview();};
  $('[data-new]').onclick=()=>run(async()=>{await selectPhoto();setRegion([0,0,1,1]);status('Choose a photo and wall. For a smaller patch, choose Grid section or tap the wall grid.');});
  $('[data-add]').onclick=()=>run(async()=>{
    validateQuad(quad);const region=[...dialog.querySelectorAll('[data-region]')].map(e=>Number(e.value)/100),wall=Number($('[data-wall]').value);
    const patch={id:editId||crypto.randomUUID(),photoId:photoSelect.value,quad:structuredClone(quad),wall,region,...(!isRoom?{orientationVersion:2}:{})};
    const check=buildWallPatch(T,presentationBuilding(),preview.heightMeters,patch,null);check.geometry.dispose();check.material.dispose();
    if(preview.patches.some(p=>p.id!==editId&&p.wall===wall&&Math.min(p.region[2],region[2])-Math.max(p.region[0],region[0])>.001&&Math.min(p.region[3],region[3])-Math.max(p.region[1],region[1])>.001))throw Error('This overlaps an existing patch. Adjust that patch or choose a separate wall region.');
    if(!editId&&preview.patches.length>=16)throw Error('This preview supports 16 patches. Adjust an existing patch to improve it.');
    remember();preview.patches=preview.patches.filter(p=>p.id!==editId);preview.patches.push(patch);editId=patch.id;await rebuild();status('Photo patch applied. Rotate the building and check alignment before saving.');
  });
  $('[data-rebuild]').onclick=()=>run(async()=>{const height=Number($('[data-height]').value),rise=Number($('[data-rise]').value);if(!Number.isFinite(height)||height<1||height>1200||!Number.isFinite(rise)||rise<.3||rise>20)throw Error('Enter valid wall and roof dimensions.');const room=isRoom?normalizeManualRoom({widthMeters:Number($('[data-room-edit-width]').value),lengthMeters:Number($('[data-room-edit-length]').value),heightMeters:height}):null;remember();if(room)preview.room=room;preview.heightMeters=height;preview.roofShape=$('[data-roof]').value;preview.roofRiseMeters=rise;await rebuild();status('Preview dimensions updated; mapped geometry is unchanged.');});
  $('[data-undo]').onclick=()=>run(async()=>{if(!snapshots.length)return;const revision=preview.revision;preview=snapshots.pop();preview.revision=revision;dirty=true;$('[data-height]').value=preview.heightMeters;editId=null;await rebuild();status('Last preview edit undone. Save to keep this version.');});
  $('[data-save]').onclick=()=>run(async()=>{
    $('[data-saved]').textContent='Saving your photo placements…';
    try {const result=await save({...preview,baseRevision:preview.revision});active();preview=structuredClone(result.preview);dirty=false;await deleteLocalCaptureDraft(localKey).catch(()=>{});$('[data-recovery]').hidden=true;$('[data-saved]').textContent=`Saved ${savedWhere} · revision ${preview.revision} · ${preview.patches.length} photo patches.`;status(deviceOnly?'Saved to your local world preview. Close the editor to see this building. Nothing was uploaded or published.':'Saved. Submit these walls when you are ready for approval.');}
    catch(error){$('[data-saved]').textContent=`Not saved: ${error.message}. Keep this editor open and retry.`;throw error;}
  });
  $('[data-submit]').onclick=()=>run(async()=>{
    if(dirty||!preview.revision)throw Error('Save your latest photo placements before submitting.');
    if(!preview.patches.length)throw Error('Place at least one photo on a wall first.');
    if(!confirm(`Submit revision ${preview.revision} with ${preview.patches.length} photo placements on ${new Set(preview.patches.map(p=>p.wall)).size} surfaces? Original photos stay private. ${isRoom?'Interior access stays private unless separately requested and approved.':'The exterior changes for everyone only after approval.'}`))return;
    $('[data-submission]').textContent='Preparing your cropped wall images for review…';
    try {const result=await submit(preview.revision);active();$('[data-submission]').textContent=`Revision ${result.revision} · ${result.status==='approved'?'Approved':'Submitted for approval'}. Your saved edits remain available.`;status('Submission recorded. The building changes after approval, not merely after saving.');}
    catch(error){$('[data-submission]').textContent=`Not submitted: ${error.message}. Your saved edits are safe.`;throw error;}
  });
  $('[data-rotate]').onclick=()=>viewer?.rotate();$('[data-reset]').onclick=()=>viewer?.reset();
  $('[data-closer]').onclick=()=>viewer?.zoom(.8);$('[data-farther]').onclick=()=>viewer?.zoom(1.25);
  document.body.append(dialog);dialog.showModal();
  await run(async()=>{await selectPhoto();selectWall(Number.isInteger(initialWall)&&initialWall>=0&&initialWall<$('[data-wall]').options.length?initialWall:0,true);await rebuild();});
  void loadThumbnails();
  if(notice)status(notice);
  return {close,getState:()=>({revision:preview.revision,patches:preview.patches.length,dirty,closed,selectedWall:Number($('[data-wall]').value),selectedPhoto:photoSelect.value,region:getRegion(),quad,buildingId:capture.building.sourceBuildingId})};
}
