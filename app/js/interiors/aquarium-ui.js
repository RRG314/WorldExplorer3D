import {getScreenLayoutService} from '../ui/screen-layout.js?v=2';
import {roomRing} from '../../../functions/interior-layout.mjs';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const button=(label,action)=>{const b=node('button',label);b.type='button';b.dataset.venueAction=action;return b;};
function visitorMap(ctx,active,level){
 const floor=active.definition.authoredLayout.floors[level],habitat=level>0?active.definition.aquariumPlan.habitat.outline:[],vertices=[...Object.values(floor.vertices),...habitat],xs=vertices.map(p=>p.x),zs=vertices.map(p=>p.z),ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`${Math.min(...xs)-2} ${Math.min(...zs)-2} ${Math.max(...xs)-Math.min(...xs)+4} ${Math.max(...zs)-Math.min(...zs)+4}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${floor.label}: visitor rooms, lifts and your position`);svg.classList.add('galleryMap');
 const draw=(type,attrs,label)=>{const e=document.createElementNS(ns,type);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(label)e.textContent=label;svg.append(e);};
 if(habitat.length)draw('polygon',{points:habitat.map(p=>`${p.x},${p.z}`).join(' '),fill:'#104b61',stroke:'#53a9bd','stroke-width':.2});
 for(const r of floor.rooms)draw('polygon',{points:roomRing(floor,r).map(p=>`${p.x},${p.z}`).join(' '),fill:'#1e3944',stroke:'#adc1c4','stroke-width':.2});
 for(const l of active.authoredLifts)for(const s of l.stops.filter(s=>s.level===level))draw('text',{x:s.x-active.center.x,y:s.z-active.center.z,'font-size':1.5,fill:'#f4d17b'},l.id==='reef-lift-a'?'A':'↕');
 if(level===active.activeLevel){const w=ctx.Walk.state.walker;draw('circle',{cx:w.x-active.center.x,cy:w.z-active.center.z,r:.65,fill:'#64eddd',stroke:'#fff','stroke-width':.2});}
 return svg;
}
export function closeAquariumPanel(ctx,active){
 const s=active?.aquarium,p=s?.panel;if(!p)return false;s.panel=null;s.refresh=null;p.listeners.abort();p.dialog.close();p.dialog.remove();ctx.setPauseReason?.('aquarium_inspect',false);ctx.screenLayout?.setPanelLayer?.('aquarium',false);if(p.focus?.isConnected)p.focus.focus({preventScroll:true});return true;
}
export function openAquariumPanel(ctx,active,observationId=null){
 const s=active.aquarium;if(!s?.isCurrent())return false;closeAquariumPanel(ctx,active);
 if(!document.getElementById('galleryStyle')){const link=node('link');link.id='galleryStyle';link.rel='stylesheet';link.href=new URL('../../styles/gallery.css',import.meta.url).href;document.head.append(link);}
 ctx.screenLayout ||= getScreenLayoutService();const dialog=node('dialog');dialog.className='galleryDialog';dialog.setAttribute('aria-label','Aquarium visit');
 const p={dialog,observationId,level:active.activeLevel,listeners:new AbortController(),focus:document.activeElement,busy:false,message:''};s.panel=p;
 const content=active.definition.aquariumContent;
 function render(){
  if(!s.isCurrent()||s.panel!==p)return;const focused=document.activeElement?.dataset.venueAction;dialog.replaceChildren();
  const o=content.observations.find(o=>o.id===p.observationId),header=node('header'),title=node('div'),eyebrow=node('span','NATIONAL AQUARIUM · REEF VISIT');eyebrow.className='galleryEyebrow';title.append(eyebrow,node('h2',o?o.title:'Visitor map'));header.append(title,button('Close','close'));dialog.append(header);
  if(o){
   dialog.append(node('p',o.description),node('p',o.prompt));
   const actions=node('div');actions.className='galleryActions';const save=button(s.saved.has(o.id)?'Saved in Journal':p.busy?'Saving…':'Save observation','save');save.disabled=s.saved.has(o.id)||p.busy;actions.append(save,button('Visitor map','map'));dialog.append(actions);
   const source=content.sources.find(v=>v.id===o.sourceId),link=node('a','Exhibit information');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);
   const h=active.definition.aquariumPlan.habitat;p.viewTarget={x:active.center.x+h.routeCenter.x,y:active.floorBaseY+h.floor+1.8,z:active.center.z+h.routeCenter.z};
  }else{
   p.viewTarget=null;const choices=node('div');choices.className='galleryActions';active.floorPlan.floors.forEach((f,i)=>{const b=button(f.label,`floor:${i}`);b.disabled=i===p.level;choices.append(b);});dialog.append(choices,visitorMap(ctx,active,p.level));
   dialog.append(node('p',`${active.floorLabel} · ${s.saved.size} of ${content.observations.length} observations saved.`));
   const route=node('p','From G, take the Pavilion elevator to 1. Follow Blue Wonders to the reef overlook, then take Elevator A to M for the underwater window. Return by the same lifts to G and the harbor exit.');route.className='galleryMeta';dialog.append(route);
   const list=node('ol');content.observations.forEach(o=>list.append(node('li',`${o.floorId==='reef-m'?'M':'1'} · ${o.title}${s.saved.has(o.id)?' · saved':''}`)));dialog.append(list);
  }
  if(s.loading)dialog.append(node('p','The reef animals are arriving…'));
  if(s.error){dialog.append(node('p','Some reef models could not load. The route and exit remain open.'),button('Retry reef models','retry'));}
  if(s.journalError)dialog.append(button('Retry Journal connection','restore'));
  if(p.message){const status=node('p',p.message);status.setAttribute('role','status');dialog.append(status);}
  const details=node('details');details.append(node('summary','About this visit'),node('p',content.accuracyLabel),node('p','Animal models: Blacktip reef shark by Lais.Marques and Green sea turtle by jgrabo20, CC BY 4.0. Coral scans: Smithsonian Institution, CC0. Models scaled and textures resized.'));
  for(const [label,url]of [['Shark model','https://sketchfab.com/3d-models/blacktip-reef-shark-a52bb96c5a0c4157b49982471f8902b0'],['Turtle model','https://sketchfab.com/3d-models/green-sea-turtle-d3dc6a6a4ff74465a59105fd7c66b32b'],['CC BY 4.0','https://creativecommons.org/licenses/by/4.0/'],['Interior surface credits','/app/assets/textures/ATTRIBUTION.md']]){const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';details.append(a,document.createTextNode(' · '));}dialog.append(details);
  if(focused)[...dialog.querySelectorAll('button')].find(b=>b.dataset.venueAction===focused)?.focus({preventScroll:true});
 }
 s.refresh=render;dialog.addEventListener('cancel',e=>{e.preventDefault();closeAquariumPanel(ctx,active);},{signal:p.listeners.signal});dialog.addEventListener('keydown',e=>e.stopPropagation(),{signal:p.listeners.signal});
 dialog.addEventListener('click',async e=>{const action=e.target.closest('[data-venue-action]')?.dataset.venueAction;if(!action)return;e.stopPropagation();if(action==='close'){closeAquariumPanel(ctx,active);return;}if(action==='map'){p.observationId=null;p.message='';}if(action.startsWith('floor:'))p.level=Number(action.split(':')[1]);if(action==='retry'){void s.load();return;}if(action==='restore'){void s.restore();return;}if(action==='save'&&!p.busy){p.busy=true;render();try{await s.save(p.observationId);p.message='Saved to your Journal on this device.';}catch{p.message='Your note was not saved. Try again; existing notes are kept.';}finally{p.busy=false;}}render();},{signal:p.listeners.signal});
 document.exitPointerLock?.();document.body.append(dialog);render();dialog.showModal();ctx.setPauseReason?.('aquarium_inspect',true);ctx.screenLayout?.setPanelLayer?.('aquarium',true);dialog.querySelector('button').focus();return true;
}
