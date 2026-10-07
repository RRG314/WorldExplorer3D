import {ensureMarineResearch,REEF_SURVEY} from './research-outing.js';
import {styleMarinePanel} from './interface.js';
import {earthLocalToGeographic} from '../earth-core/location-origin.js?v=1';
import {createOceanVoyageStore,validateOceanVoyage} from './voyage-store.js';
const id=()=>globalThis.crypto?.randomUUID?.()||`voyage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function ensureOceanVoyage(ctx,{store=createOceanVoyageStore()}={}){
 if(ctx.oceanVoyage)return ctx.oceanVoyage;
 const setText=(element,text)=>{if(element.textContent!==text)element.textContent=text;};
 const research=ensureMarineResearch(ctx);
 let saved=store.read(),current=null,personalBeforeShared=null,elapsed=0,status='Not saved yet',ui=null;
 const commit=()=>{if(!current||ctx.sharedMarine?.active)return false;const result=store.write(current);if(result.saved){current=result.value;saved=result.value;status='Voyage saved on this device';}else status=result.reason==='conflict'?'Another tab changed this voyage. This session is not saved.':result.reason==='invalid-existing'?'The existing voyage record cannot be read and has been retained. This session is not saved.':'Voyage not saved: browser storage unavailable';refresh();return result.saved;};
 function begin(options,ocean){
  if(options.sharedVoyage && !personalBeforeShared)personalBeforeShared={current};
  const resume=validateOceanVoyage(options.voyageResume);
  if(resume){current=resume;current.stage='underwater';}
  else{
   const previous=current;
   const vessel=options.parentVessel;
   const voyageId=vessel&&previous?.ship.transportEntityId===vessel.transportEntityId?previous.id:id();
   current={version:1,id:voyageId,subId:previous?.id===voyageId?previous.subId:`sub:${vessel?.transportEntityId||voyageId}`,stage:'underwater',revision:previous?.revision||0,savedAt:Date.now(),
    site:{...ocean.launchSite},waveOffset:{...ocean.waveOffset},
    ship:{transportEntityId:vessel?.transportEntityId||`research:${voyageId}`,transportCatalogId:vessel?.transportCatalogId||'ocean-research-vessel',condition:vessel?.condition??1,yaw:ocean.submarine.yaw,anchor:{lat:ocean.launchSite.lat,lon:ocean.launchSite.lon}},
    sub:{x:ocean.submarine.position.x,y:ocean.submarine.position.y,z:ocean.submarine.position.z,yaw:ocean.submarine.yaw,condition:previous?.id===voyageId?previous.sub.condition:1}};
  }
  ocean.submarine.transportEntityId=current.subId;
  if(ocean.submarine.mesh)ocean.submarine.mesh.userData.transportEntityId=current.subId;
  ocean.condition=current.sub.condition;
  if(ctx.boatMode)ctx.boatMode.oceanTransferVessel={transportEntityId:current.ship.transportEntityId,transportCatalogId:current.ship.transportCatalogId,condition:current.ship.condition};
  elapsed=0;checkpoint(ocean);return current;
 }
 function checkpoint(ocean=ctx.oceanMode){
  if(!current||!ocean?.active)return false;
  const sub=ocean.submarine;current={...current,stage:'underwater',sub:{x:sub.position.x,y:sub.position.y,z:sub.position.z,yaw:sub.yaw,condition:Math.max(0,Math.min(1,ocean.condition??1))}};
  return commit();
 }
 function surfaced(){if(!current)return;current={...current,stage:'aboard'};commit();}
 function surfaceCheckpoint(){
  if(!current||current.stage!=='aboard'||!ctx.boatMode?.active||ctx.boatMode.transportEntityId!==current.ship.transportEntityId)return false;
  const anchor=earthLocalToGeographic(ctx.LOC,ctx.SCALE,ctx.boat.x,ctx.boat.z);if(!Number.isFinite(anchor?.lat)||!Number.isFinite(anchor?.lon))return false;
  const offset=ctx.boatMode.currentWater?.source?.waveOffset||{};
  current={...current,site:{...current.site,...anchor},ship:{...current.ship,anchor,yaw:ctx.boat.angle,condition:ctx.boatMode.condition??1},waveOffset:{x:ctx.boat.x+(offset.x||0),z:ctx.boat.z+(offset.z||0)}};return commit();
 }
 function tickSurface(dt){ctx.sharedMarine?.tick(dt);elapsed+=dt;if(elapsed>=5){elapsed=0;surfaceCheckpoint();}refresh();}
 function tick(dt){elapsed+=dt;if(elapsed>=5){elapsed=0;checkpoint();}refresh();}
 function refresh(){
  if(!ui)return;
  ui.resume.hidden=!saved;ui.resume.style.display=saved?'':'none';setText(ui.resume,saved?.stage==='aboard'?'Return to saved research vessel':'Resume saved ocean voyage');
  ui.panel.hidden=!ctx.oceanMode?.active||!!ctx.paused||!!ctx.oceanMode?.diver?.active;
  const survey=research.snapshot();
  setText(ui.title,survey.visible?'Coral Shelf survey':'Research voyage');
  setText(ui.status,survey.visible&&survey.message?survey.message:status);
  ui.scan.hidden=!survey.visible||!survey.started||survey.stage==='report';ui.scan.disabled=!survey.canScan||survey.busy;
  setText(ui.scan,`Scan ${survey.target?.label||'study site'} · ${survey.rangeMeters} m range`);
  ui.site.hidden=!survey.visible||!survey.completed;

  const sub=ctx.oceanMode?.submarine;
  if(survey.visible)setText(ui.distance,survey.instruction);
  else if(current&&sub){const metres=Math.hypot(sub.position.x,sub.position.z)*(ctx.METERS_PER_WORLD_UNIT||1);setText(ui.distance,`Parent vessel · ${Math.round(metres)} m from launch point. Recovery returns you and this submarine aboard.`);}
  ui.recover.disabled=!!ctx.oceanMode?.diver?.active;
 }
 async function resume(sessionRecord=null){
  const session=validateOceanVoyage(sessionRecord);
  if((!saved&&!session)||ui?.resume.disabled)return false;
  const restore=session||store.read();if(!restore)return false;saved=restore;
  if(ui)ui.resume.disabled=true;
  try{
   // Saved traversal is not a new geographic claim. The current seabed clamps
   // the resumed craft, and inventories remain in their existing authorities.
   if(ctx.boatMode?.active)ctx.suspendBoatModeForOceanTransfer?.();
   const started=ctx.gameStarted?await ctx.startOceanMode({launchSite:restore.site,waveOffset:restore.waveOffset,submarinePose:restore.sub,voyageResume:restore}):await ctx.triggerTitleStart({bypassCustomGate:true,launchMode:'ocean',voyageResume:restore});
   if(!started)return false;
   ctx.closeGlobeSelector?.();ctx.setPauseReason?.('manual_pause',false);
   if(restore.stage==='aboard')return !!await ctx.transferSubmarineToBoat({source:'saved-voyage-recovery'});
   return true;
  }catch{status='Could not resume this voyage. The saved record is retained.';return false;}finally{if(ui)ui.resume.disabled=false;refresh();}
 }
 function mount(){
  if(ui||typeof document==='undefined')return;
  const oceanButton=document.getElementById('globeSelectorOceanBtn');if(!oceanButton)return;
  const resumeButton=document.createElement('button');resumeButton.id='oceanVoyageResume';resumeButton.type='button';resumeButton.className='globe-selector-action-btn';resumeButton.style.cssText='margin-top:8px;width:100%;min-height:44px;font:600 12px system-ui;background:#112b3a;color:#e8f6ff;border:1px solid #5689a3;border-radius:4px;padding:10px';resumeButton.onclick=()=>void resume();(document.getElementById('globeSelectorStartBtn')||oceanButton).after(resumeButton);
  const panel=document.createElement('section');panel.id='oceanVoyageControls';panel.setAttribute('aria-label','Ocean voyage');panel.style.cssText='position:fixed;top:245px;right:12px;width:250px;max-width:calc(100vw - 24px);padding:10px;box-sizing:border-box;border-radius:10px;background:#092a3bee;color:#eefaff;font:13px/1.4 system-ui;z-index:110';
  const style=document.createElement('style');style.textContent='@media(max-width:600px){#oceanVoyageControls{top:auto!important;bottom:146px;max-height:calc(100dvh - 588px);overflow:auto}}';document.head.append(style);
  const title=document.createElement('strong');title.textContent='Research voyage';const distance=document.createElement('div'),statusElement=document.createElement('div');statusElement.setAttribute('role','status');
  const recover=document.createElement('button');recover.id='oceanVoyageRecover';recover.textContent='Recover to parent vessel';recover.style.cssText='width:100%;min-height:44px;margin-top:6px;background:#175069;color:white;border:1px solid #91c2d0;border-radius:7px';recover.onclick=()=>{recover.blur();void ctx.transferSubmarineToBoat({source:'voyage-recovery'})};
  const shared=document.createElement('button');shared.id='oceanSharedCrew';shared.textContent='Shared crew';shared.style.cssText=recover.style.cssText;shared.onclick=()=>void import('./shared-marine-runtime.js').then(m=>m.openSharedMarine(ctx)).catch(e=>{status=e.message;refresh()});
  const scan=document.createElement('button');scan.id='marineResearchScan';scan.type='button';scan.style.cssText=recover.style.cssText;scan.onclick=()=>{scan.blur();void research.scan().then(refresh)};
  const site=document.createElement('select');site.id='marineResearchSite';site.setAttribute('aria-label','Follow-up study site');site.style.cssText='width:100%;min-height:44px;margin-top:5px;background:#173d4c;color:white';
  REEF_SURVEY.sites.forEach((id,index)=>{const option=document.createElement('option');option.value=id;option.textContent=REEF_SURVEY.labels[index];site.append(option)});site.onchange=()=>{research.select(site.value);site.blur();refresh()};
  style.remove();styleMarinePanel(panel,'voyage');
  const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Voyage details & crew';more.append(summary,statusElement,shared);
  panel.append(title,distance,site,scan,recover,more);for(const control of panel.querySelectorAll('button,select'))control.removeAttribute('style');document.body.append(panel);ui={resume:resumeButton,panel,title,status:statusElement,distance,recover,scan,site};refresh();
 }
 const api={restorePersonal(){if(personalBeforeShared){current=personalBeforeShared.current;personalBeforeShared=null;}return current;},begin,checkpoint,surfaceCheckpoint,surfaced,tick,tickSurface,mount,resume,refresh,get current(){return current},get saved(){return saved},get status(){return status}};
 ctx.oceanVoyage=api;
 if(typeof window!=='undefined')window.addEventListener('pagehide',()=>ctx.oceanMode?.active?checkpoint():surfaceCheckpoint());
 return api;
}
