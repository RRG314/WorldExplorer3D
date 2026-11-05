import {applyCareerFocus} from '../character/journey-preferences.js';
import {beginSoloRacer,soloRacerSummary} from '../campaign/solo-racer.js';
import {createExperienceEntry} from './entry.js';
import {createExperienceBrowser} from '../ui/experience-browser.js';
import {ACTIVITY_TEMPLATES} from '../activity-discovery/schema-core.js?v=1';

export function createExperienceController({runtime,getTitleUi,onJournal,closeMenus=()=>{},requestWorldFocus=()=>{}}){
 const adapters=new Map();let profileStore=null;
 const getStore=async()=>{if(runtime.discoveryProfileStore)return runtime.discoveryProfileStore;if(!profileStore){const {createIndexedDbDiscoveryProfileStore}=await import('../discovery/profile-store.js?v=5');profileStore=createIndexedDbDiscoveryProfileStore();}return profileStore;};
 function context(){const selection=getTitleUi()?.getGlobeSelector?.()?.getSelection?.(),location=runtime.gameStarted?runtime.LOC:selection;return {loaded:runtime.gameStarted===true&&!runtime.worldLoading,environment:String(runtime.getEnv?.()||'EARTH').toLowerCase(),offline:globalThis.navigator?.onLine===false,place:location&&Number.isFinite(location.lat)&&Number.isFinite(location.lon)?{id:'selected-place',name:location.name||selection?.name||'Selected place',lat:location.lat,lon:location.lon,environment:'earth'}:null};}
 const currentPlaces=()=>{const current=context();return current.place?[current.place]:[{id:'baltimore',name:'Baltimore',lat:39.2904,lon:-76.6122,environment:'earth'}];};
 const ready=({place},label='Begin')=>({state:place?'ready':'needs-place',label:place?label:'Choose a place',enabled:!!place});
 async function travelToOcean(place,{isCurrent=()=>true}={}){
  if(!isCurrent()||place?.environment!=='ocean'||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return false;
  const title=getTitleUi(),globe=title?.getGlobeSelector?.();if(!globe?.startOcean)return false;
  closeMenus();runtime.toggleWorldDiscoveryJournal?.(false);runtime.stopGameplayPlugin?.('experience-travel',{resumeFree:false});title.selectGameMode('free');
  globe.open();globe.setSelection(place.lat,place.lon,{name:place.name,arrivalMode:'boat',focus:false});
  return globe.startOcean({isCurrent});
 }
 async function travelToPlace(place){
   const current=context();if(current.loaded&&current.environment===place.environment&&current.place&&Math.abs(current.place.lat-place.lat)<.00001&&Math.abs(current.place.lon-place.lon)<.00001)return true;
   if(place.environment==='ocean')return travelToOcean(place);
   const title=getTitleUi(),globe=title?.getGlobeSelector?.();if(!title||!globe)return false;
   closeMenus();runtime.toggleWorldDiscoveryJournal?.(false);runtime.stopGameplayPlugin?.('experience-travel',{resumeFree:false});title.selectGameMode('free');
   if(place.environment==='earth'){globe.setSelection(place.lat,place.lon,{name:place.name,arrivalMode:'walk',focus:false});return globe.startHere();}
   title.setTitleLaunchMode(place.environment);return runtime.triggerTitleStart?.({bypassCustomGate:true,launchMode:place.environment});
 }
 const entry=createExperienceEntry({
  resolveAdapter:(id,row)=>adapters.get(id)||adapters.get(row.id),
  readWorldIdentity:()=>runtime.gameStarted&&!runtime.worldLoading?`${runtime.getEnv?.()||'EARTH'}:${runtime._worldLoadSequence||0}`:null,
  launchPlace:travelToPlace
 });
 adapters.set('game',{
  equipment:'Check your vehicle in the Garage for driving games. Other games provide instructions when they open.',places:currentPlaces,
  offer:input=>ready(input,input.entry.mode==='racing'?'Choose an event':'Begin game'),
  async start({entry:row,isCurrent}){if(!isCurrent()||String(runtime.getEnv?.()||'EARTH')!=='EARTH')return false;return runtime.startGameplayPlugin?.(row.mode);}
 });
 adapters.set('route',{
  equipment:'Choose a route to see its travel mode, checkpoints and requirements.',places:currentPlaces,offer:input=>ready(input,'Choose a route'),
  async start({entry:row,isCurrent}){if(!isCurrent())return false;const template=ACTIVITY_TEMPLATES.find(t=>t.id===row.templateId);return runtime.openActivityBrowser?.({categoryId:template?.category||'all'});}
 });
 adapters.set('racing',{
  equipment:'Your owned cars, upgrades and condition are in the Garage. Practice is available without an online account.',
  async places(){const {RACING_VENUE_SOURCES}=await import('../racing/venue-source-packs.js');return RACING_VENUE_SOURCES.map(p=>({id:p.id,name:p.name,...p.anchor,environment:'earth'}));},
  prepareLabel:'Garage',prepare:async()=>{const {openVehicleGarage}=await import('../ui/vehicle-garage.js');openVehicleGarage();},
  offer:input=>{if(context().loaded){try{const garage=runtime.getVehicleGarage?.();if(!garage?.vehicles?.[garage.selectedId]||garage.vehicles[garage.selectedId].condition<.3)return {state:'needs-equipment',label:'Prepare your car',reason:'Open the Garage and choose an owned car with at least 30% condition.',enabled:false};}catch{return {state:'temporarily-unavailable',label:'Garage unavailable',reason:'Your garage could not load. Close Activities and try again.',enabled:false};}}return ready(input,'Choose an event');},
  summary:({profile,variantId})=>soloRacerSummary(profile?.soloRacer,{variantId}),
  async start({isCurrent,intent}){if(!isCurrent())return false;const garage=runtime.getVehicleGarage?.(),ownerUid=runtime.getAccountUserId?.()||'';const store=await getStore();if(!isCurrent())return false;await store.saveProfile(current=>({...current,soloRacer:beginSoloRacer(current.soloRacer,{garage,ownerUid,variantId:intent.variantId})}));if(!isCurrent())return false;return runtime.startGameplayPlugin?.('racing');}
 });
 const browser=createExperienceBrowser({
  readContext:context,readProfile:async()=> (await getStore()).getProfile(),resolveAdapter:(id,row)=>adapters.get(id)||adapters.get(row.id),
  onFocus:async id=>(await getStore()).saveProfile(current=>applyCareerFocus(current,id)),
  saveSelection:async intent=>(await getStore()).saveProfile(current=>({...current,activeExperience:{...intent,selectedAt:Date.now()}})),
  onBegin:intent=>entry.start(intent),onEntered:requestWorldFocus,onJournal,
  onLayer:open=>{runtime.screenLayout?.setPanelLayer('experiences',open);runtime.setPauseReason?.('experience-browser',open&&runtime.gameStarted);if(open)closeMenus();}
 });
 return Object.freeze({...browser,travelToOcean,travelToPlace,registerAdapter(id,adapter){if(adapters.has(id))throw Error('Activity adapter already registered: '+id);adapters.set(id,adapter);return()=>adapters.delete(id);},getStore,cancelEntry:()=>entry.cancel(),context});
}
