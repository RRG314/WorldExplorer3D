import {getScreenLayoutService} from '../ui/screen-layout.js?v=3';
import {roomRing,layoutEntrance,pointInRoom,floorWalls} from '../../../functions/interior-layout.mjs';

const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const button=(text,action)=>{const el=node('button',text);el.type='button';el.dataset.galleryAction=action;return el;};
function ensureStyle(){if(document.getElementById('galleryStyle'))return;const link=document.createElement('link');link.id='galleryStyle';link.rel='stylesheet';link.href=new URL('../../styles/gallery.css',import.meta.url).href;document.head.append(link);}
function galleryMap(ctx,active){
  const layout=active.definition.authoredLayout,floor=layout.floors[0],vertices=Object.values(floor.vertices),xs=vertices.map(p=>p.x),zs=vertices.map(p=>p.z);
  const minX=Math.min(...xs)-1,maxX=Math.max(...xs)+1,minZ=Math.min(...zs)-1,maxZ=Math.max(...zs)+1;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`${minX} ${minZ} ${maxX-minX} ${maxZ-minZ}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Gallery floor map, showing rooms, exhibits, your position and the exit.');svg.classList.add('galleryMap');
  const shape=(type,attrs,text)=>{const el=document.createElementNS(svg.namespaceURI,type);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text)el.textContent=text;svg.append(el);return el;};
  for(const room of floor.rooms){const ring=roomRing(floor,room);shape('polygon',{points:ring.map(p=>`${p.x},${p.z}`).join(' '),fill:'#1d303a',stroke:'#8c9ea8','stroke-width':.12});}
  for(const door of floor.doors){const wall=floorWalls(floor).find(w=>w.id===door.wall);if(!wall)continue;const {a,b}=wall,len=Math.hypot(b.x-a.x,b.z-a.z),t=door.offset/len;const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;shape('line',{x1:x-(b.x-a.x)/len*door.width/2,y1:z-(b.z-a.z)/len*door.width/2,x2:x+(b.x-a.x)/len*door.width/2,y2:z+(b.z-a.z)/len*door.width/2,stroke:'#55cacc','stroke-width':.3});}
  active.definition.exhibitPlacements.forEach((p,i)=>{shape('circle',{cx:p.x,cy:p.z,r:.48,fill:active.gallery.saved.has(p.id)?'#4bc59a':'#d8bd81'});shape('text',{x:p.x,y:p.z+.21,'text-anchor':'middle','font-size':.65,fill:'#071018'},String(i+1));});
  const entrance=layoutEntrance(layout).point;shape('text',{x:entrance.x,y:entrance.z,'font-size':.75,fill:'#fff','text-anchor':'middle'},'EXIT');
  const walker=ctx.Walk?.state?.walker,p={x:(walker?.x||0)-active.center.x,z:(walker?.z||0)-active.center.z};
  shape('circle',{cx:p.x,cy:p.z,r:.3,fill:'#51dcec',stroke:'#fff','stroke-width':.1});
  const room=floor.rooms.find(room=>pointInRoom(p,roomRing(floor,room)));
  return {svg,room:room?.label||'Gallery entrance'};
}

export function closeGalleryPanel(ctx,active){
  const state=active?.gallery,panel=state?.panel;if(!panel)return false;
  state.panel=null;state.refresh=null;panel.listeners.abort();panel.dialog.close();panel.dialog.remove();
  ctx.setPauseReason?.('museum_inspect',false);ctx.screenLayout?.setPanelLayer?.('museum',false);
  if(panel.focus?.isConnected)panel.focus.focus({preventScroll:true});return true;
}
export function openGalleryPanel(ctx,active,exhibitId=null){
  const state=active.gallery;if(!state?.isCurrent())return false;
  closeGalleryPanel(ctx,active);ensureStyle();
  ctx.screenLayout ||= getScreenLayoutService();
  const dialog=node('dialog',undefined,'galleryDialog'),listeners=new AbortController(),panel={dialog,listeners,focus:document.activeElement,exhibitId,busy:false,message:''};state.panel=panel;
  dialog.setAttribute('aria-label','World Explorer Gallery');
  const render=()=>{
    if(!state.isCurrent()||state.panel!==panel)return;
    const focused=document.activeElement?.dataset.galleryAction;
    const content=active.definition.curatedContent,record=state.exhibits.get(panel.exhibitId);
    dialog.replaceChildren();
    const header=node('header'),heading=node('div');heading.append(node('span','REPRESENTATIVE GALLERY','galleryEyebrow'),node('h2',record?record.exhibit.title:'Gallery map'));header.append(heading,button('Close','close'));dialog.append(header);
    if(record){
      const e=record.exhibit,source=content.sources.find(s=>s.id===e.sourceId);
      if(record.instance?.root && globalThis.THREE){
        active.group.updateMatrixWorld(true);
        const bounds=new globalThis.THREE.Box3().setFromObject(record.instance.root),center=bounds.getCenter(new globalThis.THREE.Vector3());
        panel.viewTarget={x:center.x,y:center.y,z:center.z};
      }
      dialog.append(node('p',`${e.period} · ${e.collection}`,'galleryMeta'),node('p',e.description));
      const status=record.status==='ready'?'Display ready':record.status==='unavailable'?'The display could not load. You can still read this label and leave safely.':'Preparing the display…';
      const statusNode=node('p',status,'galleryMeta');statusNode.setAttribute('role','status');dialog.append(statusNode);
      const controls=node('div',undefined,'galleryActions');
      if(e.presentation==='sculpture'){for(const [label,action] of [['↶ Turn left','left'],['Turn right ↷','right']]){const b=button(label,action);b.disabled=record.status!=='ready';controls.append(b);}}
      if(record.status==='unavailable')controls.append(button('Retry display','retry'));
      const save=button(state.saved.has(e.id)?'Saved in Journal':panel.busy?'Saving…':'Save to Journal','save');save.disabled=state.saved.has(e.id)||panel.busy;controls.append(save,button('Gallery map','map'));dialog.append(controls);
      const sourceLink=node('a','Collection source');sourceLink.href=source.url;sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';
      const rightsLink=node('a','Rights and reuse');rightsLink.href=source.rightsEvidence;rightsLink.target='_blank';rightsLink.rel='noopener noreferrer';
      const credit=node('p',`${source.author} · ${source.license}. ${source.modifications}`,'galleryMeta');credit.append(document.createTextNode(' '),sourceLink,document.createTextNode(' · '),rightsLink);dialog.append(credit);
    }else{
      panel.viewTarget=null;
      const map=galleryMap(ctx,active);dialog.append(node('p',`You are in ${map.room}. ${state.saved.size} of ${content.exhibits.length} exhibits saved.`,'galleryMeta'),map.svg);
      const list=node('ol');content.exhibits.forEach((e,i)=>list.append(node('li',`${i+1}. ${e.title} — ${active.definition.authoredLayout.floors[0].rooms[e.roomIndex].label}${state.saved.has(e.id)?' · saved':''}`)));dialog.append(list);
      dialog.append(node('p','The entrance hall connects both galleries. Approach a display and use Interact to read its label. Return through the front door to leave.','galleryMeta'));
      if(state.journalError)dialog.append(button('Retry saved Journal notes','restore'));
    }
    if(panel.message){const message=node('p',panel.message);message.setAttribute('role','status');dialog.append(message);}
    const details=node('details'),summary=node('summary','About this gallery');details.append(summary,node('p',content.accuracyLabel));dialog.append(details);
    if(focused)dialog.querySelector(`[data-gallery-action="${focused}"]`)?.focus({preventScroll:true});
  };
  state.refresh=render;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeGalleryPanel(ctx,active);},{signal:listeners.signal});
  dialog.addEventListener('click',async event=>{
    const action=event.target.closest('[data-gallery-action]')?.dataset.galleryAction;if(!action)return;
    event.stopPropagation();const record=state.exhibits.get(panel.exhibitId);
    if(action==='close'){closeGalleryPanel(ctx,active);return;}
    if(action==='map'){panel.exhibitId=null;panel.message='';}
    if((action==='left'||action==='right')&&record?.instance)record.instance.root.rotation.y+=(action==='left'?-1:1)*Math.PI/8;
    if(action==='retry'&&record){void state.loadExhibit(record.exhibit.id);return;}
    if(action==='restore'){void state.restore();return;}
    if(action==='save'&&record&&!panel.busy){panel.busy=true;render();try{await state.save(record.exhibit.id);panel.message='Saved to your Journal on this device.';}catch{panel.message='Your note was not saved. Try again; existing notes are kept.';}finally{panel.busy=false;}}
    render();
  },{signal:listeners.signal});
  // Native modal focus containment plus the existing pause authority prevent
  // keyboard/touch input from moving the character behind the reading panel.
  dialog.addEventListener('keydown',event=>event.stopPropagation(),{signal:listeners.signal});
  document.exitPointerLock?.();document.body.append(dialog);render();dialog.showModal();
  ctx.setPauseReason?.('museum_inspect',true);ctx.screenLayout?.setPanelLayer?.('museum',true);dialog.querySelector('button')?.focus();return true;
}
