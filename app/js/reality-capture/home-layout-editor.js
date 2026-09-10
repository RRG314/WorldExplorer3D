import './capture-theme.js';
import {makeStarterLayout,normalizeLayout,assertPlayableLayout,floorWalls,roomRing,wallKey,layoutRoomDescriptor,roomInteriorPoint,splitRoom} from '../../../functions/interior-layout.mjs';
import {loadClassicScript} from '../modules/script-loader.js?v=56';
import {vendorScriptsCritical} from '../modules/manifest.js?v=597';
import {buildAuthoredInterior} from '../interiors/authored-geometry.js';
import {createCaptureViewer} from './result-viewer.js?v=1';
import {loadLocalCaptureDraft,saveLocalCaptureDraft,deleteLocalCaptureDraft} from './local-draft-store.js?v=1';
import {capturePhoneUrl} from './capture-session.js?v=1';
import {drawRectangleRoom,nearestPlanWall,snapPlanPoint} from './layout-drawing.js';
import {migrateLegacyRoom} from './legacy-room.js';

export async function openHomeLayoutEditor({capture,save,signal,photos=[],loadPhoto,submit,inWorld=false,importPhotos,refreshPhotos}) {
  signal.throwIfAborted();
  if(!globalThis.THREE)await loadClassicScript(vendorScriptsCritical[0]);
  const envelope={footprint:capture.building?.spatialContext?.footprint,holes:capture.building?.spatialContext?.holes||[],heightMeters:capture.building?.spatialContext?.wallHeightMeters||capture.building?.spatialContext?.height?.meters||3,revision:capture.footprintSignature};
  let legacy=null;
  try{legacy=migrateLegacyRoom(capture,envelope);}catch(error){const {openHybridEditor}=await import('./hybrid-editor.js?v=1');const editor=await openHybridEditor({capture,save,signal,photos,loadPhoto,submit,inWorld,notice:'Your saved room is preserved in its original editor because it cannot safely fit the mapped home layout. No photos were moved or removed.'});return editor;}
  const dialog=document.createElement('dialog');dialog.className=`homeLayoutEditor${inWorld?' captureInWorld':''}`;
  dialog.innerHTML=`<style>
  .homeLayoutEditor{width:min(1100px,96vw);max-height:94dvh;background:#09222d;color:#e3f5fa;border:1px solid #72b5c2;padding:16px;font:14px/1.5 Poppins,sans-serif;overflow:auto}.homeLayoutEditor::backdrop{background:#000b}.homeLayoutEditor *{box-sizing:border-box}.homeLayoutEditor h2{font-size:19px;margin:0}.homeLayoutEditor header,.homeLayoutEditor nav,.homeLayoutEditor .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.homeLayoutEditor header{justify-content:space-between}.homeLayoutEditor button,.homeLayoutEditor input,.homeLayoutEditor select{font:inherit;min-height:44px;background:#143844;color:inherit;border:1px solid #72b5c2;padding:8px;max-width:100%}.homeLayoutEditor button{cursor:pointer}.homeLayoutEditor button:disabled{opacity:.5}.homeLayoutEditor label{display:flex;flex-direction:column;gap:4px}.homeLayoutEditor .fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.homeLayoutEditor [data-status]{min-height:44px;padding:8px;background:#153b47;border-left:3px solid #ffc966}.homeLayoutEditor svg{width:100%;height:400px;background:#102f3a;touch-action:none}.homeLayoutEditor [data-grid-panel]{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px}.homeLayoutEditor [hidden]{display:none!important}.homeLayoutEditor :focus-visible{outline:3px solid #ffcc55}.homeLayoutEditor .room-shape{cursor:pointer}.homeLayoutEditor [data-floor]{margin:12px 0}.homeLayoutEditor details{padding:8px;border:1px solid #426573;margin:12px 0}@media(max-width:700px){.homeLayoutEditor [data-grid-panel]{display:block}.homeLayoutEditor .fields{grid-template-columns:repeat(2,minmax(0,1fr))}.homeLayoutEditor svg{height:340px}.homeLayoutEditor{padding:12px}}
  </style><header><h2>Design your home</h2><button data-close>Close</button></header>
  <p>Arrange your floor plan, then step inside each room to add photos. Your interior stays private.</p>
  <details data-setup open><summary>Set up your home</summary><div class="fields">
  <label>Floors<input data-count="floorCount" type="number" min="1" max="4" value="1"></label><label>Bedrooms<input data-count="bedrooms" type="number" min="0" max="8" value="1"></label><label>Bathrooms<input data-count="bathrooms" type="number" min="0" max="4" value="1"></label>
  </div><p>Living / kitchen space is included. Suggested rooms are a starting point—not a measured plan of your house.</p><details><summary>My home occupies only part of this building</summary><label><input data-use-unit type="checkbox">Use my own unit boundary</label><label>Home / unit label<input data-unit-label value="My home" maxlength="80"></label><p>These are your measurements, not verified ownership or a change to the public building. Coordinates use the grid below; the boundary must fit inside the mapped outline.</p><div class="fields"><label>Left X (m)<input data-unit-x type="number" step="0.1"></label><label>Front Z (m)<input data-unit-z type="number" step="0.1"></label><label>Width (m)<input data-unit-width type="number" min="2" step="0.1"></label><label>Depth (m)<input data-unit-depth type="number" min="2" step="0.1"></label></div></details><button data-start>Arrange starting plan</button></details>
  <p data-status role="status" aria-live="polite">Choose your room counts to start.</p>
  <section data-editor hidden><nav><button data-plan-mode>2D plan</button><button data-3d-mode>See blank home</button><button data-inside>Inside selected room</button></nav>
  <div class="fields"><label>Floor<select data-floor></select></label><label>Room<select data-room></select></label></div>
  <p data-navigation-help>Select a room on the plan or use the room list. Step inside to look around and place photos.</p>
  <button data-photos>Add photos to this room</button>
  <div data-grid-panel><svg data-plan viewBox="0 0 600 500" aria-label="Editable home floor plan"></svg><aside>
  <label>Room name<input data-name maxlength="60"></label>
  <details><summary>Add a room by dividing this space</summary><label>Divide along<select data-split-axis><option value="x">X · left / right</option><option value="z">Z · front / back</option></select></label><label>Grid coordinate (m)<input data-split-at type="number" step="0.1"></label><button data-split>Divide room and add doorway</button><p>Arrange rooms before placing photos. Shared walls stay connected.</p></details>
  <p>Drag the yellow corners on the plan to adjust the room.</p><details><summary>Advanced · corners and exact dimensions</summary><label>Corner<select data-corner></select></label><div class="fields"><label>X (m)<input data-x type="number" step="0.1"></label><label>Z (m)<input data-z type="number" step="0.1"></label></div><button data-move>Move corner</button>
  <div class="actions"><button data-add-corner>Add corner after this</button><button data-remove-corner>Remove corner</button></div></details>
  <label>Wall<select data-wall></select></label><div class="fields"><label>Door width (m)<input data-door-width type="number" value="0.9" min="0.7" max="2.4" step="0.05"></label><label>Distance from start (m)<input data-door-offset type="number" value="1.5" step="0.1"></label></div>
  <div class="actions"><button data-door>Add doorway</button><button data-remove-door>Remove doorway</button></div>
  <details><summary>Stairs to next floor</summary><p>Place inside rooms on both floors. Start and end are measured in the same plan coordinates.</p>
  <label>Shape<select data-stair-shape><option value="straight">Straight</option><option value="L">L turn</option><option value="U">U turn</option></select></label>
  <div class="fields"><label>Start X<input data-stair-x type="number" value="2" step="0.1"></label><label>Start Z<input data-stair-z type="number" value="2" step="0.1"></label><label>Run length<input data-stair-run type="number" value="5" step="0.1"></label></div><button data-stair>Add stairs</button><button data-remove-stair>Remove stairs from floor</button></details>
  </aside></div><div data-viewer hidden></div>
  <div class="actions"><button data-undo>Undo</button><button data-save>Save private layout to account</button><button data-submit>Build saved home for review</button></div><details><summary>Sharing · private by default</summary><label><input data-public type="checkbox">Request public access after approval</label><p>Leave this off to keep your home private. Your exterior sharing choice never changes interior access.</p></details></section>
  <section data-recovery hidden><p>This device has an unsaved layout.</p><button data-restore>Restore device layout</button></section>`;
  document.body.append(dialog);dialog.showModal();
  const actions=document.createElement('nav');actions.innerHTML='<button data-link-phone>Continue on phone</button><label>Add photos<input data-import-room type="file" accept="image/*" multiple></label><button data-refresh-photos>Check phone uploads</button><span data-photo-total></span>';
  dialog.querySelector('header').after(actions);
  const handoff=document.createElement('section');handoff.hidden=true;handoff.dataset.homeHandoff='';handoff.innerHTML='<p>Scan this with your phone camera and sign in with the same staging/account email. Your saved layout and uploads stay with this building. This link does not grant anyone access.</p><canvas data-home-qr></canvas><a data-home-link></a>';
  actions.after(handoff);
  const tools=document.createElement('nav');tools.dataset.drawingTools='';tools.innerHTML='<button data-tool="enter">Enter room</button><button data-tool="select">Select / move corners</button><button data-tool="rectangle">Draw room</button><button data-tool="divide">Draw dividing wall</button><button data-tool="door">Place door</button><label>Room label<select data-room-label-preset><option value="">Choose a label…</option><option>Living room</option><option>Kitchen</option><option>Bedroom</option><option>Bathroom</option><option>Hall</option><option>Closet</option><option>Office</option><option>Other</option></select></label>';
  dialog.querySelector('[data-grid-panel]').before(tools);
  const details=document.createElement('details');details.innerHTML='<summary>Advanced · exact door placement</summary>';const aside=dialog.querySelector('aside');
  for(const node of [aside.querySelector('[data-wall]').parentElement,aside.querySelector('[data-door-width]').closest('.fields'),aside.querySelector('[data-door]').closest('.actions')])details.append(node);
  aside.append(details);
  const $=s=>dialog.querySelector(s),events=new AbortController(),history=[],future=[],key=JSON.stringify(['home-layout',capture.ownerUid,capture.captureId]);
  let layout=capture.hybridPreview?.layout||legacy?.layout||null,revision=capture.hybridPreview?.revision||0,roomPhotos=structuredClone(capture.hybridPreview?.roomPhotos||legacy?.roomPhotos||[]),floorIndex=0,roomIndex=0,cornerIndex=0,viewer=null,scene=null,closed=false,busy=false,photoEditor=null;
  let savedState=JSON.stringify({layout,roomPhotos});
  function markSaved(){savedState=JSON.stringify({layout,roomPhotos});}
  const status=message=>$('[data-status]').textContent=message;
  let tool='enter',selectedSurface=0;
  const photoCount=()=>{$('[data-photo-total]').textContent=`${photos.length} saved photos · choose their room and surface yourself`;$('[data-import-room]').disabled=!importPhotos;$('[data-refresh-photos]').disabled=!refreshPhotos;};photoCount();
  const saveLayout=async()=>{const result=await save({baseRevision:revision,layout:normalizeLayout(layout,envelope),roomPhotos,footprintSignature:capture.footprintSignature});revision=result.preview.revision;roomPhotos=result.preview.roomPhotos;markSaved();await deleteLocalCaptureDraft(key);return result;};
  $('[data-link-phone]').onclick=async()=>{if(busy)return;busy=true;try{const url=capturePhoneUrl(capture.captureId,location.href);await saveLayout();const {default:qr}=await import('../../vendor/qrcode/qrcode.js');await qr.toCanvas($('[data-home-qr]'),url,{width:208,margin:4});$('[data-home-link]').href=url;$('[data-home-link]').textContent='Open this same interior on another device';handoff.hidden=false;status('Layout saved. Scan the phone link above, then use Check phone uploads here.');}catch(e){status(e.message);}finally{busy=false;}};
  async function getPhotos(files){if(busy)return;busy=true;try{status(files?'Uploading photos to this private interior…':'Checking this interior’s saved photos…');const result=await(files?importPhotos(files):refreshPhotos());photos=result.photos;photoCount();fillControls();status(`${photos.length} photos available. Choose a room, then a wall or floor. Existing uploads are not assigned to a door.`);}catch(e){status(e.message);}finally{busy=false;}}
  $('[data-import-room]').onchange=e=>{const files=[...e.target.files];e.target.value='';if(files.length)void getPhotos(files);};$('[data-refresh-photos]').onclick=()=>getPhotos();
  tools.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{tool=button.dataset.tool;tools.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('[data-plan-mode]').click();status(tool==='rectangle'?'Drag two opposite corners inside a space to draw a room.':tool==='divide'?'Drag a horizontal or vertical dividing wall across the selected room.':tool==='door'?'Click a wall where the doorway should be.':tool==='enter'?'Click any room to enter it and choose a wall or floor.':'Select a room, then drag its corner handles.');});
  $('[data-room-label-preset]').onchange=()=>{const label=$('[data-room-label-preset]').value;if(label)void edit(()=>room().label=label);};
  const unitBounds=layout?.unitOutline||envelope.footprint;
  $('[data-use-unit]').checked=!!layout?.unitOutline;$('[data-unit-label]').value=layout?.unitLabel||'My home';
  $('[data-unit-x]').value=Math.min(...unitBounds.map(p=>p.x));$('[data-unit-z]').value=Math.min(...unitBounds.map(p=>p.z));
  $('[data-unit-width]').value=Math.max(...unitBounds.map(p=>p.x))-Number($('[data-unit-x]').value);$('[data-unit-depth]').value=Math.max(...unitBounds.map(p=>p.z))-Number($('[data-unit-z]').value);
  const floor=()=>layout.floors[floorIndex],room=()=>floor().rooms[roomIndex];
  const option=(text,value)=>new Option(text,value);
  const clone=()=>structuredClone(layout);
  let planZoom=1,panX=0,panZ=0;
  const planNav=document.createElement('nav');planNav.setAttribute('aria-label','Floor plan view');planNav.innerHTML='<button data-plan-zoom="1.4" aria-label="Zoom in on plan">+</button><button data-plan-zoom="0.7142857" aria-label="Zoom out of plan">−</button><button data-plan-fit>Fit plan</button><button data-pan-x="-1" aria-label="Pan left">←</button><button data-pan-x="1" aria-label="Pan right">→</button><button data-pan-z="-1" aria-label="Pan up">↑</button><button data-pan-z="1" aria-label="Pan down">↓</button><label>Room measurements<select data-measure-units><option value="m">Metres</option><option value="ft">Feet</option></select></label><span data-room-measures></span>';
  $('[data-grid-panel]').prepend(planNav);planNav.style.gridColumn='1 / -1';
  planNav.querySelectorAll('[data-plan-zoom]').forEach(b=>b.onclick=()=>{planZoom=Math.min(8,Math.max(1,planZoom*Number(b.dataset.planZoom)));drawPlan();});
  $('[data-plan-fit]').onclick=()=>{planZoom=1;panX=panZ=0;drawPlan();};
  planNav.querySelectorAll('[data-pan-x],[data-pan-z]').forEach(b=>b.onclick=()=>{panX+=Number(b.dataset.panX||0)*2/planZoom;panZ+=Number(b.dataset.panZ||0)*2/planZoom;drawPlan();});
  $('[data-measure-units]').onchange=()=>fillControls();
  const snapshot=()=>({layout:clone(),roomPhotos:structuredClone(roomPhotos)});
  const remember=previous=>{history.push(previous);if(history.length>30)history.shift();future.length=0;};
  const redo=document.createElement('button');redo.textContent='Redo';redo.dataset.redo='';$('[data-undo]').after(redo);
  function restoreEdit(from,to){if(busy||!from.length)return;const next=from.pop();to.push(snapshot());layout=next.layout;roomPhotos=next.roomPhotos;floorIndex=Math.min(floorIndex,layout.floors.length-1);roomIndex=cornerIndex=0;render();void persist();}
  redo.onclick=()=>restoreEdit(future,history);
  const persist=async()=>{try{await saveLocalCaptureDraft({id:key,baseRevision:revision,layout:clone(),roomPhotos:structuredClone(roomPhotos)});status('Saved on this device. Save to account to continue on another device.');}catch{status('Device recovery unavailable. Save to account before closing.');}};
  function validatePhotoSurfaces(candidate){for(const entry of roomPhotos){const surfaces=layoutRoomDescriptor(candidate,entry.roomId).surfaceIds;if(entry.patches.some(p=>!surfaces.includes(p.surfaceId)))throw Error('This edit would remove a photographed surface. Remove that placement first; the uploaded original is kept.');}}
  async function edit(fn){if(busy)return;const previous=snapshot(),selection=[floorIndex,roomIndex];try{fn();layout=normalizeLayout(layout,envelope);validatePhotoSurfaces(layout);remember(previous);render();await persist();}catch(e){layout=previous.layout;roomPhotos=previous.roomPhotos;[floorIndex,roomIndex]=selection;render();status(e.message);}}
  let lastValid=layout?structuredClone(layout):null;
  function fillControls(){
    $('[data-floor]').replaceChildren(...layout.floors.map((f,i)=>option(f.label,i)));$('[data-floor]').value=floorIndex;
    $('[data-room]').replaceChildren(...floor().rooms.map((r,i)=>option(r.label,i)));$('[data-room]').value=roomIndex;$('[data-name]').value=room().label;
    $('[data-corner]').replaceChildren(...room().vertices.map((id,i)=>option(`Corner ${i+1}`,i)));cornerIndex=Math.min(cornerIndex,room().vertices.length-1);$('[data-corner]').value=cornerIndex;
    const point=floor().vertices[room().vertices[cornerIndex]];$('[data-x]').value=point.x;$('[data-z]').value=point.z;
    const axis=$('[data-split-axis]').value,ring=roomRing(floor(),room());$('[data-split-at]').value=(Math.min(...ring.map(p=>p[axis]))+Math.max(...ring.map(p=>p[axis])))/2;
    const unit=$('[data-measure-units]').value,scale=unit==='ft'?3.280839895:1;
    $('[data-room-measures]').textContent=`Room bounds: ${((Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x)))*scale).toFixed(1)} × ${((Math.max(...ring.map(p=>p.z))-Math.min(...ring.map(p=>p.z)))*scale).toFixed(1)} ${unit}. Advanced coordinates remain metres.`;
    const walls=floorWalls(floor()).filter(w=>w.rooms.includes(room().id));$('[data-wall]').replaceChildren(...walls.map((w,i)=>option(`Wall ${i+1} · ${Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z).toFixed(2)} m`,w.id)));
    $('[data-photos]').disabled=!photos.length||!loadPhoto;$('[data-stair]').disabled=floorIndex>=layout.floors.length-1;
  }
  function drawPlan(){
    const svg=$('[data-plan]'),points=envelope.footprint,minX=Math.min(...points.map(p=>p.x))-.5,minZ=Math.min(...points.map(p=>p.z))-.5,w=Math.max(...points.map(p=>p.x))-minX+.5,h=Math.max(...points.map(p=>p.z))-minZ+.5;
    svg.setAttribute('viewBox',`${minX+w/2-w/planZoom/2+panX} ${minZ+h/2-h/planZoom/2+panZ} ${w/planZoom} ${h/planZoom}`);svg.replaceChildren();
    const add=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));svg.append(n);return n;};
    for(let x=Math.ceil(minX);x<minX+w;x++)add('path',{d:`M${x},${minZ}v${h}`,stroke:'#315260','stroke-width':.015});
    for(let z=Math.ceil(minZ);z<minZ+h;z++)add('path',{d:`M${minX},${z}h${w}`,stroke:'#315260','stroke-width':.015});
    add('polygon',{points:points.map(p=>`${p.x},${p.z}`).join(' '),fill:'none',stroke:'#92d0dc','stroke-width':.08});
    floor().rooms.forEach((r,i)=>{const ring=roomRing(floor(),r),p=add('polygon',{points:ring.map(p=>`${p.x},${p.z}`).join(' '),fill:i===roomIndex?'#466e7b':'#203e4b',stroke:'#d0dbe0','stroke-width':.055,class:'room-shape','data-room-id':r.id});p.onclick=()=>{if(!['enter','select'].includes(tool))return;roomIndex=i;cornerIndex=selectedSurface=0;render();if(tool==='enter')void show3D(true);};const center=roomInteriorPoint(ring)||ring[0];const text=add('text',{x:center.x,y:center.z,fill:'#fff','font-size':Math.max(w,h)/38,'text-anchor':'middle','pointer-events':'none'});text.textContent=r.label;});
    for(let x=Math.ceil(minX);x<minX+w;x++)add('path',{d:`M${x},${minZ}v${h}`,stroke:'#abcbd3','stroke-opacity':.3,'stroke-width':.02,'pointer-events':'none'});
    for(let z=Math.ceil(minZ);z<minZ+h;z++)add('path',{d:`M${minX},${z}h${w}`,stroke:'#abcbd3','stroke-opacity':.3,'stroke-width':.02,'pointer-events':'none'});
    for(const d of floor().doors){const wall=floorWalls(floor()).find(w=>w.id===d.wall);if(!wall)continue;const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),t=d.offset/length;add('circle',{cx:wall.a.x+(wall.b.x-wall.a.x)*t,cy:wall.a.z+(wall.b.z-wall.a.z)*t,r:d.width/2,fill:'#093040',stroke:'#ffd369','stroke-width':.08});}
    for(const s of layout.stairs.filter(s=>s.from===floor().id||s.to===floor().id))add('polyline',{points:s.path.map(p=>`${p.x},${p.z}`).join(' '),fill:'none',stroke:'#d0aa65','stroke-width':s.width});
    room().vertices.forEach((id,i)=>{const p=floor().vertices[id],c=add('circle',{cx:p.x,cy:p.z,r:Math.max(w,h)/60,fill:i===cornerIndex?'#ffcf55':'#c9e9ed',stroke:'#09222d','stroke-width':.02});c.style.cursor='grab';c.onpointerdown=e=>{e.preventDefault();cornerIndex=i;svg.setPointerCapture(e.pointerId);const move=event=>{const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());c.setAttribute('cx',Math.round(point.x*10)/10);c.setAttribute('cy',Math.round(point.y*10)/10);};const end=event=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',cancel);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);edit(()=>floor().vertices[id]={x:Number(c.getAttribute('cx')),z:Number(c.getAttribute('cy'))});};const cancel=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',cancel);render();};svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',cancel);};});
  }
  function drawSharedHandles(){
    if(tool!=='select')return;
    const svg=$('[data-plan]');
    for(const wall of floorWalls(floor()).filter(w=>w.rooms.length===2&&w.rooms.includes(room().id))){
      const handle=document.createElementNS('http://www.w3.org/2000/svg','circle'),center={x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2};
      handle.dataset.sharedWall=wall.id;
      for(const [k,v] of Object.entries({cx:center.x,cy:center.z,r:.18,fill:'#65dfce',stroke:'#09222d','stroke-width':.03}))handle.setAttribute(k,v);
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='Drag shared wall; both rooms stay connected';handle.append(title);svg.append(handle);
      handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();svg.setPointerCapture(e.pointerId);
        const start=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());let dx=0,dz=0;
        const move=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());dx=Math.round((p.x-start.x)*10)/10;dz=Math.round((p.y-start.y)*10)/10;handle.setAttribute('cx',center.x+dx);handle.setAttribute('cy',center.z+dz);};
        const clear=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',cancel);};
        const cancel=()=>{clear();render();};
        const end=()=>{clear();void edit(()=>{const points=Object.values(floor().vertices).filter(point=>(point.x===wall.a.x&&point.z===wall.a.z)||(point.x===wall.b.x&&point.z===wall.b.z));for(const point of points){point.x+=dx;point.z+=dz;}});};
        svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',cancel);
      };
    }
  }
  function render(){if(!layout)return;lastValid=clone();$('[data-editor]').hidden=false;$('[data-setup]').open=false;fillControls();drawPlan();drawSharedHandles();}
  const plan=$('[data-plan]');
  const planPoint=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(plan.getScreenCTM().inverse());return snapPlanPoint({x:p.x,z:p.y});};
  plan.addEventListener('pointerdown',e=>{
    if(busy||!layout||!['rectangle','divide','door'].includes(tool))return;
    e.preventDefault();e.stopPropagation();const start=planPoint(e),mode=tool;
    if(mode==='door'){void edit(()=>{const hit=nearestPlanWall(floorWalls(floor()),start);if(!hit||hit.distance>.6)throw Error('Click directly on a wall to place a doorway.');const width=.9,offset=Math.max(width/2+.05,Math.min(hit.length-width/2-.05,hit.offset));floor().doors.push({id:`door_${crypto.randomUUID().replaceAll('-','')}`,wall:hit.wall.id,offset,width,height:Math.min(2.05,floor().height),entry:floorIndex===0&&hit.wall.rooms.length===1});});return;}
    plan.setPointerCapture(e.pointerId);
    const ghost=document.createElementNS('http://www.w3.org/2000/svg',mode==='rectangle'?'rect':'line');ghost.setAttribute('stroke','#ffd369');ghost.setAttribute('stroke-width','.08');ghost.setAttribute('fill','none');ghost.style.pointerEvents='none';plan.append(ghost);
    const move=event=>{const p=planPoint(event);const attrs=mode==='rectangle'?{x:Math.min(start.x,p.x),y:Math.min(start.z,p.z),width:Math.abs(start.x-p.x),height:Math.abs(start.z-p.z)}:{x1:start.x,y1:start.z,x2:p.x,y2:p.z};Object.entries(attrs).forEach(([k,v])=>ghost.setAttribute(k,v));};
    const clear=()=>{plan.removeEventListener('pointermove',move);plan.removeEventListener('pointerup',end);plan.removeEventListener('pointercancel',cancel);ghost.remove();};
    const cancel=()=>clear();
    const end=event=>{const finish=planPoint(event);clear();void edit(()=>{if(roomPhotos.some(p=>p.patches.length))throw Error('This plan has saved photo placements. Remove affected placements before changing room divisions; originals are retained.');let id=room().id;if(mode==='rectangle')id=drawRectangleRoom(floor(),id,start,finish);else{const axis=Math.abs(finish.x-start.x)>Math.abs(finish.z-start.z)?'z':'x';splitRoom(floor(),id,axis,(start[axis]+finish[axis])/2);}roomIndex=floor().rooms.findIndex(r=>r.id===id);cornerIndex=0;});};
    plan.addEventListener('pointermove',move);plan.addEventListener('pointerup',end);plan.addEventListener('pointercancel',cancel);
  },{capture:true,signal:events.signal});
  let viewMode='plan';
  async function show3D(inside=false){try{
    tools.hidden=true;
    for(const element of dialog.querySelectorAll('[data-floor],[data-room],[data-plan-mode],[data-3d-mode],[data-inside]'))element.disabled=true;
    viewMode=inside?'inside':'overview';
    $('[data-navigation-help]').textContent=inside?'Drag to look around. Choose another room above, tap a wall to place photos, or return to 2D plan.':'Drag to orbit your home. Choose Inside selected room to enter, or 2D plan to change its layout.';
    viewer?.dispose();scene?.dispose();scene=buildAuthoredInterior(globalThis.THREE,layout);
    if(!inside)scene.group.traverse(o=>{if(o.userData.kind==='ceiling')o.visible=false;});
    if(loadPhoto&&roomPhotos.length){
      const {buildWallPatch,rectifyPhoto}=await import('./hybrid-geometry.js?v=1');
      const {manualRoomSurfaceSize}=await import('../../../functions/capture-room-geometry.mjs');
      const selectedEntries=roomPhotos.filter(entry=>inside?entry.roomId===room().id:floor().rooms.some(r=>r.id===entry.roomId));
      const textureSize=Math.min(1024,Math.max(128,2**Math.floor(Math.log2(Math.sqrt(8*1024*1024/Math.max(1,selectedEntries.reduce((n,e)=>n+e.patches.length,0)))))));
      for(const entry of selectedEntries){const descriptor=layoutRoomDescriptor(layout,entry.roomId);for(const p of entry.patches){
        const wall=descriptor.surfaceIds.indexOf(p.surfaceId);if(wall<0)continue;
        const bitmap=await createImageBitmap(await loadPhoto(p.photoId,events.signal),{resizeWidth:1024});
        try{const size=manualRoomSurfaceSize(descriptor,wall),r=p.region,canvas=rectifyPhoto(bitmap,p.quad,size[0]*(r[2]-r[0])/(size[1]*(r[3]-r[1])),textureSize),texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;
          const mesh=buildWallPatch(THREE,{manualRoom:descriptor},descriptor.heightMeters,{...p,wall},texture);mesh.position.y=descriptor.elevation;mesh.userData.roomId=entry.roomId;mesh.userData.surfaceId=p.surfaceId;mesh.userData.kind='photo';scene.group.add(mesh);
        }finally{bitmap.close();}
      }}
    }
    $('[data-grid-panel]').hidden=true;$('[data-viewer]').hidden=false;
    viewer=await createCaptureViewer($('[data-viewer]'),null,events.signal,{model:scene.group,preserveCoordinates:true,fitScale:.6,label:'Your authored home. Drag to look around.',onPick:({object})=>{
      if(!photos.length){status('Add room photos above, then select a wall or floor to place them.');return;}
      const data=object.userData,selectedFloor=layout.floors.findIndex(f=>f.id===data.floorId||f.rooms.some(r=>r.id===data.roomId));
      if(selectedFloor<0)return;
      floorIndex=selectedFloor;roomIndex=Math.min(roomIndex,floor().rooms.length-1);
      if(data.roomId)roomIndex=floor().rooms.findIndex(r=>r.id===data.roomId);
      else{const wall=floorWalls(floor()).find(w=>w.id===data.wallId);if(!wall)return;if(!wall.rooms.includes(room().id))roomIndex=floor().rooms.findIndex(r=>r.id===wall.rooms[0]);}
      const surfaceId=data.surfaceId||`${floor().id}:${data.wallId}:${room().id}`;
      selectedSurface=layoutRoomDescriptor(layout,room().id).surfaceIds.indexOf(surfaceId);
      if(selectedSurface>=0)$('[data-photos]').click();
    }});
    if(inside){const center=roomInteriorPoint(roomRing(floor(),room()));if(!center)throw Error('This room needs more clear floor space for an inside view.');viewer.setInside?.({x:center.x,y:floor().elevation+1.6,z:center.z});}
  }catch(e){status(e.message);}finally{for(const element of dialog.querySelectorAll('[data-floor],[data-room],[data-plan-mode],[data-3d-mode],[data-inside]'))element.disabled=false;}}
  $('[data-start]').onclick=()=>{try{const values=Object.fromEntries([...dialog.querySelectorAll('[data-count]')].map(e=>[e.dataset.count,Number(e.value)]));if(roomPhotos.some(e=>e.patches.length))throw Error('This home already has placed photos. Edit its existing corners instead of replacing the whole plan');if($('[data-use-unit]').checked){const x=Number($('[data-unit-x]').value),z=Number($('[data-unit-z]').value),w=Number($('[data-unit-width]').value),d=Number($('[data-unit-depth]').value);if(w<2||d<2)throw Error('The unit needs at least two metres in each direction');values.unitOutline=[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];}values.unitLabel=$('[data-unit-label]').value;const next=makeStarterLayout(envelope,values);if(layout){remember(snapshot());next.id=layout.id;}layout=next;floorIndex=roomIndex=cornerIndex=0;render();persist();}catch(e){status(`${e.message} Adjust the room count or dimensions; the building has not been changed.`);}};
  const refreshSelectedView=()=>{render();if(viewMode!=='plan')void show3D(viewMode==='inside');};
  $('[data-floor]').onchange=()=>{floorIndex=Number($('[data-floor]').value);roomIndex=cornerIndex=0;refreshSelectedView();};$('[data-room]').onchange=()=>{roomIndex=Number($('[data-room]').value);cornerIndex=0;refreshSelectedView();};$('[data-corner]').onchange=()=>{cornerIndex=Number($('[data-corner]').value);render();};
  $('[data-name]').onchange=()=>edit(()=>room().label=$('[data-name]').value);
  $('[data-split-axis]').onchange=()=>fillControls();
  $('[data-split]').onclick=()=>edit(()=>{if(roomPhotos.some(e=>e.patches.length))throw Error('Arrange the room divisions before placing photos. Remove affected placements first; your uploaded originals are kept.');splitRoom(floor(),room().id,$('[data-split-axis]').value,Number($('[data-split-at]').value));});
  $('[data-move]').onclick=()=>edit(()=>floor().vertices[room().vertices[cornerIndex]]={x:Number($('[data-x]').value),z:Number($('[data-z]').value)});
  $('[data-add-corner]').onclick=()=>edit(()=>{const a=room().vertices[cornerIndex],b=room().vertices[(cornerIndex+1)%room().vertices.length],id=`v_${crypto.randomUUID().replaceAll('-','')}`,p=floor().vertices[a],q=floor().vertices[b];if(floor().doors.some(d=>d.wall===wallKey(a,b)))throw Error('Remove the doorway before splitting this wall.');floor().vertices[id]={x:(p.x+q.x)/2,z:(p.z+q.z)/2};for(const r of floor().rooms){const i=r.vertices.findIndex((v,i)=>v===a&&r.vertices[(i+1)%r.vertices.length]===b||v===b&&r.vertices[(i+1)%r.vertices.length]===a);if(i>=0)r.vertices.splice(i+1,0,id);}cornerIndex++;});
  $('[data-remove-corner]').onclick=()=>edit(()=>{const id=room().vertices[cornerIndex];for(const r of floor().rooms)r.vertices=r.vertices.filter(v=>v!==id);delete floor().vertices[id];cornerIndex=0;});
  $('[data-door]').onclick=()=>edit(()=>floor().doors.push({id:`door_${crypto.randomUUID().replaceAll('-','')}`,wall:$('[data-wall]').value,offset:Number($('[data-door-offset]').value),width:Number($('[data-door-width]').value),height:2.05,entry:false}));
  $('[data-remove-door]').onclick=()=>edit(()=>floor().doors=floor().doors.filter(d=>d.wall!==$('[data-wall]').value));
  $('[data-stair]').onclick=()=>edit(()=>{const x=Number($('[data-stair-x]').value),z=Number($('[data-stair-z]').value),run=Number($('[data-stair-run]').value),shape=$('[data-stair-shape]').value;const path=shape==='straight'?[{x,z},{x,z:z+run}]:shape==='L'?[{x,z},{x,z:z+run/2},{x:x+run/2,z:z+run/2}]:[{x,z},{x,z:z+run/2},{x:x+1.2,z:z+run/2},{x:x+1.2,z}];layout.stairs.push({id:`stair_${crypto.randomUUID().replaceAll('-','')}`,from:floor().id,to:layout.floors[floorIndex+1].id,width:1,path});});
  $('[data-remove-stair]').onclick=()=>edit(()=>layout.stairs=layout.stairs.filter(s=>s.from!==floor().id));
  $('[data-undo]').onclick=()=>restoreEdit(history,future);
  $('[data-3d-mode]').onclick=()=>show3D();$('[data-inside]').onclick=()=>show3D(true);$('[data-plan-mode]').onclick=()=>{viewMode='plan';tools.hidden=false;viewer?.dispose();viewer=null;scene?.dispose();scene=null;$('[data-grid-panel]').hidden=false;$('[data-viewer]').hidden=true;$('[data-navigation-help]').textContent='Select a room on the plan or use the room list. Step inside to look around and place photos.';render();};
  $('[data-photos]').onclick=async()=>{try{
    const {openHybridEditor}=await import('./hybrid-editor.js?v=1'),selectedRoom=room().id,descriptor=layoutRoomDescriptor(layout,selectedRoom);
    const saved=roomPhotos.find(p=>p.roomId===selectedRoom);
    const pseudo={...capture,authoredLayout:true,authoredRoomId:selectedRoom,room:descriptor,hybridPreview:{revision,photoLabels:saved?.photoLabels||{},room:descriptor,footprintSignature:capture.footprintSignature,heightMeters:descriptor.heightMeters,roofShape:'flat',roofRiseMeters:2,patches:(saved?.patches||[]).map(p=>({...p,wall:descriptor.surfaceIds.indexOf(p.surfaceId)}))}};
    photoEditor=await openHybridEditor({capture:pseudo,photos,loadPhoto,inWorld,initialWall:selectedSurface,signal:events.signal,save:async preview=>{
      const next={roomId:selectedRoom,photoLabels:preview.photoLabels||{},patches:preview.patches.map(p=>({...p,surfaceId:descriptor.surfaceIds[p.wall]}))};
      const entries=[...roomPhotos.filter(p=>p.roomId!==selectedRoom),next];
      const result=await save({baseRevision:revision,footprintSignature:capture.footprintSignature,layout:clone(),roomPhotos:entries});
      revision=result.preview.revision;roomPhotos=result.preview.roomPhotos;markSaved();return {preview:{...preview,revision}};
    },onClose:()=>{status('Room editor closed. Only photos confirmed as saved are stored in your account.');if(viewMode!=='plan')void show3D(viewMode==='inside');}});
  }catch(e){status(e.message);}};
  $('[data-save]').onclick=async()=>{if(busy)return;busy=true;$('[data-save]').disabled=true;status('Saving your private layout…');try{const result=await save({baseRevision:revision,layout:normalizeLayout(layout,envelope),roomPhotos,footprintSignature:capture.footprintSignature});signal.throwIfAborted();revision=result.preview.revision;roomPhotos=result.preview.roomPhotos;markSaved();await deleteLocalCaptureDraft(key);status(`Saved to account · revision ${revision}. Your home remains private.`);}catch(e){status(`Not saved to account: ${e.message}. Your device draft is retained.`);}finally{busy=false;$('[data-save]').disabled=false;}};
  $('[data-submit]').disabled=!submit;
  $('[data-submit]').onclick=async()=>{if(busy||!submit)return;if(!confirm('Submit this home layout and saved photos for review? Original photos stay private. Public entry is only requested if you selected it below.'))return;busy=true;$('[data-submit]').disabled=true;try{assertPlayableLayout(normalizeLayout(layout,envelope));if(!roomPhotos.some(e=>e.patches.length))throw Error('Add and save room photos before building the photo-supported home.');status('Saving the layout and building your protected home preview…');const saved=await save({baseRevision:revision,layout:clone(),roomPhotos,footprintSignature:capture.footprintSignature});revision=saved.preview.revision;roomPhotos=saved.preview.roomPhotos;markSaved();const result=await submit(revision,$('[data-public]').checked);status(`Home revision ${result.revision} submitted for review. ${$('[data-public]').checked?'Public access was requested; approval is still required.':'Your home remains private.'}`);}catch(e){status(`Not submitted: ${e.message}`);}finally{busy=false;$('[data-submit]').disabled=false;}};
  function close(){if(closed)return;closed=true;events.abort();viewer?.dispose();scene?.dispose();signal.removeEventListener('abort',close);dialog.close();dialog.remove();}
  const requestClose=()=>{if(busy){status('Wait for the current save or upload to finish before closing.');return;}if(savedState!==JSON.stringify({layout,roomPhotos})&&!confirm('This layout has changes that are not saved to your account. Close and keep the device recovery draft?'))return;close();};
  $('[data-close]').onclick=requestClose;dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});signal.addEventListener('abort',close,{once:true});
  try{const recovery=(await loadLocalCaptureDraft(key)).draft;if(recovery?.layout){
    $('[data-recovery]').hidden=false;const stale=recovery.baseRevision!==revision;
    $('[data-recovery] p').textContent=stale?`This device has edits based on version ${recovery.baseRevision}; your account is version ${revision}. Inspect the device layout before choosing whether to save it over the account layout. Nothing changes in your account until Save.`:'This device has an unsaved layout.';
    $('[data-restore]').textContent='Inspect device layout';
    $('[data-restore]').onclick=()=>{try{const next=normalizeLayout(recovery.layout,envelope);remember(snapshot());layout=next;roomPhotos=structuredClone(recovery.roomPhotos||roomPhotos);floorIndex=roomIndex=0;render();$('[data-recovery]').hidden=true;status('Inspecting device edits. Save explicitly to use these instead of the account layout; close without saving to keep the account version.');}catch(e){status(e.message);}};
  }}catch{}
  if(!layout){try{layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0});layout.floors[0].rooms[0].label='My space';status('Draw rooms inside the mapped outline. Click a room to enter it. Heights fit inside this building.');}catch(e){status(`The mapped outline needs a unit boundary before a safe plan can be made: ${e.message}`);}}
  if(layout)render();
  if(legacy)status('Your existing room photos are preserved. The room is centered inside the mapped outline as a starting placement; check its position and doorway before saving.');
  return {close};
}
