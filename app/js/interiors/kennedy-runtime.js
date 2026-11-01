import {loadOwnedLandmarkModel,disposeLandmarkModel} from '../world/landmark-lifetime.js';
import {acquireVenueLighting} from './venue-lighting.js';
import {getScreenLayoutService} from '../ui/screen-layout.js?v=3';
import {KENNEDY_CONTENT} from './kennedy-content.js';

export function closeKennedyPanel(ctx,active){
 const state=active?.facility,panel=state?.panel;if(!panel)return;
 state.panel=null;panel.listeners.abort();panel.dialog.close();panel.dialog.remove();ctx.setPauseReason?.('facility_inspect',false);state.layout?.setPanelLayer?.('museum',false);panel.focus?.isConnected&&panel.focus.focus({preventScroll:true});
}
export function handleKennedyAction(ctx,active,interaction){
 const state=active?.facility,station=KENNEDY_CONTENT.stations.find(s=>s.id===interaction.stationId);if(!state?.current()||!station)return false;
 closeKennedyPanel(ctx,active);
 if(!document.getElementById('galleryStyle')){const style=document.createElement('link');style.id='galleryStyle';style.rel='stylesheet';style.href=new URL('../../styles/gallery.css',import.meta.url).href;document.head.append(style);}
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const dialog=node('dialog'),listeners=new AbortController();dialog.className='galleryDialog';dialog.setAttribute('aria-label',station.title);
 state.panel={dialog,listeners,focus:document.activeElement};const header=node('header'),close=node('button','Close');close.type='button';header.append(node('h2',station.title),close);dialog.append(header,node('p',station.text),node('p',station.task));
 if(station.id==='orientation'){
  const map=document.createElementNS('http://www.w3.org/2000/svg','svg');map.setAttribute('viewBox','-85 -76 170 235');map.setAttribute('role','img');map.setAttribute('aria-label','North exit, four high bays beside the central transfer aisle, and the south low bay');map.classList.add('galleryMap');
  const shape=(tag,attrs,text)=>{const el=document.createElementNS(map.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text)el.textContent=text;map.append(el);};
  shape('rect',{x:-79,y:-67,width:158,height:134,fill:'#263b43',stroke:'#c3d1d4'});shape('rect',{x:-65,y:67,width:130,height:78,fill:'#263b43',stroke:'#c3d1d4'});shape('rect',{x:-14,y:-67,width:28,height:212,fill:'#46605d'});
  for(const [x,y,label] of [[0,-70,'NORTH EXIT'],[-46,-33,'HIGH BAY'],[46,-33,'HIGH BAY'],[-46,35,'HIGH BAY'],[46,35,'HIGH BAY'],[0,110,'LOW BAY']])shape('text',{x,y,fill:'#fff','font-size':7,'text-anchor':'middle'},label);
  dialog.append(map);
 }
 if(station.id==='low-bay'){
  let index=0;const order=['Prepare components','Assemble in the high bay','Roll out to the pad'],status=node('p','Choose the first step.'),buttons=node('div');buttons.className='galleryActions';dialog.append(status,buttons);
  for(const label of [order[2],order[0],order[1]]){const b=node('button',label);b.type='button';buttons.append(b);b.addEventListener('click',()=>{if(index===3)return;if(label===order[index]){index++;b.disabled=true;status.textContent=index===3?'Sequence complete. Assembly and transport are separate parts of the same launch system.':`Step ${index} complete. What comes next?`;}else status.textContent='That comes later. Think about what must be ready before the rocket can move.';},{signal:listeners.signal});}
 }
 const details=node('details'),summary=node('summary','About this reconstruction'),source=node('a','NASA facility reference');source.href=KENNEDY_CONTENT.source;source.target='_blank';source.rel='noopener noreferrer';details.append(summary,node('p',KENNEDY_CONTENT.description),source);dialog.append(details);
 close.addEventListener('click',()=>closeKennedyPanel(ctx,active),{signal:listeners.signal});dialog.addEventListener('cancel',e=>{e.preventDefault();closeKennedyPanel(ctx,active);},{signal:listeners.signal});
 state.layout=ctx.screenLayout||getScreenLayoutService();state.layout.setPanelLayer?.('museum',true);ctx.setPauseReason?.('facility_inspect',true);document.body.append(dialog);dialog.showModal();close.focus();return true;
}
export function attachKennedy(ctx,T,active){
 if(!active.definition.facilityContent)return;
 const controller=new AbortController(),lighting=acquireVenueLighting(ctx,active.group),state={controller,lighting,models:[],panel:null};active.facility=state;
 state.current=()=>!controller.signal.aborted&&ctx.activeInterior===active&&ctx._worldLoadSequence===active.outsideWorldSequence;
 state.ready=(async()=>{
  try{
   const model=await loadOwnedLandmarkModel(T,new URL('../../assets/models/nasa/crawler.glb',import.meta.url).href,controller.signal);
   if(!state.current()){disposeLandmarkModel(model);return;}
   model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])m.fog=false;}});
   model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=40/Math.max(size.x,size.z);
   model.scale.multiplyScalar(scale);model.position.add(new T.Vector3(-center.x*scale,-bounds.min.y*scale,-center.z*scale));
   const exhibit=new T.Group();exhibit.position.set(-46,0,-25);exhibit.add(model);active.group.add(exhibit);lighting.apply(exhibit);state.models.push(exhibit);state.modelReady=true;
  }catch(error){if(state.current()){state.error=String(error.message);console.warn('[Kennedy] Crawler unavailable:',error.message);}}
 })();
}
export function disposeKennedy(ctx,active){
 const state=active?.facility;if(!state)return;closeKennedyPanel(ctx,active);state.controller.abort();state.lighting.release();state.models.forEach(disposeLandmarkModel);state.models.length=0;active.facility=null;
}
