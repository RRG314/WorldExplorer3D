import {experienceById} from './catalog.js';
const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
const environments=new Set(['earth','ocean','moon','mars','space']);
export function createExperienceIntent({experienceId,place=null,resumeId='',revision=1,variantId='campaign',definitionVersion=1,schemaVersion=1}={}){
 if(schemaVersion!==1||definitionVersion!==1)throw new TypeError('This saved activity needs a newer version of World Explorer.');
 if(!/^[a-z][a-z0-9-]{0,59}$/.test(variantId))throw new TypeError('Choose a valid assignment.');
 const entry=experienceById(experienceId);if(!entry)throw new TypeError('Choose a valid activity.');
 let target=null;
 if(place){
  const environment=String(place.environment||'earth').toLowerCase();
  if(!environments.has(environment))throw new TypeError('Choose a supported destination.');
  if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon)||Math.abs(place.lat)>90||Math.abs(place.lon)>180)throw new TypeError('Choose a valid place.');
  target={id:String(place.id||'').slice(0,120),name:String(place.name||'Selected place').slice(0,120),environment,lat:place.lat,lon:place.lon};
 }
 if(resumeId&&!/^[a-zA-Z0-9:._-]{1,180}$/.test(resumeId))throw new TypeError('That saved assignment cannot be opened.');
 return Object.freeze({schemaVersion:1,experienceId:entry.id,definitionVersion:1,revision:Math.max(1,Math.floor(Number(revision)||1)),variantId,place:target?Object.freeze(target):null,resumeId});
}
export function experienceOffer(entry,{adapter,place=null,profile=null}={}){
 if(!entry)return {state:'unavailable',label:'Choose an activity',reason:'Select an activity to see its details.',enabled:false};
 if(!adapter)return {state:'unavailable',label:'Unavailable',reason:'This activity is not available. Choose another activity.',enabled:false};
 const result=adapter.offer?.({entry,place,profile})||{state:place?'ready':'needs-place',label:place?'Begin':'Choose a place',enabled:true};
 return Object.freeze({...result,enabled:result.enabled===true});
}
// Superseded launches cannot install a late result. World/session controllers still own scene lifetime.
export function createExperienceEntry({resolveAdapter,launchPlace,readWorldIdentity=()=>null}={}){
 let generation=0,pending=null;
 return Object.freeze({
  cancel(){generation++;pending=null;},
  snapshot:()=>clone(pending),
  async start(input){
   const intent=createExperienceIntent(input),run=++generation;pending=intent;
   const entry=experienceById(intent.experienceId),adapter=resolveAdapter(entry.adapterId,entry);
   if(!adapter)return false;
   const before=readWorldIdentity();
   if(intent.place){const started=await launchPlace(intent.place,intent);if(run!==generation||started===false)return false;}
   if(run!==generation)return false;
   const identity=readWorldIdentity();
   if(!identity||(!intent.place&&before!==identity))return false;
   const accepted=await adapter.start({entry,intent,worldIdentity:identity,isCurrent:()=>run===generation&&readWorldIdentity()===identity});
   if(run!==generation||readWorldIdentity()!==identity)return false;
   pending=null;return accepted!==false;
  }
 });
}
