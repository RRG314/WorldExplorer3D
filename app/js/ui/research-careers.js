import {geologyCareerSummary} from '../campaign/geology-career.js';
import {geologyStartingPlaces} from '../campaign/geology-places.js';
// Lazily mount the selected field domain through the existing single active gameplay owner.
export function bindResearchCareers(runtime,experiences,{onJournal}={}){
 let active=null,generation=0;
 runtime.registerGameplayPlugin({id:'research-career',label:'Research fieldwork',category:'fieldwork',
  async start({intent}){
   const run=++generation;if(intent?.experienceId!=='career:geologist')return false;
   const [{createGeologyCareerRuntime},store]=await Promise.all([import('../campaign/geology-runtime.js'),experiences.getStore()]);if(run!==generation)return false;
   const next=await createGeologyCareerRuntime({runtime,store,intent,onJournal,isActive:()=>run===generation,onNext:()=>{runtime.stopGameplayPlugin?.('next-field-study');void experiences.open({experienceId:'career:geologist'});}});
   if(run!==generation){next.dispose();return false;}active=next;return next.snapshot();
  },update:dt=>active?.update(dt),stop(){generation++;active?.dispose();active=null;},save:()=>active?.snapshot()||null});
 experiences.registerAdapter('geology',{
  equipment:'The virtual field course provides a hand lens, grain probe, sample labels and bench. Training specimens stay in your Backpack and Journal.',
  places:geologyStartingPlaces,
  offer:({place,profile})=>{const state=profile?.researchCareers?.geology;if(state?.schemaVersion&&state.schemaVersion!==1)return {state:'unavailable',label:'Update required',reason:'This saved field career needs a newer version of World Explorer.',enabled:false};return {state:place?'ready':'needs-place',label:place?'Begin field course':'Choose a field course',reason:'A clear, dry training area is checked after travel. The virtual exposures do not describe rocks at this real location.',enabled:!!place};},
  summary:({profile,variantId})=>geologyCareerSummary(profile?.researchCareers?.geology,{variantId}),
  start:({intent,isCurrent})=>isCurrent()?runtime.startGameplayPlugin?.('research-career',{intent}):false
 });
}
