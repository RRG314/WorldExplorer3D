import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {GEOLOGY_STUDIES,normalizeGeologyCareer} from './geology-career.js';
import {geologySiteDescriptor} from './geology-places.js';
import {qualifyResearchSite,researchStationEvidence} from './research-site.js';
import {createGeologyPresentation} from './geology-presentation.js';
import {createGeologyUI,geologyTarget} from './geology-ui.js';
import {projectDiscoveryItemsToBackpack} from '../discovery/backpack-projection.js?v=1';
import {lookupGeology} from '../geospatial/geology.js';

export async function createGeologyCareerRuntime({runtime,store,intent,onJournal,onNext,isActive=()=>true}){
 const session=captureEnvironmentSession(),scope=createLifecycleScope('research-career:geology'),abort=new AbortController();
 let state=normalizeGeologyCareer(),qualified=null,presentation=null,ui=null,disposed=false,busy=false,elapsed=0,map={status:'loading'};
 const current=()=>!disposed&&scope.isActive()&&session.isCurrent()&&isActive();
 const dispose=()=>{if(disposed)return;disposed=true;scope.dispose('fieldwork-stopped');ui?.dispose();presentation?.dispose();ui=null;presentation=null;};
 scope.defer(()=>abort.abort('fieldwork-stopped'),'request');scope.listen(session.signal,'abort',dispose);
 try{
  runtime.setTravelMode?.('walk',{source:'geology-course'});
  if(runtime.getCurrentTravelMode?.()!=='walk'||runtime.activeInterior||runtime.getLiveGpsSnapshot?.().active)throw Error('Use in-game walking outdoors to start the field course.');
  const profile=await store.getProfile();if(!current())throw Error('The location changed.');state=normalizeGeologyCareer(profile.researchCareers?.geology);
  const continuing=state.active&&state.active.phase!=='complete',variantId=intent.variantId||'campaign';
  if(continuing&&state.active.variantId!==variantId)throw Error('Continue your current geology study before choosing another.');
  qualified=qualifyResearchSite(runtime,{...geologySiteDescriptor(intent.place),existingSite:continuing?state.active.site:null});
  const accepted=await store.updateResearchCareer('geology',{type:'accept',revision:state.revision,runId:globalThis.crypto.randomUUID(),variantId,site:qualified.site},{signal:abort.signal,isCurrent:current});
  if(!current())throw Error('The location changed.');state=accepted.state;
  const items=await store.getItemsById(Object.values(state.active.samples).map(sample=>sample.instanceId));if(!current())throw Error('The location changed.');projectDiscoveryItemsToBackpack(runtime,items);
  presentation=await createGeologyPresentation(runtime,qualified,GEOLOGY_STUDIES[state.active.variantId],{signal:abort.signal,isCurrent:current});
  if(!presentation||!current())throw Error('The field presentation could not open.');
  function near(target,asDistance=false){
   const actor=runtime.Walk?.state?.walker,point=qualified.points[target];if(!current()||!actor||!point||runtime.getCurrentTravelMode?.()!=='walk'||runtime.activeInterior||runtime.worldLoading)return asDistance?NaN:false;
   const distance=Math.hypot(actor.x-point.x,actor.z-point.z)*qualified.metersPerUnit;
   return asDistance?distance:distance<=3&&Math.abs(actor.y-point.y)*qualified.metersPerUnit<=2.5;
  }
  async function save(command){
   if(busy||!current())throw Error('The field step is unavailable.');busy=true;
   try{
    const target=geologyTarget(state.active);if(!near(target))throw Error('Return to the marked station before recording this step.');
    const now=Date.now(),evidence=researchStationEvidence(runtime,qualified,target,now),custody=Object.values(state.active.samples).filter(item=>runtime.playerBackpackInventory?.item?.(item.instanceId)?.quantity>0).map(item=>item.instanceId);
    const result=await store.updateResearchCareer('geology',{...command,revision:state.revision,evidence,custody},{signal:abort.signal,isCurrent:current,now});
    if(!current())return;state=result.state;
    if(result.samples.length)projectDiscoveryItemsToBackpack(runtime,result.samples);
    presentation?.update(state.active);runtime.showToast?.(state.active.phase==='complete'?'Geologist field report saved':'Field record saved');
   }catch(error){if(current()){const profile=await store.getProfile();state=normalizeGeologyCareer(profile.researchCareers?.geology);}throw error;}
   finally{busy=false;}
  }
  ui=createGeologyUI({runtime,getState:()=>state,getMap:()=>map,near,save,onJournal,onNext});
  const unregister=runtime.registerContextInteraction?.({id:'geology-field-station',priority:98,evaluate:()=>{
   const target=geologyTarget(state.active);if(!current()||busy||runtime.paused||!near(target))return null;
   return {available:true,action:'inspect-geology-station',label:state.active.phase==='complete'?'Review field report':'Open geology station',detail:target==='bench'?'Field bench':'Exposure '+target.toUpperCase(),distance:near(target,true)};
  },perform:()=>ui.open()});if(unregister)scope.defer(unregister,'interaction');
  void lookupGeology(qualified.site.location,{signal:abort.signal}).then(result=>{
   if(!current())return;map=result.items?.length?{status:'reference',fetchedAt:result.fetchedAt,items:result.items}:{status:'unavailable',checkedAt:Date.now()};ui?.refresh?.();
  }).catch(()=>{if(current()){map={status:'unavailable',checkedAt:Date.now()};ui?.refresh?.();}});
  presentation.update(state.active);ui.update();
  return {update(dt){if(!current())return;elapsed+=Math.max(0,dt);if(elapsed<.15)return;elapsed=0;presentation?.update(state.active);ui?.update();},dispose,snapshot:()=>({careerId:'geology',active:!disposed,phase:state.active?.phase,variantId:state.active?.variantId,siteId:state.active?.site?.id,target:qualified?{id:geologyTarget(state.active),...qualified.points[geologyTarget(state.active)]}:null,revision:state.revision,samples:Object.keys(state.active?.samples||{}),tests:Object.keys(state.active?.tests||{}),mapStatus:map.status})};
 }catch(error){dispose();throw error;}
}
