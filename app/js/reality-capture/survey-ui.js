import './capture-theme.js';
import {observeAuth} from '../../../js/auth-ui.js?v=55';
import {normalizeCapturePhoto} from '../../../js/community-reality-capture-api.js?v=4';
import {saveLocalCapturePhoto} from './local-draft-store.js';
import {loadSurvey,saveSurvey,surveyOwner,surveyBuildingKey,localSurveyEnabled} from './survey-store.js';
import {normalizeSurveyMetadata} from './survey-metadata.js';
import {rankSurveyBuildings} from './survey-association.js';
import {wallDirections} from './orientation.js';
import {hasStableMappedBuildingIdentity} from './runtime-contract.js';

const MAX_PHOTOS=120,MAX_BYTES=500*1024*1024;
let active=null;
export async function openPhotoSurvey({appCtx=null,building=null}={}){
  if(!localSurveyEnabled())throw Error('Open Photo Survey in the local test app.');
  if(active){active.focus();return;}
  const owner=surveyOwner(),loaded=await loadSurvey(owner),survey=loaded.survey;
  const photos=new Map(loaded.photos.map(p=>[p.id,p])),urls=new Map(),selected=new Set(),abort=new AbortController();
  const dialog=document.createElement('dialog');dialog.className='realityCaptureDialog photoSurvey';active=dialog;
  dialog.setAttribute('aria-label','Photo Survey');
  dialog.innerHTML=`<style>
    .photoSurvey{width:min(1150px,96vw);max-height:94dvh}.photoSurvey header,.photoSurvey nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.photoSurvey header h2{flex:1}.photoSurvey button{width:auto;display:inline-block;margin:4px 0}.photoSurvey input,.photoSurvey select{max-width:100%;min-height:44px;background:#101921;color:#f4f7f9;border:1px solid #53606a;padding:6px;font:inherit}.photoSurvey [hidden]{display:none!important}.photoSurvey .surveyColumns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.photoSurvey [data-survey-gallery]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.photoSurvey article{border:1px solid #53606a;padding:8px;overflow-wrap:anywhere}.photoSurvey article img{width:100%;height:110px;object-fit:contain;background:#18232b}.photoSurvey article label{display:block}.photoSurvey article p{font-size:12px}.photoSurvey [data-survey-map]{background:#17272e;width:100%;height:270px}.photoSurvey [data-survey-status]{border-left:3px solid #2d7dff;padding:10px;min-height:44px}.photoSurvey a{color:#9ae0ee}.photoSurvey .surveyInfo{color:#bbcad3}.photoSurvey input[type=checkbox]{width:24px;min-height:24px;vertical-align:middle}.photoSurvey footer{margin-top:16px}@media(max-width:700px){.photoSurvey .surveyColumns{display:block}.photoSurvey [data-survey-gallery]{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style><header><h2>Photo Survey</h2><button data-survey-close>Back to world</button></header>
    <p>Import photos, confirm the building and side, then crop them in the photo editor.</p>
    <p class="surveyInfo">Private local test · saved in this browser only. Nothing is uploaded or published. Use the same local address and account when returning.</p>
    <label>Add photos <input data-survey-import type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple></label>
    <p data-survey-status role="status" aria-live="polite"></p>
    <div class="surveyColumns"><section><h3>Your photos</h3><nav><label>Show <select data-survey-filter><option value="all">All photos</option><option value="unassigned">Unassigned</option><option value="confirmed">Confirmed</option><option value="ignored">Ignored</option></select></label><button data-survey-select-page>Select this page</button><button data-survey-unassign>Unassign selected</button><button data-survey-ignore>Ignore selected</button></nav><div data-survey-gallery></div><nav><button data-survey-prev>Previous</button><span data-survey-page></span><button data-survey-next>Next</button></nav></section>
    <section><h3>Match a mapped building</h3><p data-survey-area></p><a data-survey-world>Open the world to choose a building</a>
    <svg data-survey-map role="img" aria-label="Nearby mapped building outlines, north up"></svg><p>North is up. Tap an outline or choose a building below. These are the buildings loaded by the game, not guessed photo locations.</p>
    <label>Building <select data-survey-building></select></label><p data-survey-building-id></p><label>Side <select data-survey-wall></select></label><p>Directions describe where the wall faces. Photo rotation is not compass direction. Confirm the side before placing front doors.</p>
    <button data-survey-assign>Confirm selected photos here</button><button data-survey-edit>Edit this building’s photos</button><button data-survey-remove-preview>Remove local preview</button><p data-survey-coverage></p>
    <details><summary>Advanced · choose another area</summary><p>For photos with no location, use Travel in the world or enter a known map position. Do not use your current location for old photographs.</p><label>Latitude <input data-survey-lat type="number" min="-90" max="90" step="any"></label><label>Longitude <input data-survey-lon type="number" min="-180" max="180" step="any"></label><button data-survey-go>Open this area</button></details></section></div><footer>Photos without reliable location remain unassigned until you choose. A confirmed photo is not an approved contribution or proof of ownership.</footer>`;
  document.body.append(dialog);dialog.showModal();
  const $=s=>dialog.querySelector(s),status=t=>$('[data-survey-status]').textContent=t;
  let page=0,busy=false,targets=[],chosen=building||null,mapRange=60,streetMapAbort=null;
  const assertOwner=()=>{if(abort.signal.aborted||owner!==surveyOwner())throw Error('Account changed or survey closed. Your saved work is unchanged.');};
  const setBusy=value=>{busy=value;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=value);};
  async function run(fn){if(busy)return;setBusy(true);try{assertOwner();await fn();}catch(e){status(e.message);}finally{setBusy(false);}}
  const photoUrl=p=>{if(!urls.has(p.id))urls.set(p.id,URL.createObjectURL(p.thumbnail||p.blob));return urls.get(p.id);};
  const linkFor=meta=>{const u=new URL('./',new URL('../../',import.meta.url));u.pathname='/app/';u.search='?survey=1&mode=walking';if(meta?.location){u.searchParams.set('loc','custom');u.searchParams.set('lat',meta.location.latitude);u.searchParams.set('lon',meta.location.longitude);}return u.href;};
  $('[data-survey-world]').href=linkFor();
  if(appCtx){
    const {buildTarget}=await import('./ui.js?v=2');
    const actor=appCtx.activeTransportActor?.()?.position||appCtx.car||{x:0,z:0};
    targets=(appCtx.buildings||[]).filter(hasStableMappedBuildingIdentity).map(b=>({b,x:b.centerX??(b.minX+b.maxX)/2,z:b.centerZ??(b.minZ+b.maxZ)/2})).sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z)).slice(0,200).map(({b,x,z})=>buildTarget(appCtx,{sourceBuildingId:b.sourceBuildingId,label:b.name||b.label||'Mapped building',position:{x,z}})).filter(b=>b.spatialContext?.footprint?.length>=3);
    if(chosen&&!targets.some(b=>surveyBuildingKey(b)===surveyBuildingKey(chosen)))targets.unshift(chosen);
  }
  const focus=new URLSearchParams(location.search).get('surveyBuilding');
  chosen=chosen||targets.find(b=>b.sourceBuildingId===focus)||targets[0]||null;
  const matchControls=document.createElement('div'),startControl=$('[data-survey-map]'),lastControl=$('[data-survey-coverage]');startControl.before(matchControls);
  for(let node=startControl;node;){const next=node.nextSibling;matchControls.append(node);if(node===lastControl)break;node=next;}matchControls.hidden=!chosen;
  const zoom=document.createElement('nav');for(const [label,factor]of [['Zoom map in',.5],['Zoom map out',2]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{mapRange=Math.max(25,Math.min(300,mapRange*factor));drawMap();};zoom.append(button);}$('[data-survey-map]').after(zoom);
  const streetDetails=document.createElement('details'),streetSummary=document.createElement('summary'),streetHost=document.createElement('div');streetSummary.textContent='Show surrounding streets for this building';streetDetails.append(streetSummary,streetHost);zoom.after(streetDetails);
  async function streetMap(){streetMapAbort?.abort();streetMapAbort=new AbortController();streetHost.replaceChildren();if(!chosen||!streetDetails.open)return;const {mountCaptureMap}=await import('./map-context.js');if(!abort.signal.aborted)mountCaptureMap(streetHost,chosen,chosen.spatialContext.footprint,wall=>{$('[data-survey-wall]').value=String(wall);},streetMapAbort.signal);}
  streetDetails.addEventListener('toggle',()=>{void streetMap().catch(e=>status(e.message));});
  $('[data-survey-area]').textContent=targets.length?`${targets.length} nearby mapped buildings available. Select the one shown in your photos.`:'Open the game and travel to the photographed neighborhood. Photo Survey will reopen with its actual mapped buildings.';
  $('[data-survey-building]').replaceChildren(...targets.map((b,i)=>new Option(`${i+1} · ${b.label}`,String(i))));
  function drawMap(){const svg=$('[data-survey-map]');svg.replaceChildren();if(!targets.length)return;
    const center=chosen||targets[0],cos=Math.cos(center.lat*Math.PI/180),rings=targets.map(b=>({b,pts:b.spatialContext.footprint.map(p=>({x:p.x+(b.lon-center.lon)*111320*cos,z:p.z+(center.lat-b.lat)*111320}))})).filter(r=>r.pts.some(p=>Math.hypot(p.x,p.z)<180));
    svg.setAttribute('viewBox',`${-mapRange} ${-mapRange} ${mapRange*2} ${mapRange*2}`);
    for(const {b,pts} of rings){const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('points',pts.map(p=>`${p.x},${p.z}`).join(' '));poly.setAttribute('fill',surveyBuildingKey(b)===surveyBuildingKey(chosen)?'#2d7dff':'#627d83');poly.setAttribute('stroke','#d6e9ed');poly.setAttribute('stroke-width','.7');poly.setAttribute('tabindex','0');poly.setAttribute('role','button');poly.setAttribute('aria-label',`${b.label} ${b.sourceBuildingId}`);const choose=()=>{chosen=b;renderBuilding();};poly.onclick=choose;poly.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose();}};svg.append(poly);const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',pts.reduce((n,p)=>n+p.x,0)/pts.length);label.setAttribute('y',pts.reduce((n,p)=>n+p.z,0)/pts.length);label.setAttribute('fill','white');label.setAttribute('font-size',mapRange/17);label.setAttribute('text-anchor','middle');label.setAttribute('pointer-events','none');label.textContent=String(targets.indexOf(b)+1);svg.append(label);}
  }
  function renderBuilding(){
    if(!chosen){$('[data-survey-building-id]').textContent='No building selected.';return;}
    $('[data-survey-building]').value=String(targets.indexOf(chosen));
    $('[data-survey-building-id]').textContent=chosen.sourceBuildingId;
    $('[data-survey-wall]').replaceChildren(new Option('Side unknown — choose in editor',''),...wallDirections(chosen.spatialContext.footprint).map(w=>new Option(`Wall ${w.wall+1} · faces ${w.compass} · ${w.length.toFixed(1)} m`,String(w.wall))));
    const key=surveyBuildingKey(chosen),entries=survey.entries.filter(e=>e.assignment?.key===key&&!e.ignored),preview=survey.previews[key];
    const walls=new Set(entries.map(e=>e.assignment.wall).filter(Number.isInteger));
    $('[data-survey-coverage]').textContent=`${entries.length} confirmed photos · ${walls.size} sides identified · ${preview?.preview?.patches?.length||0} saved local patches. Not published.`;
    drawMap();if(streetDetails.open)void streetMap().catch(e=>status(e.message));
  }
  function render(){
    const filter=$('[data-survey-filter]').value,visible=survey.entries.filter(e=>filter==='all'||(filter==='ignored'?e.ignored:filter==='confirmed'?e.assignment&&!e.ignored:!e.assignment&&!e.ignored));
    page=Math.min(page,Math.max(0,Math.ceil(visible.length/12)-1));const slice=visible.slice(page*12,page*12+12),gallery=$('[data-survey-gallery]');gallery.replaceChildren();
    for(const entry of slice){const p=photos.get(entry.id);if(!p)continue;const card=document.createElement('article'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(entry.id);check.onchange=()=>check.checked?selected.add(entry.id):selected.delete(entry.id);const image=document.createElement('img');image.src=photoUrl(p);image.alt=entry.name;label.append(check,document.createTextNode(entry.name),image);card.append(label);
      const info=document.createElement('p');info.textContent=entry.ignored?'Ignored':entry.assignment?`Confirmed · ${entry.assignment.building.label} · ${entry.assignment.wall===null?'side unknown':`wall ${entry.assignment.wall+1}`}`:entry.metadata.location?'Unassigned · camera location available':'Unassigned · no usable photo location';card.append(info);
      const quality=document.createElement('p');quality.textContent=[p.quality?.focus,p.quality?.exposure,entry.similarTo?'Similar to another photo—check before using':''].filter(Boolean).join(' · ');card.append(quality);
      const suggestions=rankSurveyBuildings(entry.metadata,targets);
      for(const candidate of suggestions.slice(0,2)){const button=document.createElement('button');button.textContent=`Review suggestion · ${candidate.confidence} · ${candidate.building.label}`;button.title=candidate.reason;button.onclick=()=>{chosen=candidate.building;renderBuilding();$('[data-survey-wall]').value=candidate.wall===null?'':String(candidate.wall);selected.clear();selected.add(entry.id);render();status(candidate.reason+' Press Confirm selected photos here if correct.');};card.append(button);}
      if(entry.metadata.location){const link=document.createElement('a');link.href=linkFor(entry.metadata);link.textContent='Open photo area';card.append(link);}gallery.append(card);
    }
    $('[data-survey-page]').textContent=`${visible.length? page*12+1:0}–${Math.min(page*12+12,visible.length)} of ${visible.length}`;
    $('[data-survey-select-page]').onclick=()=>{slice.forEach(e=>selected.add(e.id));render();};
    let groups=$('[data-survey-groups]');if(!groups){groups=document.createElement('section');groups.dataset.surveyGroups='';$('[data-survey-gallery]').before(groups);}groups.replaceChildren();
    const assigned=new Map();for(const e of survey.entries)if(e.assignment&&!e.ignored)assigned.set(e.assignment.key,e.assignment.building);
    for(const [key,b] of assigned){const row=document.createElement('p'),count=survey.entries.filter(e=>e.assignment?.key===key&&!e.ignored).length;row.textContent=`${b.label} · ${count} photos · ${survey.previews[key]?.preview.patches.length||0} local patches `;
      const link=document.createElement('a'),parts=b.worldId.split(':');const u=new URL('/app/',location.origin);u.searchParams.set('survey','1');u.searchParams.set('mode','walking');u.searchParams.set('surveyBuilding',b.sourceBuildingId);if(parts[0]==='earth'&&parts.length===4){u.searchParams.set('loc','custom');u.searchParams.set('lat',Number(parts[2])/1e7);u.searchParams.set('lon',Number(parts[3])/1e7);}link.href=u.href;link.textContent='Open saved place';row.append(link);groups.append(row);}
  }
  async function perceptualHash(blob){const bitmap=await createImageBitmap(blob,{resizeWidth:9,resizeHeight:8});try{const c=document.createElement('canvas');c.width=9;c.height=8;const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,9,8);const d=context.getImageData(0,0,9,8).data;let bits='';for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a=(y*9+x)*4,b=a+4;bits+=(d[a]+d[a+1]+d[a+2])>(d[b]+d[b+1]+d[b+2])?'1':'0';}return bits;}finally{bitmap.close();}}
  $('[data-survey-import]').onchange=e=>{const files=[...e.target.files];e.target.value='';void run(async()=>{
    if(files.length>MAX_PHOTOS||files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw Error('Choose up to 120 photos / 500 MB per import. Nothing was added.');
    const {parse}=await import('../../vendor/exifr/exifr.js');let added=0,duplicates=0,failed=0;
    for(const file of files){assertOwner();if(survey.entries.length>=MAX_PHOTOS){status('This survey has 120 photos. Ignore or finish existing photos before another batch.');break;}
      try{if(file.size>32*1024*1024)throw Error('Photo exceeds 32 MB');status(`Reading ${added+duplicates+failed+1} of ${files.length}: ${file.name}`);
        const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(survey.entries.some(e=>e.hash===hash)){duplicates++;continue;}
        if([...photos.values()].reduce((sum,p)=>sum+(p.sourceBytes||0),0)+file.size>MAX_BYTES)throw Error('Survey source budget exceeded (500 MB).');
        const metadata=normalizeSurveyMetadata(await parse(bytes,{translateValues:false,translateDates:false}).catch(()=>({}))||{});
        const photo=await normalizeCapturePhoto(file),phash=await perceptualHash(photo.thumbnail),similar=survey.entries.find(e=>e.phash&&[...phash].filter((bit,i)=>bit!==e.phash[i]).length<=4);
        assertOwner();await saveLocalCapturePhoto(survey.id,photo,0);photos.set(photo.id,photo);survey.entries.push({id:photo.id,name:file.name.slice(0,160),hash,phash,similarTo:similar?.id||null,metadata,assignment:null,ignored:false});await saveSurvey(survey);added++;render();await new Promise(r=>requestAnimationFrame(r));
      }catch(error){failed++;status(`${file.name}: ${error.message}`);if(owner!==surveyOwner()||abort.signal.aborted)throw error;}
    }
    status(`${added} photos added · ${duplicates} exact duplicates skipped · ${failed} could not be added. Saved privately on this device. Select photos and confirm their mapped building.`);
  });};
  $('[data-survey-building]').onchange=()=>{chosen=targets[Number($('[data-survey-building]').value)];renderBuilding();};
  $('[data-survey-assign]').onclick=()=>run(async()=>{if(!chosen||!selected.size)throw Error('Select photos and a mapped building first.');const wall=$('[data-survey-wall]').value;for(const entry of survey.entries)if(selected.has(entry.id)){entry.assignment={key:surveyBuildingKey(chosen),building:chosen,wall:wall===''?null:Number(wall),confirmedAt:Date.now(),source:'contributor-confirmed'};entry.ignored=false;}await saveSurvey(survey);render();renderBuilding();status('Assignment saved. Open the photo editor to crop and place the images.');});
  for(const [selector,ignore]of [['[data-survey-unassign]',false],['[data-survey-ignore]',true]])$(selector).onclick=()=>run(async()=>{for(const e of survey.entries)if(selected.has(e.id)){e.assignment=null;e.ignored=ignore;}await saveSurvey(survey);render();renderBuilding();status('Organization saved. Existing local wall patches are unchanged; remove their preview separately if needed.');});
  $('[data-survey-remove-preview]').onclick=()=>run(async()=>{if(!chosen)return;delete survey.previews[surveyBuildingKey(chosen)];await saveSurvey(survey,{previewChanged:true});renderBuilding();status('Local preview removed. Photos are retained; the public building was never changed.');});
  $('[data-survey-edit]').onclick=()=>run(async()=>{if(!chosen)throw Error('Choose a mapped building first.');const key=surveyBuildingKey(chosen),entries=survey.entries.filter(e=>e.assignment?.key===key&&!e.ignored);if(!entries.length)throw Error('Confirm at least one photo for this building first.');
    const prior=survey.previews[key],ids=new Set([...entries.map(e=>e.id),...(prior?.preview?.patches||[]).map(p=>p.photoId)]),images=[...ids].map(id=>photos.get(id)).filter(Boolean);
    const {openHybridEditor}=await import('./hybrid-editor.js?v=1');
    await openHybridEditor({capture:{captureId:`survey:${key}`,ownerUid:owner,captureKind:'exterior',building:chosen,hybridPreview:prior?.preview},photos:images,signal:abort.signal,initialWall:entries[0].assignment.wall??0,saveScope:'device',loadPhoto:async id=>{assertOwner();const photo=photos.get(id);if(!photo)throw Error('Photo missing from this device');return photo.blob;},save:async input=>{assertOwner();const current=survey.previews[key]?.preview;if((current?.revision||0)!==input.baseRevision)throw Error('Preview changed. Reopen this building.');const preview={...input,revision:(current?.revision||0)+1};survey.previews[key]={building:chosen,preview};await saveSurvey(survey,{previewChanged:true});renderBuilding();return {preview};},onClose:()=>status('Saved local patches appear on this building in the local world. Close Photo Survey to look around.')});
  });
  $('[data-survey-filter]').onchange=()=>{page=0;render();};$('[data-survey-prev]').onclick=()=>{page=Math.max(0,page-1);render();};$('[data-survey-next]').onclick=()=>{page++;render();};
  $('[data-survey-go]').onclick=()=>{const lat=$('[data-survey-lat]').value,lon=$('[data-survey-lon]').value;if(lat===''||lon===''||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180){status('Enter a valid latitude and longitude.');return;}location.href=linkFor({location:{latitude:Number(lat),longitude:Number(lon)}});};
  let unsubscribe=()=>{};
  function close(){abort.abort();unsubscribe();streetMapAbort?.abort();for(const url of urls.values())URL.revokeObjectURL(url);dialog.close();dialog.remove();active=null;appCtx?.setPauseReason?.('photo-survey',false);}
  unsubscribe=observeAuth(()=>{if(owner!==surveyOwner())close();});
  $('[data-survey-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)close();});
  appCtx?.setPauseReason?.('photo-survey',true);document.exitPointerLock?.();
  render();renderBuilding();status(`${survey.entries.length} photos saved on this device. Choose a building to continue.`);
  return {close};
}
