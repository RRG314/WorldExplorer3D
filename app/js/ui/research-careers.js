import {geologyCareerSummary} from '../campaign/geology-career.js';
import {geologyStartingPlaces} from '../campaign/geology-places.js';
import {archaeologyCareerSummary} from '../campaign/archaeology-career.js';
import {fieldResearchPlaces} from '../campaign/field-research-places.js';
// Lazily mount the selected field domain through the existing single active gameplay owner.
export function bindResearchCareers(runtime,experiences,{onJournal,requestWorldFocus}={}){
 let active=null,generation=0;
 const domains={
  'career:geologist':async()=> (await import('../campaign/geology-runtime.js')).createGeologyCareerRuntime,
  'career:archaeologist':async()=> (await import('../campaign/archaeology-runtime.js')).createArchaeologyCareerRuntime
 };
 runtime.registerGameplayPlugin({id:'research-career',label:'Research fieldwork',category:'fieldwork',
  async start({intent}){
   const run=++generation,load=Object.hasOwn(domains,intent?.experienceId)?domains[intent.experienceId]:null;if(!load)return false;
   const [createRuntime,store]=await Promise.all([load(),experiences.getStore()]);if(run!==generation)return false;
   const next=await createRuntime({runtime,store,intent,onJournal,requestWorldFocus,isActive:()=>run===generation,onNext:()=>{runtime.stopGameplayPlugin?.('next-field-study');void experiences.open({experienceId:intent.experienceId});}});
   if(run!==generation){next.dispose();return false;}active=next;return next.snapshot();
  },update:dt=>active?.update(dt),stop(){generation++;active?.dispose();active=null;},save:()=>active?.snapshot()||null});
 experiences.registerAdapter('geology',{
  equipment:'The virtual field course provides a hand lens, grain probe, sample labels and bench. Training specimens stay in your Backpack and Journal.',
  places:geologyStartingPlaces,
  offer:({place,profile})=>{const state=profile?.researchCareers?.geology;if(state?.schemaVersion&&state.schemaVersion!==1)return {state:'unavailable',label:'Update required',reason:'This saved field career needs a newer version of World Explorer.',enabled:false};return {state:place?'ready':'needs-place',label:place?'Begin field course':'Choose a field course',reason:'A clear, dry training area is checked after travel. The virtual exposures do not describe rocks at this real location.',enabled:!!place};},
  summary:({profile,variantId})=>geologyCareerSummary(profile?.researchCareers?.geology,{variantId}),
  start:({intent,isCurrent})=>isCurrent()?runtime.startGameplayPlugin?.('research-career',{intent}):false
 });
 experiences.registerAdapter('archaeology',{
  equipment:'A freestanding fictional training trench provides a one-metre grid, tape, compass, trowel, brush, labelled packing and catalog bench. Real heritage sites remain observation-only.',
  places:input=>fieldResearchPlaces('archaeology',input),
  offer:({place,profile})=>{const state=profile?.researchCareers?.archaeology;if(state?.schemaVersion&&state.schemaVersion!==1)return {state:'unavailable',label:'Update required',reason:'This saved archaeology career needs a newer version of World Explorer.',enabled:false};return {state:place?'ready':'needs-place',label:place?'Begin training case':'Choose a training site',reason:'A clear, dry area is checked after travel. The fictional site does not alter the terrain or grant real excavation permission.',enabled:!!place};},
  summary:({profile,variantId})=>archaeologyCareerSummary(profile?.researchCareers?.archaeology,{variantId}),
  start:({intent,isCurrent})=>isCurrent()?runtime.startGameplayPlugin?.('research-career',{intent}):false
 });
}
