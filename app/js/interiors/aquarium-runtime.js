import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {acquireVenueLighting} from './venue-lighting.js';
import {openAquariumPanel,closeAquariumPanel} from './aquarium-ui.js';
import {createAquariumWater} from './aquarium-water.js';

export const aquariumObservationId=(contentId,id)=>`event:aquarium-observation:${contentId}:${id}`;
export function aquariumSwimPose(plan,index,time){
 const turtle=index===3,speed=turtle?.055:.12+index*.011,t=time*speed+index*1.73;
 const u=-39+Math.cos(t)*(turtle?5:6+index*.3),v=64+Math.sin(t)*(turtle?4:5+index*.22);
 const p=plan.local(u,v),derivative=plan.local(-Math.sin(t)*(turtle?5:6+index*.3),Math.cos(t)*(turtle?4:5+index*.22));
 return {...p,y:plan.habitat.floor+(turtle?2.9:1.2+index*.65)/plan.metersPerUnit,yaw:Math.atan2(derivative.x,derivative.z)};
}
export async function attachAquarium(ctx,T,active,{load=loadModelAsset}={}){
 const content=active.definition.aquariumContent;if(content?.venueType!=='aquarium')return;
 const controller=new AbortController(),state={controller,animals:[],furnishings:[],clock:0,saved:new Set(),panel:null,loading:false,error:false,journalError:false};active.aquarium=state;
 const current=()=>!controller.signal.aborted&&ctx.activeInterior===active&&ctx._worldLoadSequence===active.outsideWorldSequence;state.isCurrent=current;
 state.isPaused=()=>ctx.paused===true;
 const lease=acquireVenueLighting(ctx,active.group);state.releaseLighting=lease.release;
 state.nextShadowTime=0;state.refreshShadows=lease.refreshShadows;
 const plan=active.definition.aquariumPlan,k=1/plan.metersPerUnit;
 state.water=createAquariumWater(T,active.group,plan,{targetSize:ctx.renderQualityLevel==='high'?768:512,depthTexture:!!(ctx.renderer?.capabilities?.isWebGL2||ctx.renderer?.extensions?.has('WEBGL_depth_texture'))});lease.apply(state.water.mesh);
 active.group.traverse(o=>{if(o.userData?.aquariumSubmerged)state.water.apply(o);});
 const attach=instance=>{instance.root.scale.setScalar(k);lease.apply(instance.root);active.group.add(instance.root);};
 state.load=async()=>{
  if(state.loading||!current())return;state.loading=true;state.error=false;state.refresh?.();
  try{
   for(let index=0;index<4;index++){
    if(state.animals.some(a=>a.index===index))continue;
    const instance=await load(T,index===3?'aquarium-green-sea-turtle':'aquarium-blacktip-reef-shark',{signal:controller.signal});
    if(!current()){instance.dispose();return;}
    attach(instance);state.water.apply(instance.root);instance.root.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    const mixer=new T.AnimationMixer(instance.root);if(!instance.animations.length){instance.dispose();throw Error('Swimming animation is missing.');}
    mixer.clipAction(instance.animations[0]).play();mixer.update(index*.47);state.animals.push({index,instance,mixer});
    const p=aquariumSwimPose(plan,index,state.clock);instance.root.position.set(p.x,p.y,p.z);instance.root.rotation.y=p.yaw;
   }
   // Licensed Smithsonian scans form low coral islands, leaving the authored
   // swimming lane clear. Each lease shares the existing bounded model cache.
   for(let index=state.furnishings.length;index<18;index++){
    const kind=['branch','massive','table'][index%3],instance=await load(T,`marine-${kind}-coral`,{signal:controller.signal});
    if(!current()){instance.dispose();return;}
    attach(instance);state.water.apply(instance.root);instance.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const side=index%2?-1:1,u=-39+side*(9+(index%3)*.6),v=54+Math.floor(index/2)*2.15,p=plan.local(u,v);
    instance.root.position.set(p.x,plan.habitat.floor,p.z);instance.root.scale.setScalar(k*(.75+(index%4)*.15));instance.root.rotation.y=index*2.39;state.furnishings.push(instance);
   }
  }catch(error){if(current()){state.error=true;state.errorDetail=String(error.message).slice(0,160);}}
  finally{state.loading=false;if(current())state.refresh?.();}
 };
 state.save=async id=>{
  const o=content.observations.find(o=>o.id===id);if(!o||!current())throw Error('This visit has closed.');
  const store=ctx.discoveryProfileStore;if(!store?.recordExplorerEvent)throw Error('Journal not ready.');
  const result=await store.recordExplorerEvent({eventId:aquariumObservationId(content.id,id),eventType:'aquarium-observation',sourceSystem:'aquarium',sourceId:`${content.id}:${id}`,name:o.title,detail:`Aquarium observation · ${o.prompt}`.slice(0,240),regionId:content.id,regionLabel:content.title,environment:'EARTH',locationKey:ctx.LOC?.id||ctx.currentLocationKey||'',locationSnapshot:ctx.LOC,projections:{journal:true,profile:false,place:false,fieldGuide:false,collection:false,missionProgress:false},metadata:{contentId:content.id,contentVersion:content.version,representation:'interpretive',sourceUrl:content.sources.find(s=>s.id===o.sourceId).url}});
  if(current()){state.saved.add(id);state.refresh?.();}return result;
 };
 state.restore=async()=>{try{if(!ctx.discoveryProfileStore?.getEventsById)throw Error('Journal not ready');const rows=await ctx.discoveryProfileStore.getEventsById(content.observations.map(o=>aquariumObservationId(content.id,o.id)));if(current()){for(const o of content.observations)if(rows?.some(r=>r.eventId===aquariumObservationId(content.id,o.id)))state.saved.add(o.id);state.journalError=false;state.refresh?.();}}catch{if(current()){state.journalError=true;state.refresh?.();}}};
 void state.restore();state.ready=state.load();await state.ready;
}
export function updateAquarium(active,dt){
 const s=active?.aquarium;if(!s?.isCurrent()||s.isPaused()||!(dt>0)||!Number.isFinite(dt)||active.activeLevel===0)return;
 s.clock+=Math.min(dt,.1);const plan=active.definition.aquariumPlan;
 s.water.update(s.clock);
 if(s.clock>=s.nextShadowTime){s.refreshShadows();s.nextShadowTime=s.clock+.12;}
 for(const a of s.animals){a.mixer.update(Math.min(dt,.1));const p=aquariumSwimPose(plan,a.index,s.clock);a.instance.root.position.set(p.x,p.y,p.z);a.instance.root.rotation.y=p.yaw;}
}
export function disposeAquarium(ctx,active){
 const s=active?.aquarium;if(s){closeAquariumPanel(ctx,active);s.controller.abort();s.water.dispose();for(const a of s.animals){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.instance.root);a.instance.dispose();}s.furnishings.forEach(i=>i.dispose());s.animals.length=0;s.furnishings.length=0;s.releaseLighting();s.refresh=null;active.aquarium=null;}
 active?.group?.userData?.releaseAquariumTextures?.();
}
export function handleAquariumAction(ctx,active,interaction){
 if(!active.aquarium||!['aquarium-map','aquarium-observation'].includes(interaction?.kind))return false;
 return openAquariumPanel(ctx,active,interaction.observationId||null);
}
