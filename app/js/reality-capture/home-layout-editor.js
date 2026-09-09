import './capture-theme.js';
import {makeStarterLayout,normalizeLayout,assertPlayableLayout,floorWalls,roomRing,wallKey,layoutRoomDescriptor,roomInteriorPoint,splitRoom} from '../../../functions/interior-layout.mjs';
import {loadClassicScript} from '../modules/script-loader.js?v=56';
import {vendorScriptsCritical} from '../modules/manifest.js?v=597';
import {buildAuthoredInterior} from '../interiors/authored-geometry.js';
import {createCaptureViewer} from './result-viewer.js?v=1';
import {loadLocalCaptureDraft,saveLocalCaptureDraft,deleteLocalCaptureDraft} from './local-draft-store.js?v=1';

export async function openHomeLayoutEditor({capture,save,signal,photos=[],loadPhoto,submit,inWorld=false}) {
  signal.throwIfAborted();
  if(!globalThis.THREE)await loadClassicScript(vendorScriptsCritical[0]);
  const envelope={footprint:capture.building?.spatialContext?.footprint,holes:capture.building?.spatialContext?.holes||[],heightMeters:capture.building?.spatialContext?.wallHeightMeters||capture.building?.spatialContext?.height?.meters||3,revision:capture.footprintSignature};
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
  const $=s=>dialog.querySelector(s),events=new AbortController(),history=[],key=JSON.stringify(['home-layout',capture.ownerUid,capture.captureId]);
  let layout=capture.hybridPreview?.layout||null,revision=capture.hybridPreview?.revision||0,roomPhotos=structuredClone(capture.hybridPreview?.roomPhotos||[]),floorIndex=0,roomIndex=0,cornerIndex=0,viewer=null,scene=null,closed=false,busy=false,photoEditor=null;
  const status=message=>$('[data-status]').textContent=message;
  const unitBounds=layout?.unitOutline||envelope.footprint;
  $('[data-use-unit]').checked=!!layout?.unitOutline;$('[data-unit-label]').value=layout?.unitLabel||'My home';
  $('[data-unit-x]').value=Math.min(...unitBounds.map(p=>p.x));$('[data-unit-z]').value=Math.min(...unitBounds.map(p=>p.z));
  $('[data-unit-width]').value=Math.max(...unitBounds.map(p=>p.x))-Number($('[data-unit-x]').value);$('[data-unit-depth]').value=Math.max(...unitBounds.map(p=>p.z))-Number($('[data-unit-z]').value);
  const floor=()=>layout.floors[floorIndex],room=()=>floor().rooms[roomIndex];
  const option=(text,value)=>new Option(text,value);
  const clone=()=>structuredClone(layout);
  const persist=async()=>{try{await saveLocalCaptureDraft({id:key,baseRevision:revision,layout:clone()});status('Saved on this device. Save to account to continue on another device.');}catch{status('Device recovery unavailable. Save to account before closing.');}};
  async function edit(fn){if(busy)return;const previous=clone();try{fn();layout=normalizeLayout(layout,envelope);history.push(previous);render();await persist();}catch(e){layout=previous;render();status(e.message);}}
  let lastValid=layout?structuredClone(layout):null;
  function fillControls(){
    $('[data-floor]').replaceChildren(...layout.floors.map((f,i)=>option(f.label,i)));$('[data-floor]').value=floorIndex;
    $('[data-room]').replaceChildren(...floor().rooms.map((r,i)=>option(r.label,i)));$('[data-room]').value=roomIndex;$('[data-name]').value=room().label;
    $('[data-corner]').replaceChildren(...room().vertices.map((id,i)=>option(`Corner ${i+1}`,i)));cornerIndex=Math.min(cornerIndex,room().vertices.length-1);$('[data-corner]').value=cornerIndex;
    const point=floor().vertices[room().vertices[cornerIndex]];$('[data-x]').value=point.x;$('[data-z]').value=point.z;
    const axis=$('[data-split-axis]').value,ring=roomRing(floor(),room());$('[data-split-at]').value=(Math.min(...ring.map(p=>p[axis]))+Math.max(...ring.map(p=>p[axis])))/2;
    const walls=floorWalls(floor()).filter(w=>w.rooms.includes(room().id));$('[data-wall]').replaceChildren(...walls.map((w,i)=>option(`Wall ${i+1} · ${Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z).toFixed(2)} m`,w.id)));
    $('[data-photos]').disabled=!photos.length||!loadPhoto;$('[data-stair]').disabled=floorIndex>=layout.floors.length-1;
  }
  function drawPlan(){
    const svg=$('[data-plan]'),points=envelope.footprint,minX=Math.min(...points.map(p=>p.x))-.5,minZ=Math.min(...points.map(p=>p.z))-.5,w=Math.max(...points.map(p=>p.x))-minX+.5,h=Math.max(...points.map(p=>p.z))-minZ+.5;
    svg.setAttribute('viewBox',`${minX} ${minZ} ${w} ${h}`);svg.replaceChildren();
    const add=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));svg.append(n);return n;};
    for(let x=Math.ceil(minX);x<minX+w;x++)add('path',{d:`M${x},${minZ}v${h}`,stroke:'#315260','stroke-width':.015});
    for(let z=Math.ceil(minZ);z<minZ+h;z++)add('path',{d:`M${minX},${z}h${w}`,stroke:'#315260','stroke-width':.015});
    add('polygon',{points:points.map(p=>`${p.x},${p.z}`).join(' '),fill:'none',stroke:'#92d0dc','stroke-width':.08});
    floor().rooms.forEach((r,i)=>{const ring=roomRing(floor(),r),p=add('polygon',{points:ring.map(p=>`${p.x},${p.z}`).join(' '),fill:i===roomIndex?'#466e7b':'#203e4b',stroke:'#d0dbe0','stroke-width':.055,class:'room-shape'});p.onclick=()=>{roomIndex=i;cornerIndex=0;render();};const center=ring.reduce((a,p)=>({x:a.x+p.x/ring.length,z:a.z+p.z/ring.length}),{x:0,z:0});const text=add('text',{x:center.x,y:center.z,fill:'#fff','font-size':Math.max(w,h)/38,'text-anchor':'middle','pointer-events':'none'});text.textContent=r.label;});
    for(const d of floor().doors){const wall=floorWalls(floor()).find(w=>w.id===d.wall);if(!wall)continue;const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),t=d.offset/length;add('circle',{cx:wall.a.x+(wall.b.x-wall.a.x)*t,cy:wall.a.z+(wall.b.z-wall.a.z)*t,r:d.width/2,fill:'#093040',stroke:'#ffd369','stroke-width':.08});}
    for(const s of layout.stairs.filter(s=>s.from===floor().id||s.to===floor().id))add('polyline',{points:s.path.map(p=>`${p.x},${p.z}`).join(' '),fill:'none',stroke:'#d0aa65','stroke-width':s.width});
    room().vertices.forEach((id,i)=>{const p=floor().vertices[id],c=add('circle',{cx:p.x,cy:p.z,r:Math.max(w,h)/60,fill:i===cornerIndex?'#ffcf55':'#c9e9ed',stroke:'#09222d','stroke-width':.02});c.style.cursor='grab';c.onpointerdown=e=>{e.preventDefault();cornerIndex=i;svg.setPointerCapture(e.pointerId);const move=event=>{const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());c.setAttribute('cx',Math.round(point.x*10)/10);c.setAttribute('cy',Math.round(point.y*10)/10);};const end=event=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',cancel);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);edit(()=>floor().vertices[id]={x:Number(c.getAttribute('cx')),z:Number(c.getAttribute('cy'))});};const cancel=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',end);svg.removeEventListener('pointercancel',cancel);render();};svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',cancel);};});
  }
  function render(){if(!layout)return;lastValid=clone();$('[data-editor]').hidden=false;$('[data-setup]').open=false;fillControls();drawPlan();}
  let viewMode='plan';
  async function show3D(inside=false){try{
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
          const mesh=buildWallPatch(THREE,{manualRoom:descriptor},descriptor.heightMeters,{...p,wall},texture);mesh.position.y=descriptor.elevation;mesh.userData.roomId=entry.roomId;mesh.userData.kind='photo';scene.group.add(mesh);
        }finally{bitmap.close();}
      }}
    }
    $('[data-grid-panel]').hidden=true;$('[data-viewer]').hidden=false;
    viewer=await createCaptureViewer($('[data-viewer]'),null,events.signal,{model:scene.group,preserveCoordinates:true,fitScale:.6,label:'Your authored home. Drag to look around.',onPick:({object})=>{if(photos.length&&(object.userData.kind==='wall'||object.userData.roomId)){const selectedFloor=layout.floors.findIndex(f=>f.id===object.userData.floorId||f.rooms.some(r=>r.id===object.userData.roomId));if(selectedFloor>=0){floorIndex=selectedFloor;if(object.userData.roomId)roomIndex=floor().rooms.findIndex(r=>r.id===object.userData.roomId);else{const wall=floorWalls(floor()).find(w=>w.id===object.userData.wallId);if(wall&&!wall.rooms.includes(room().id))roomIndex=floor().rooms.findIndex(r=>r.id===wall.rooms[0]);}dialog.querySelector('[data-photos]').click();}}else status('Upload your room photos first, then select a surface to place them.');}});
    if(inside){const center=roomInteriorPoint(roomRing(floor(),room()));if(!center)throw Error('This room needs more clear floor space for an inside view.');viewer.setInside?.({x:center.x,y:floor().elevation+1.6,z:center.z});}
  }catch(e){status(e.message);}finally{for(const element of dialog.querySelectorAll('[data-floor],[data-room],[data-plan-mode],[data-3d-mode],[data-inside]'))element.disabled=false;}}
  $('[data-start]').onclick=()=>{try{const values=Object.fromEntries([...dialog.querySelectorAll('[data-count]')].map(e=>[e.dataset.count,Number(e.value)]));if(roomPhotos.some(e=>e.patches.length))throw Error('This home already has placed photos. Edit its existing corners instead of replacing the whole plan');if($('[data-use-unit]').checked){const x=Number($('[data-unit-x]').value),z=Number($('[data-unit-z]').value),w=Number($('[data-unit-width]').value),d=Number($('[data-unit-depth]').value);if(w<2||d<2)throw Error('The unit needs at least two metres in each direction');values.unitOutline=[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];}values.unitLabel=$('[data-unit-label]').value;const next=makeStarterLayout(envelope,values);if(layout){history.push(clone());next.id=layout.id;}layout=next;floorIndex=roomIndex=cornerIndex=0;render();persist();}catch(e){status(`${e.message} Adjust the room count or dimensions; the building has not been changed.`);}};
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
  $('[data-undo]').onclick=()=>{if(history.length){layout=history.pop();floorIndex=Math.min(floorIndex,layout.floors.length-1);roomIndex=cornerIndex=0;render();persist();}};
  $('[data-3d-mode]').onclick=()=>show3D();$('[data-inside]').onclick=()=>show3D(true);$('[data-plan-mode]').onclick=()=>{viewMode='plan';viewer?.dispose();viewer=null;scene?.dispose();scene=null;$('[data-grid-panel]').hidden=false;$('[data-viewer]').hidden=true;$('[data-navigation-help]').textContent='Select a room on the plan or use the room list. Step inside to look around and place photos.';render();};
  $('[data-photos]').onclick=async()=>{try{
    const {openHybridEditor}=await import('./hybrid-editor.js?v=1'),selectedRoom=room().id,descriptor=layoutRoomDescriptor(layout,selectedRoom);
    const saved=roomPhotos.find(p=>p.roomId===selectedRoom);
    const pseudo={...capture,authoredLayout:true,authoredRoomId:selectedRoom,room:descriptor,hybridPreview:{revision,room:descriptor,footprintSignature:capture.footprintSignature,heightMeters:descriptor.heightMeters,roofShape:'flat',roofRiseMeters:2,patches:(saved?.patches||[]).map(p=>({...p,wall:descriptor.surfaceIds.indexOf(p.surfaceId)}))}};
    photoEditor=await openHybridEditor({capture:pseudo,photos,loadPhoto,inWorld,signal:events.signal,save:async preview=>{
      const next={roomId:selectedRoom,patches:preview.patches.map(p=>({...p,surfaceId:descriptor.surfaceIds[p.wall]}))};
      const entries=[...roomPhotos.filter(p=>p.roomId!==selectedRoom),next];
      const result=await save({baseRevision:revision,footprintSignature:capture.footprintSignature,layout:clone(),roomPhotos:entries});
      revision=result.preview.revision;roomPhotos=result.preview.roomPhotos;return {preview:{...preview,revision}};
    },onClose:()=>{status('Room editor closed. Only photos confirmed as saved are stored in your account.');}});
  }catch(e){status(e.message);}};
  $('[data-save]').onclick=async()=>{if(busy)return;busy=true;$('[data-save]').disabled=true;status('Saving your private layout…');try{const result=await save({baseRevision:revision,layout:normalizeLayout(layout,envelope),roomPhotos,footprintSignature:capture.footprintSignature});signal.throwIfAborted();revision=result.preview.revision;roomPhotos=result.preview.roomPhotos;await deleteLocalCaptureDraft(key);status(`Saved to account · revision ${revision}. Your home remains private.`);}catch(e){status(`Not saved to account: ${e.message}. Your device draft is retained.`);}finally{busy=false;$('[data-save]').disabled=false;}};
  $('[data-submit]').disabled=!submit;
  $('[data-submit]').onclick=async()=>{if(busy||!submit)return;busy=true;$('[data-submit]').disabled=true;try{assertPlayableLayout(normalizeLayout(layout,envelope));if(!roomPhotos.some(e=>e.patches.length))throw Error('Add and save room photos before building the photo-supported home.');status('Saving the layout and building your protected home preview…');const saved=await save({baseRevision:revision,layout:clone(),roomPhotos,footprintSignature:capture.footprintSignature});revision=saved.preview.revision;roomPhotos=saved.preview.roomPhotos;const result=await submit(revision,$('[data-public]').checked);status(`Home revision ${result.revision} submitted for review. ${$('[data-public]').checked?'Public access was requested; approval is still required.':'Your home remains private.'}`);}catch(e){status(`Not submitted: ${e.message}`);}finally{busy=false;$('[data-submit]').disabled=false;}};
  function close(){if(closed)return;closed=true;events.abort();viewer?.dispose();scene?.dispose();signal.removeEventListener('abort',close);dialog.close();dialog.remove();}
  $('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});signal.addEventListener('abort',close,{once:true});
  try{const recovery=(await loadLocalCaptureDraft(key)).draft;if(recovery?.layout&&recovery.baseRevision===revision){$('[data-recovery]').hidden=false;$('[data-restore]').onclick=()=>{try{layout=normalizeLayout(recovery.layout,envelope);render();$('[data-recovery]').hidden=true;status('Recovered device layout. Save to account when ready.');}catch(e){status(e.message);}};}}catch{}
  if(layout)render();
  return {close};
}
