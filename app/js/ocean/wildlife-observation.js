import {COMMON_DOLPHIN} from './cetacean-rules.js';
import {earthLocalToGeographic} from '../earth-core/location-origin.js?v=1';
import {parentHullCollision} from './parent-vessel.js';
import {validateOceanVoyage} from './voyage-store.js';

export function wildlifeObservationCandidate({animals=[],position,units=1,speed=0,verticalSpeed=0,inView=()=>false,lineClear=()=>false}) {
  if(!position||![position.x,position.y,position.z,units,speed,verticalSpeed].every(Number.isFinite)||units<=0)return null;
  if(Math.abs(speed)>.5||Math.abs(verticalSpeed)>.5)return null;
  let nearest=null;
  for(const animal of animals){
    if(animal.visualState!=='licensed'||!animal.mesh.visible||animal.mesh.userData.speciesId!==COMMON_DOLPHIN.speciesId)continue;
    const p=animal.mesh.position,distance=Math.hypot(p.x-position.x,p.y-position.y,p.z-position.z)*units;
    if(distance>45||!inView(p)||!lineClear(position,p)||nearest&&distance>=nearest.distance)continue;
    nearest={animal,distance};
  }
  return nearest;
}

// Uses the existing research Journal, with no separate wildlife save or rewards.
export function createWildlifeObservation(ctx,{store,now=Date.now}) {
  let busy=false,message='',messageMode=null,recordedMode=null;
  function candidate(){
    const m=ctx.oceanMode;if(!m?.active||ctx.paused||ctx.sharedMarine?.active||!m.cetaceanPlan?.allowed)return null;
    const actor=m.diver?.active?m.diver.navigationActor():m.submarine,camera=m.camera;
    if(!camera)return null;
    return wildlifeObservationCandidate({animals:m.cetaceans,position:actor?.position,units:ctx.METERS_PER_WORLD_UNIT,speed:actor?.speed,verticalSpeed:actor?.verticalSpeed??actor?.vy??0,
      inView:p=>{const screen=p.clone().project(camera);return Math.abs(screen.x)<.85&&Math.abs(screen.y)<.85&&screen.z>-1&&screen.z<1;},
      lineClear:(from,to)=>{
        const length=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z),steps=Math.ceil(length/1.5);
        for(let i=1;i<steps;i++){
          const t=i/steps,p={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t};
          const water=m.waterSurface?.sample(p.x,p.z)?.volume;
          if(!Number.isFinite(water?.bottomY)||p.y<=water.bottomY+.1||m.habitat?.collision(p,.1)||parentHullCollision(ctx.oceanVoyage?.current?.ship,p,.1,water.surfaceY))return false;
        }
        return true;
      }});
  }
  async function record(){
    if(busy)return false;
    const match=candidate(),m=ctx.oceanMode,site=m?.launchSite;if(!match)return false;
    const p=match.animal.mesh.position,location=earthLocalToGeographic(site,ctx.SCALE,p.x,p.z);
    const water=m.waterSurface?.sample(p.x,p.z)?.volume;
    if(!location||!Number.isFinite(water?.surfaceY))return false;
    const time=now(),depth=Math.max(0,(water.surfaceY-p.y)*ctx.METERS_PER_WORLD_UNIT),species=COMMON_DOLPHIN.speciesId;
    ctx.oceanVoyage?.checkpoint?.();
    const voyage=validateOceanVoyage(ctx.oceanVoyage?.current);
    const eventId=`marine-wildlife:${species}:${site.lat.toFixed(2)}:${site.lon.toFixed(2)}:${Math.floor(time/3600000)}`;
    const value={eventId,eventType:'marine-research-recorded',sourceSystem:'marine-wildlife',sourceId:species,activityId:'marine-wildlife-watch-v1',pathId:'field',
      name:`Wildlife watch · ${COMMON_DOLPHIN.label}`,detail:`Observed a simulated ${COMMON_DOLPHIN.scientificName} at ${Math.round(depth)} m game depth, ${Math.round(match.distance)} m away. ${depth<1.5?'Near the surface.':'Swimming below the surface.'} This records your game encounter, not a real-world sighting.`,
      occurredAt:time,regionLabel:site.name||'Offshore voyage',environment:'OCEAN',locationSnapshot:{...location,name:site.name||'Offshore voyage'},localPosition:{x:p.x,y:p.y,z:p.z},
      projections:{journal:true,profile:false,place:false,missionProgress:false},progress:{points:0,reason:'wildlife-observation'},
      metadata:{truthType:'modeled',livePresenceClaim:false,speciesId:species,depthMeters:depth,distanceMeters:match.distance,region:m.cetaceanPlan.region,voyageId:ctx.oceanVoyage?.current?.id||null,...(voyage?{voyage}:{})}};
    busy=true;messageMode=m.cetaceanPlan;
    try{
      const result=await store().recordExplorerEvent(value);
      if((!result.recorded&&result.reason!=='already-recorded')||result.event?.sourceSystem!=='marine-wildlife'||result.event.metadata?.speciesId!==species)throw Error('Journal did not confirm wildlife record');
      recordedMode=messageMode;
      message=result.recorded?'Observation saved to your Journal.':'This species is already recorded here this hour.';return true;
    }catch{message='Observation could not be saved. Keep watching and retry; your existing Journal is unchanged.';return false;}
    finally{busy=false;}
  }
  function snapshot({inspect=true}={}){
    const m=ctx.oceanMode,animals=m?.cetaceans||[],visible=!!m?.active&&!ctx.sharedMarine?.active&&!!m?.cetaceanPlan?.allowed&&animals.length>0;
    const match=visible&&inspect?candidate():null,unavailable=animals.length>0&&animals.every(a=>a.visualState==='unavailable');
    return {visible,busy,recorded:!!recordedMode&&recordedMode===m?.cetaceanPlan,allowed:!!match&&!busy,instruction:unavailable?'Wildlife assets could not load. Recover and redeploy to retry.':match?`Common dolphin · ${Math.round(match.distance)} m. Ready to record.`:'Look toward a dolphin within 45 m, then stop to record it. Watch near the surface.',message:messageMode===m?.cetaceanPlan?message:''};
  }
  return {record,snapshot};
}

export function createWildlifeObservationControls(api){
  const node=document.createElement('details'),summary=document.createElement('summary'),hint=document.createElement('div'),button=document.createElement('button'),status=document.createElement('div');
  node.id='oceanWildlifeWatch';summary.textContent='Wildlife watch';button.type='button';button.textContent='Record wildlife observation';status.setAttribute('role','status');node.append(summary,hint,button,status);node.hidden=true;
  let lastRender=-Infinity;
  const refresh=()=>{lastRender=-Infinity;render();};node.ontoggle=refresh;
  button.onclick=()=>{button.disabled=true;void api()?.record().then(saved=>{if(saved)node.open=false;}).finally(refresh);};
  function render(){const time=performance.now();if(time-lastRender<250)return;lastRender=time;const s=api()?.snapshot({inspect:node.open});node.hidden=!s?.visible;if(!s?.visible)return;button.disabled=!s.allowed;for(const [element,text] of [[summary,s.recorded&&!node.open?'Wildlife watch · recorded':'Wildlife watch'],[hint,s.instruction],[status,s.message]])if(element.textContent!==text)element.textContent=text;}
  return {node,render};
}
