import {createIndexedDbDiscoveryProfileStore} from '../discovery/profile-store.js?v=5';
import {CORAL_SHELF_SITE} from './habitat-plan.js';
import {researchStationDistance} from '../boat-mode/research/layout.js';
import {earthLocalToGeographic} from '../earth-core/location-origin.js?v=1';
export const REEF_SURVEY=Object.freeze({id:'coral-shelf-survey-v1',title:'Coral Shelf: first survey',sites:Object.freeze(['table-garden','branch-ridge','seagrass-edge']),labels:Object.freeze(['Table Garden','Branch Ridge','Seagrass Edge']),baseRange:18,upgradedRange:35});
const eventId=part=>`${REEF_SURVEY.id}:${part}`;
const ids=['brief',...REEF_SURVEY.sites,'report'].map(eventId);
export function reefSurveyState(events=[]){
 const owned=new Set(events.filter(e=>e.eventType==='marine-research-recorded'&&e.sourceSystem==='marine-research'&&e.activityId===REEF_SURVEY.id&&e.metadata?.truthType==='authored').map(e=>e.eventId));
 const started=owned.has(eventId('brief')),scans=started?REEF_SURVEY.sites.filter(id=>owned.has(eventId(id))):[];
 const completed=started&&scans.length===3&&owned.has(eventId('report'));
 return {started,scans,completed,stage:completed?'complete':!started?'briefing':scans.length===3?'report':'survey',rangeMeters:completed?REEF_SURVEY.upgradedRange:REEF_SURVEY.baseRange};
}
export function reefScanAdmission({active,paused,ready,position,speed=0,verticalSpeed=0,target,rangeMeters,metersPerUnit=1}){
 if(!active||paused)return {allowed:false,reason:'Return to active Ocean exploration to scan.'};
 if(!ready||!target)return {allowed:false,reason:'The authored reef is not ready at this location.'};
 if(!position||![position.x,position.y,position.z,speed,verticalSpeed,rangeMeters,metersPerUnit,target.x,target.y,target.z].every(Number.isFinite)||rangeMeters<=0||metersPerUnit<=0)return {allowed:false,reason:'Scanner position is unavailable.'};
 const distance=Math.hypot(position.x-target.x,position.y-target.y,position.z-target.z)*metersPerUnit;
 if(distance>rangeMeters)return {allowed:false,distance,reason:`Approach within ${rangeMeters} m; travel above the reef.`};
 if(Math.abs(speed)>.6||Math.abs(verticalSpeed)>.6)return {allowed:false,distance,reason:'Release movement controls and stop to scan.'};
 return {allowed:true,distance,reason:'Ready to scan.'};
}
export function ensureMarineResearch(ctx,{store:providedStore,now=()=>Date.now()}={}){
 if(ctx.marineResearch)return ctx.marineResearch;
 let events=[],ready=false,busy=false,error='',message='',selected=REEF_SURVEY.sites[0],sequence=0;
 const store=()=>providedStore||(ctx.discoveryProfileStore ||= createIndexedDbDiscoveryProfileStore());
 const state=()=>reefSurveyState(events);
 async function refresh(){const token=++sequence;try{const records=await store().getEventsById(ids);if(token===sequence){events=records;ready=true;error='';}return true;}catch{if(token===sequence){ready=false;error='Journal unavailable. Progress has not been changed; retry when storage is available.';}return false;}}
 function atLab(){
  const deck=ctx.boatDeck?.snapshot(),voyage=ctx.oceanVoyage?.current;
  if(!deck?.active||researchStationDistance(deck.pose,'lab')>2.4||!ctx.boatMode?.active||ctx.boatMode.transportCatalogId!=='ocean-research-vessel'||ctx.boatMode.transportEntityId!==voyage?.ship.transportEntityId)return false;
  const geo=earthLocalToGeographic(ctx.LOC,ctx.SCALE,ctx.boat.x,ctx.boat.z);
  return !!geo&&Math.hypot((geo.lat-CORAL_SHELF_SITE.lat)*111000,(geo.lon-CORAL_SHELF_SITE.lon)*105000)<600;
 }
 function visible(){const voyage=ctx.oceanVoyage?.current,site=voyage?.site;return !!site&&Math.abs(site.lat-CORAL_SHELF_SITE.lat)<.025&&Math.abs(site.lon-CORAL_SHELF_SITE.lon)<.025&&!!(ctx.oceanMode?.active||ctx.boatMode?.active&&ctx.boatMode.transportEntityId===voyage.ship.transportEntityId);}
 function target(){const s=state(),id=s.completed?selected:REEF_SURVEY.sites.find(id=>!s.scans.includes(id));return ctx.oceanMode?.habitat?.plan.landmarks.find(l=>l.id===id)||null;}
 function admission(){const mode=ctx.oceanMode,actor=mode?.diver?.active?mode.diver.navigationActor():mode?.submarine;
  return reefScanAdmission({active:!!mode?.active,paused:!!ctx.paused,ready:ready&&mode?.habitat?.group.userData.habitat.assetState==='ready',position:actor?.position,speed:actor?.speed,verticalSpeed:actor?.verticalSpeed??actor?.vy??0,target:target(),rangeMeters:state().rangeMeters,metersPerUnit:ctx.METERS_PER_WORLD_UNIT||1});}
 function record(part,name,detail,extra={}){const underwater=!!ctx.oceanMode?.active,actor=underwater?(ctx.oceanMode.diver?.active?ctx.oceanMode.diver.navigationActor().position:ctx.oceanMode.submarine.position):ctx.boat;const geo=earthLocalToGeographic(underwater?ctx.oceanMode.launchSite||CORAL_SHELF_SITE:ctx.LOC,ctx.SCALE,actor?.x||0,actor?.z||0)||CORAL_SHELF_SITE;return {eventId:eventId(part),eventType:'marine-research-recorded',sourceSystem:'marine-research',sourceId:eventId(part),activityId:REEF_SURVEY.id,pathId:'field',name,detail,occurredAt:now(),regionLabel:'Coral Shelf authored study',environment:ctx.oceanMode?.active?'OCEAN':'EARTH',locationSnapshot:{...geo,name:'Coral Shelf authored habitat'},localPosition:{x:actor?.x,y:actor?.y,z:actor?.z},projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0,reason:'local-marine-research'},metadata:{truthType:'authored',...extra}};}
 async function save(value){const result=await store().recordExplorerEvent(value);if(!result.recorded&&result.reason!=='already-recorded')throw Error('Journal rejected record');if(result.event?.sourceSystem!=='marine-research'||result.event?.activityId!==REEF_SURVEY.id||result.event?.metadata?.truthType!=='authored')throw Error('Journal ID belongs to another record');await refresh();if(!ready)throw Error('Journal confirmation unavailable');return result;}
 async function labAction(){
  if(busy)return false;busy=true;
  try{if(!await refresh()||!atLab()||ctx.paused)return false;const s=state();
   if(!s.started){await save(record('brief','Reef survey briefing','Survey A: Table Garden, B: Branch Ridge and C: Seagrass Edge. Stop within 18 m to scan. Return to the wet lab for Scanner II (35 m).'));
    message='Briefing saved. W/S move, A/D turn, Space rise, Shift dive. Travel above the reef between sites. Recovery keeps your scans.';return true;}
   if(s.scans.length===3&&!s.completed){await save(record('report','Coral Shelf survey complete · Scanner II','Three authored habitat records submitted. Scanner II is installed on this device: scan range increases from 18 m to 35 m on future dives.',{upgradeId:'marine-scanner-ii',rangeMeters:35}));
    message='Report saved. Scanner II installed on this device: 35 m range, up from 18 m.';return true;}
   message=s.completed?'Scanner II is installed. Deploy again for follow-up observations at up to 35 m.':`${s.scans.length}/3 scans saved. Return to the submarine cradle to continue. Recovery keeps your findings.`;return true;
  }catch{message='Could not confirm the Journal save. Retry; completed records will not be duplicated.';return false;}finally{busy=false;}
 }
 async function scan(){
  if(busy)return false;busy=true;
  try{if(!await refresh())return false;const s=state(),gate=admission(),t=target();if(!s.started||!gate.allowed||!t){message=gate.reason||'Get the wet-lab briefing first.';return false;}
   const part=s.completed?`followup:${t.id}:${Math.floor(now()/3600000)}`:t.id;
   const result=await save(record(part,`${s.completed?'Follow-up':'Survey'}: ${t.label}`,`Authored habitat scan at ${Math.round(gate.distance)} m · Scanner ${s.completed?'II':'I'}.`,{landmarkId:t.id,distanceMeters:gate.distance,scannerRangeMeters:s.rangeMeters}));
   message=result.reason==='already-recorded'?'Already saved this site this hour.':state().scans.length===3&&!state().completed?'All three scans saved. Recover to the vessel and submit at the wet lab.':`Saved ${t.label} · ${store().type==='IndexedDbDiscoveryProfileStore'?'device':'session'} Journal.`;return true;
  }catch{message='Scan could not be saved. Stay nearby and retry; progress was not advanced.';return false;}finally{busy=false;}
 }
 function snapshot(){const s=state(),t=target(),gate=admission();let instruction;
  if(!ready)instruction=error||'Loading saved research…';
  else if(s.stage==='briefing')instruction=ctx.oceanMode?.active?'First outing: recover to the research vessel, walk to the wet lab and take the reef survey briefing.':'First outing: choose Wet lab as your deck destination, walk there and take the reef survey briefing.';
  else if(s.stage==='report')instruction=ctx.oceanMode?.active?'3/3 scans saved. Recover to the vessel, then submit at the wet lab to install Scanner II.':'3/3 scans saved. Walk to the wet lab and submit your findings to install Scanner II.';
  else if(!ctx.oceanMode?.active)instruction=s.completed?'Scanner II installed · 35 m range. Walk to the submarine cradle for a follow-up dive.':`${s.scans.length}/3 scans saved. Walk to the submarine cradle and deploy to continue.`;
  else if(t){const actor=ctx.oceanMode.diver?.active?ctx.oceanMode.diver.navigationActor():ctx.oceanMode.submarine;const heading=((180-Math.atan2(t.x-actor.position.x,t.z-actor.position.z)*180/Math.PI)%360+360)%360;instruction=`${s.completed?'Scanner II':`${s.scans.length}/3 saved`} · ${t.label} · ${Number.isFinite(gate.distance)?Math.round(gate.distance):'—'} m · bearing ${Math.round(heading)}° · target SIM depth ${Math.round(-t.y*(ctx.METERS_PER_WORLD_UNIT||1))} m. ${gate.reason}`;}
  else instruction='Return to the Coral Shelf launch area; the next study site is outside this local scene.';
  return {...s,report:s.completed?events.filter(e=>e.eventId!==eventId('brief')).map(({eventId,name,detail})=>({eventId,name,detail})):[],ready,busy,visible:visible(),atLab:atLab(),targetId:t?.id||null,target:t?{...t}:null,canScan:ready&&s.started&&gate.allowed,labLabel:!ready?'Retry Journal':!s.started?'Take reef survey briefing':s.stage==='report'?'Submit survey · install Scanner II':s.completed?'Review Scanner II':'Review survey progress',instruction,message:error||message,storage:store().type==='IndexedDbDiscoveryProfileStore'?'device':'session'};
 }
 const api={refresh,labAction,scan,snapshot,select:id=>{if(REEF_SURVEY.sites.includes(id)){selected=id;message='';}}};ctx.marineResearch=api;void refresh();return api;
}
