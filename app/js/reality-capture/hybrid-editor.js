import {loadClassicScript} from '../modules/script-loader.js?v=56';
import {vendorScriptsCritical} from '../modules/manifest.js?v=597';
import {createCaptureViewer} from './result-viewer.js?v=1';
import {wallFootprint,validateQuad,rectifyPhoto,buildHybridShell,buildWallPatch} from './hybrid-geometry.js?v=1';

// The host supplies the existing authenticated asset/save APIs. No public URLs,
// alternate uploader, reconstruction queue, or world-geometry authority here.
export async function openHybridEditor({capture,photos,loadPhoto,save,signal}) {
  const pts=wallFootprint(capture.building);
  if(!photos.length)throw Error('No saved photographs are available for this capture.');
  if(!globalThis.THREE)await loadClassicScript(vendorScriptsCritical[0]);
  signal.throwIfAborted();
  const T=globalThis.THREE, abort=new AbortController();
  const dialog=document.createElement('dialog'); dialog.className='captureHybridEditor';
  dialog.setAttribute('aria-label','Build a photo-supported building preview');
  dialog.innerHTML=`<style>
    .captureHybridEditor{box-sizing:border-box;background:#09222d;color:#e3f5fa;border:1px solid #68c4d0;border-radius:12px;width:min(1000px,96vw);max-height:94dvh;padding:18px;overflow:auto;font:15px/1.5 system-ui}
    .captureHybridEditor *{box-sizing:border-box}.captureHybridEditor::backdrop{background:#000b}
    .captureHybridEditor h2{margin:0}.captureHybridEditor header{display:flex;justify-content:space-between;gap:12px}
    .captureHybridEditor button,.captureHybridEditor select,.captureHybridEditor input{font:inherit;min-height:44px;background:#143844;color:#e3f5fa;border:1px solid #72b5c2;border-radius:6px;padding:8px;max-width:100%}
    .captureHybridEditor button{cursor:pointer}.captureHybridEditor button:disabled{opacity:.5;cursor:default}
    .captureHybridEditor :focus-visible{outline:3px solid #ffcc55;outline-offset:2px}
    .captureHybridEditor label{display:flex;flex-direction:column;gap:4px}.captureHybridEditor p{margin:10px 0}
    .captureHybridEditor .hybridColumns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.captureHybridEditor .hybridFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}
    .captureHybridEditor canvas[data-photo]{display:block;width:100%;height:auto;touch-action:none;border:1px solid #5ba1ac}
    .captureHybridEditor canvas[data-plan]{width:100%;height:160px}.captureHybridEditor [data-status]{padding:10px;background:#153b47;border-left:3px solid #ffc966;min-height:44px}
    .captureHybridEditor [data-patches] button{margin:4px}.captureHybridEditor [data-patches] li{margin:6px 0}
    @media(max-width:700px){.captureHybridEditor .hybridColumns{grid-template-columns:1fr}.captureHybridEditor{padding:12px}}
  </style><header><h2>Photos + mapped building</h2><button data-close aria-label="Close building preview">Close</button></header>
  <p>Place your existing photos on the walls they show. Uncovered areas stay procedural. This is a private, manually aligned preview—not an automatically solved 3D scan.</p>
  <p data-status role="status" aria-live="polite">Choose a photo and its wall. No reconstruction charge is involved.</p>
  <div class="hybridColumns"><section aria-label="Photo alignment"><h3>1. Outline one flat wall region</h3>
    <label>Saved photo<select data-photo-choice></select></label><p>Mark top-left → top-right → bottom-right → bottom-left around a rectangular area on the same wall. Exclude sky, plants and neighboring walls. Use a separate patch for another plane.</p>
    <canvas data-photo aria-label="Photo corners. Tap four corners, drag handles, or use the coordinate fields below." tabindex="0"></canvas>
    <div class="hybridFields"><label>Selected corner<select data-corner><option value="0">1 · Top-left</option><option value="1">2 · Top-right</option><option value="2">3 · Bottom-right</option><option value="3">4 · Bottom-left</option></select></label><button data-clear>Clear corners</button>
    <label>Photo X (%)<input data-x type="number" min="0" max="100" step="0.1"></label><label>Photo Y (%)<input data-y type="number" min="0" max="100" step="0.1"></label></div>
    <h3>2. Match its place on the building</h3><canvas data-plan aria-label="Mapped footprint, north up; wall numbers match the selector"></canvas>
    <label>Mapped wall<select data-wall></select></label><p>Wall percentages run from its numbered start corner to the next corner; height runs from ground to eaves. A close-up must cover only its actual portion, not the whole wall.</p>
    <div class="hybridFields"><label>Left (%)<input data-region="0" type="number" min="0" max="100" value="0"></label><label>Bottom (%)<input data-region="1" type="number" min="0" max="100" value="0"></label><label>Right (%)<input data-region="2" type="number" min="0" max="100" value="100"></label><label>Top (%)<input data-region="3" type="number" min="0" max="100" value="100"></label></div>
    <button data-add>Add photo patch to preview</button><button data-new>Start another patch</button>
  </section><section aria-label="Hybrid preview"><h3>3. Inspect all sides</h3>
    <label>Preview wall / eaves height (metres)<input data-height type="number" min="1" max="1200" step="0.1"></label><p data-height-evidence></p>
    <div class="hybridFields"><label>Procedural roof<select data-roof><option value="unknown">Unknown · flat cap</option><option value="flat">Flat</option><option value="gabled">Gabled / pitched</option><option value="hipped">Hipped</option></select></label><label>Roof rise (metres)<input data-rise type="number" min="0.3" max="20" step="0.1" value="2"></label></div><button data-rebuild>Apply preview dimensions</button>
    <div data-viewer></div><button data-rotate>Rotate view</button><button data-closer>Zoom in</button><button data-farther>Zoom out</button><button data-reset>Reset view</button>
    <p>Photo patches retain shadows and objects visible in the source. Uncovered walls and the roof use procedural geometry, not observed details. Roof rise starts at a provisional 2 m. Dimension edits here do not alter the mapped world, doors or collisions.</p>
    <ul data-patches aria-label="Placed photo patches"></ul><button data-undo>Undo last edit</button><button data-save>Save private preview to account</button>
    <p data-saved></p>
  </section></div>`;
  const $=s=>dialog.querySelector(s), cache=new Map(), snapshots=[];
  let preview=structuredClone(capture.hybridPreview||{revision:0,footprintSignature:capture.footprintSignature,heightMeters:capture.buildingDetails?.heightMeters||capture.building?.spatialContext?.height?.meters||6,roofShape:['flat','gabled','hipped'].includes(capture.buildingDetails?.roofShape)?capture.buildingDetails.roofShape:'unknown',roofRiseMeters:2,patches:[]});
  let quad=[],selected=0,bitmap=null,viewer=null,busy=false,closed=false,editId=null,drag=false,dirty=false;
  const status=t=>{$('[data-status]').textContent=t;};
  const active=()=>{abort.signal.throwIfAborted();signal.throwIfAborted();};
  function setBusy(value){busy=value;dialog.querySelectorAll('button:not([data-close]),input,select').forEach(e=>e.disabled=value);}
  async function run(fn){if(busy||closed)return;setBusy(true);try{await fn();}catch(e){if(!closed)status(e.message);}finally{if(!closed)setBusy(false);}}
  function close(){if(closed)return;closed=true;abort.abort();viewer?.dispose();for(const b of cache.values())b.close?.();cache.clear();signal.removeEventListener('abort',close);dialog.close();dialog.remove();}
  signal.addEventListener('abort',close,{once:true});
  $('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const photoSelect=$('[data-photo-choice]');
  photos.forEach((p,i)=>photoSelect.add(new Option(`Photo ${i+1}`,p.id)));
  pts.forEach((p,i)=>$('[data-wall]').add(new Option(`Wall ${i+1} · ${Math.hypot(p.x-pts[(i+1)%pts.length].x,p.z-pts[(i+1)%pts.length].z).toFixed(1)} m`,String(i))));
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
  function coordinates(){const p=quad[selected];$('[data-corner]').value=selected;$('[data-x]').value=p?(p[0]*100).toFixed(1):'';$('[data-y]').value=p?(p[1]*100).toFixed(1):'';}
  function drawPhoto(updateFields=true){
    const c=$('[data-photo]');if(!bitmap)return;
    c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
    ctx.strokeStyle='#ffcb55';ctx.lineWidth=c.width/220;ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(p[0]*c.width,p[1]*c.height):ctx.moveTo(p[0]*c.width,p[1]*c.height));if(quad.length===4)ctx.closePath();ctx.stroke();
    quad.forEach((p,i)=>{ctx.fillStyle=i===selected?'#fff':'#ffcb55';ctx.beginPath();ctx.arc(p[0]*c.width,p[1]*c.height,c.width/65,0,Math.PI*2);ctx.fill();ctx.fillStyle='#05202b';ctx.font=`bold ${c.width/48}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p[0]*c.width,p[1]*c.height);});if(updateFields)coordinates();
  }
  async function selectPhoto(){bitmap=await photo(photoSelect.value);active();quad=[];selected=0;editId=null;drawPhoto();}
  function drawPlan(){
    const c=$('[data-plan]');c.width=640;c.height=320;const ctx=c.getContext('2d');ctx.clearRect(0,0,640,320);
    const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minx=Math.min(...xs),minz=Math.min(...zs),dx=Math.max(...xs)-minx,dz=Math.max(...zs)-minz,scale=Math.min(500/dx,220/dz);
    const xy=p=>[70+(p.x-minx)*scale,50+(p.z-minz)*scale];ctx.fillStyle='#cdebf1';ctx.font='20px system-ui';ctx.fillText('N ↑',560,32);
    pts.forEach((p,i)=>{const a=xy(p),b=xy(pts[(i+1)%pts.length]);ctx.strokeStyle=i===Number($('[data-wall]').value)?'#ffcb55':'#7fb1bc';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(String(i+1),(a[0]+b[0])/2,(a[1]+b[1])/2-8);ctx.fillStyle='#ffcb55';ctx.fillRect(a[0]-3,a[1]-3,6,6);});
  }
  function remember(){snapshots.push(structuredClone(preview));if(snapshots.length>10)snapshots.shift();dirty=true;$('[data-saved]').textContent='Unsaved preview changes.';}
  function patchList(){
    const ul=$('[data-patches]');ul.replaceChildren();
    preview.patches.forEach(p=>{const li=document.createElement('li');li.append(`Wall ${p.wall+1} · Photo ${photos.findIndex(x=>x.id===p.photoId)+1} `);
      const edit=document.createElement('button');edit.textContent='Adjust';edit.onclick=()=>run(async()=>{photoSelect.value=p.photoId;bitmap=await photo(p.photoId);quad=structuredClone(p.quad);selected=0;editId=p.id;$('[data-wall]').value=p.wall;dialog.querySelectorAll('[data-region]').forEach(e=>e.value=p.region[Number(e.dataset.region)]*100);drawPhoto();drawPlan();status('Adjust this patch, then choose Add photo patch to update it.');});
      const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>run(async()=>{remember();preview.patches=preview.patches.filter(x=>x.id!==p.id);await rebuild();});li.append(edit,remove);ul.append(li);
    });
  }
  async function rebuild(){
    active();const group=buildHybridShell(T,capture.building,preview.heightMeters,preview);
    try{
      for(const p of preview.patches){const b=await photo(p.photoId);active();const a=pts[p.wall],end=pts[(p.wall+1)%pts.length];const aspect=Math.hypot(end.x-a.x,end.z-a.z)*(p.region[2]-p.region[0])/(preview.heightMeters*(p.region[3]-p.region[1]));const canvas=rectifyPhoto(b,p.quad,aspect),texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;group.add(buildWallPatch(T,capture.building,preview.heightMeters,p,texture));}
      active();viewer?.dispose();viewer=await createCaptureViewer($('[data-viewer]'),null,abort.signal,{model:group,alignment:{},fitScale:.65,label:'Photo patches on the mapped building shell. Drag to orbit; uncovered surfaces are procedural.'});
      active();bitmap=await photo(photoSelect.value);drawPhoto();patchList();
    }catch(e){group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});throw e;}
  }
  photoSelect.onchange=()=>run(selectPhoto);$('[data-wall]').onchange=drawPlan;
  $('[data-corner]').onchange=()=>{selected=Number($('[data-corner]').value);drawPhoto();};
  const c=$('[data-photo]');const pointer=e=>{const r=c.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  c.onpointerdown=e=>{if(busy)return;e.preventDefault();const p=pointer(e);if(quad.length<4){selected=quad.length;quad.push(p);}else{selected=quad.reduce((best,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(quad[best][0]-p[0],quad[best][1]-p[1])?i:best,0);quad[selected]=p;}drag=true;c.setPointerCapture(e.pointerId);drawPhoto();};
  c.onpointermove=e=>{if(drag&&!busy){quad[selected]=pointer(e);drawPhoto();}};c.onpointerup=c.onpointercancel=()=>{drag=false;};
  // Do not rewrite the focused fields while a person is entering a coordinate:
  // blur-time formatting can move the caret and silently change their number.
  for(const key of ['x','y'])$(`[data-${key}]`).oninput=()=>{if($('[data-x]').value===''||$('[data-y]').value==='')return;const x=Number($('[data-x]').value)/100,y=Number($('[data-y]').value)/100;if([x,y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&selected<=quad.length){quad[selected]=[x,y];drawPhoto(false);}};
  c.onkeydown=e=>{const offset={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]}[e.key];if(offset&&quad[selected]&&!busy){e.preventDefault();quad[selected]=quad[selected].map((v,i)=>Math.max(0,Math.min(1,v+offset[i]*(e.shiftKey?10:1))));drawPhoto();}};
  $('[data-clear]').onclick=()=>{quad=[];selected=0;drawPhoto();};
  $('[data-new]').onclick=()=>{editId=null;quad=[];selected=0;dialog.querySelectorAll('[data-region]').forEach(e=>e.value=Number(e.dataset.region)<2?0:100);drawPhoto();status('Choose another photo or wall and mark its four corners.');};
  $('[data-add]').onclick=()=>run(async()=>{
    validateQuad(quad);const region=[...dialog.querySelectorAll('[data-region]')].map(e=>Number(e.value)/100),wall=Number($('[data-wall]').value);
    const patch={id:editId||crypto.randomUUID(),photoId:photoSelect.value,quad:structuredClone(quad),wall,region};
    const check=buildWallPatch(T,capture.building,preview.heightMeters,patch,null);check.geometry.dispose();check.material.dispose();
    if(preview.patches.some(p=>p.id!==editId&&p.wall===wall&&Math.min(p.region[2],region[2])-Math.max(p.region[0],region[0])>.001&&Math.min(p.region[3],region[3])-Math.max(p.region[1],region[1])>.001))throw Error('This overlaps an existing patch. Adjust that patch or choose a separate wall region.');
    if(!editId&&preview.patches.length>=16)throw Error('This preview supports 16 patches. Adjust an existing patch to improve it.');
    remember();preview.patches=preview.patches.filter(p=>p.id!==editId);preview.patches.push(patch);editId=patch.id;await rebuild();status('Photo patch applied. Rotate the building and check alignment before saving.');
  });
  $('[data-rebuild]').onclick=()=>run(async()=>{const height=Number($('[data-height]').value),rise=Number($('[data-rise]').value);if(!Number.isFinite(height)||height<1||height>1200||!Number.isFinite(rise)||rise<.3||rise>20)throw Error('Enter valid wall and roof dimensions.');remember();preview.heightMeters=height;preview.roofShape=$('[data-roof]').value;preview.roofRiseMeters=rise;await rebuild();status('Preview dimensions updated; mapped geometry is unchanged.');});
  $('[data-undo]').onclick=()=>run(async()=>{if(!snapshots.length)return;const revision=preview.revision;preview=snapshots.pop();preview.revision=revision;dirty=true;$('[data-height]').value=preview.heightMeters;editId=null;await rebuild();status('Last preview edit undone. Save to keep this version.');});
  $('[data-save]').onclick=()=>run(async()=>{const result=await save({...preview,baseRevision:preview.revision});active();preview=structuredClone(result.preview);dirty=false;$('[data-saved]').textContent=`Private preview saved · revision ${preview.revision}. Available through this account; the original reconstruction is unchanged.`;status('Saved. Nothing was published to the world.');});
  $('[data-rotate]').onclick=()=>viewer?.rotate();$('[data-reset]').onclick=()=>viewer?.reset();
  $('[data-closer]').onclick=()=>viewer?.zoom(.8);$('[data-farther]').onclick=()=>viewer?.zoom(1.25);
  document.body.append(dialog);dialog.showModal();
  await run(async()=>{await selectPhoto();drawPlan();await rebuild();});
  return {close,getState:()=>({revision:preview.revision,patches:preview.patches.length,dirty,closed,buildingId:capture.building.sourceBuildingId})};
}
