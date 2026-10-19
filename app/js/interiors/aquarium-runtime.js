import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {acquireVenueLighting} from './venue-lighting.js';
import {openAquariumPanel,closeAquariumPanel} from './aquarium-ui.js';
import {createAquariumWater} from './aquarium-water.js';
import {habitatPopulation,habitatSwimPose,habitatCoralPlacement,aquariumHabitatQuality} from './aquarium-habitat.js';
import {AQUARIUM_CONTENT} from './aquarium-content.js';

const baltimorePopulation=habitatPopulation(AQUARIUM_CONTENT.habitat);

export const aquariumObservationId=(contentId,id)=>`event:aquarium-observation:${contentId}:${id}`;
export function aquariumSwimPose(plan,index,time){
 return habitatSwimPose(plan,baltimorePopulation[index],time);
}
export async function attachAquarium(ctx,T,active,{load=loadModelAsset}={}){
 const content=active.definition.aquariumContent;if(content?.venueType!=='aquarium')return;
 const population=habitatPopulation(content.habitat),quality=aquariumHabitatQuality(ctx.renderQualityLevel);
 const controller=new AbortController(),state={controller,habitatId:content.habitat.id,quality,animals:[],furnishings:[],clock:0,saved:new Set(),panel:null,loading:false,error:false,journalError:false};active.aquarium=state;
 const current=()=>!controller.signal.aborted&&ctx.activeInterior===active&&ctx._worldLoadSequence===active.outsideWorldSequence;state.isCurrent=current;
 state.isPaused=()=>ctx.paused===true;
 const lease=acquireVenueLighting(ctx,active.group);state.releaseLighting=lease.release;
 state.nextShadowTime=0;state.refreshShadows=lease.refreshShadows;
 const plan=active.definition.aquariumPlan,k=1/plan.metersPerUnit;
 state.water=createAquariumWater(T,active.group,plan,{targetSize:quality.waterTargetSize,depthTexture:!!(ctx.renderer?.capabilities?.isWebGL2||ctx.renderer?.extensions?.has('WEBGL_depth_texture'))});lease.apply(state.water.mesh);
 active.group.traverse(o=>{if(o.userData?.aquariumSubmerged)state.water.apply(o);});
 const attach=instance=>{instance.root.scale.setScalar(k);lease.apply(instance.root);active.group.add(instance.root);};
 state.load=async()=>{
  if(state.loading||!current())return;state.loading=true;state.error=false;state.refresh?.();
  try{
   for(const member of population){
    const {index}=member;
    if(state.animals.some(a=>a.index===index))continue;
    const instance=await load(T,member.species.modelId,{signal:controller.signal});
    if(!current()){instance.dispose();return;}
    let mixer;
    try{
     if(!instance.animations.length)throw Error('Swimming animation is missing.');
     mixer=new T.AnimationMixer(instance.root);mixer.clipAction(instance.animations[0]).play();mixer.update(index*.47);
     attach(instance);state.water.apply(instance.root);instance.root.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
     const p=habitatSwimPose(plan,member,state.clock);instance.root.position.set(p.x,p.y,p.z);instance.root.rotation.y=p.yaw;
     state.animals.push({index,member,instance,mixer});
    }catch(error){mixer?.stopAllAction();mixer?.uncacheRoot(instance.root);instance.dispose();throw error;}
   }
   // Licensed Smithsonian scans form low coral islands, leaving the authored
   // swimming lane clear. Each lease shares the existing bounded model cache.
   for(let index=state.furnishings.length;index<quality.corals;index++){
    const placement=habitatCoralPlacement(content.habitat,index),instance=await load(T,placement.modelId,{signal:controller.signal});
    if(!current()){instance.dispose();return;}
    attach(instance);state.water.apply(instance.root);instance.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});const p=plan.local(placement.u,placement.v);
    instance.root.position.set(p.x,plan.habitat.floor,p.z);instance.root.scale.setScalar(k*placement.scale);instance.root.rotation.y=placement.yaw;state.furnishings.push(instance);
   }
  }catch(error){if(current()){state.error=true;state.errorDetail=String(error.message).slice(0,160);}}
  finally{state.loading=false;if(current())state.refresh?.();}
 };
 state.save=async id=>{
  const o=content.observations.find(o=>o.id===id);if(!o||!current())throw Error('This visit has closed.');
  const store=ctx.discoveryProfileStore;if(!store?.recordExplorerEvent)throw Error('Journal not ready.');
  const result=await store.recordExplorerEvent({eventId:aquariumObservationId(content.id,id),eventType:'aquarium-observation',sourceSystem:'aquarium',sourceId:`${content.id}:${id}`,name:o.title,detail:`Aquarium observation · ${o.prompt}`.slice(0,240),regionId:content.id,regionLabel:content.title,environment:'EARTH',locationKey:ctx.LOC?.id||ctx.currentLocationKey||'',locationSnapshot:ctx.LOC,projections:{journal:true,profile:false,place:false,fieldGuide:false,collection:false,missionProgress:false},metadata:{contentId:content.id,contentVersion:content.version,representation:'interpretive',sourceUrl:content.sources.find(s=>s.id===o.sourceId).url,habitatId:content.habitat.id,buildingSourceId:content.habitat.buildingSourceId,floorId:o.floorId,reconstructionConfidence:content.habitat.confidence.geometry}});
  if(current()){state.saved.add(id);state.refresh?.();}return result;
 };
 state.restore=async()=>{try{if(!ctx.discoveryProfileStore?.getEventsById)throw Error('Journal not ready');const rows=await ctx.discoveryProfileStore.getEventsById(content.observations.map(o=>aquariumObservationId(content.id,o.id)));if(current()){for(const o of content.observations)if(rows?.some(r=>r.eventId===aquariumObservationId(content.id,o.id)))state.saved.add(o.id);state.journalError=false;state.refresh?.();}}catch{if(current()){state.journalError=true;state.refresh?.();}}};
 void state.restore();state.ready=state.load();await state.ready;
}
export function updateAquarium(active,dt){
 const s=active?.aquarium;if(!s?.isCurrent()||s.isPaused()||!(dt>0)||!Number.isFinite(dt))return;
 const definition=active.definition;if(!definition.aquariumContent.habitat.viewingFloorIds.includes(definition.authoredLayout.floors[active.activeLevel]?.id))return;
 s.clock+=Math.min(dt,.1);const plan=active.definition.aquariumPlan;
 s.water.update(s.clock);
 if(s.clock>=s.nextShadowTime){s.refreshShadows();s.nextShadowTime=s.clock+.12;}
 for(const a of s.animals){a.mixer.update(Math.min(dt,.1));const p=habitatSwimPose(plan,a.member,s.clock);a.instance.root.position.set(p.x,p.y,p.z);a.instance.root.rotation.y=p.yaw;}
}
export function disposeAquarium(ctx,active){
 const s=active?.aquarium;if(s){closeAquariumPanel(ctx,active);s.controller.abort();s.water.dispose();for(const a of s.animals){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.instance.root);a.instance.dispose();}s.furnishings.forEach(i=>i.dispose());s.animals.length=0;s.furnishings.length=0;s.releaseLighting();s.refresh=null;active.aquarium=null;}
 active?.group?.userData?.releaseAquariumTextures?.();
}
export function handleAquariumAction(ctx,active,interaction){
 if(!active.aquarium||!['aquarium-map','aquarium-observation'].includes(interaction?.kind))return false;
 return openAquariumPanel(ctx,active,interaction.observationId||null);
}
