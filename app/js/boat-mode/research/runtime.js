import {researchRoomAt,researchDeckAt} from './interior-plan.js';
import {createResearchWayfinding} from './wayfinding.js';
import {ensurePlayerBackpackInventory} from '../../urban-sandbox/equipment-model.js?v=10';
import {ensurePlayerConditionAuthority} from '../../player/condition-model.js?v=1';
import {consumePlayerProvision} from '../../player/provisions.js';
import {ensureMarineResearch} from '../../ocean/research-outing.js';
import {RCRV_LAYOUT,RESEARCH_EYE_HEIGHT} from './layout.js';
import {createResearchDeckHud} from './ui.js';
import {researchLabRecord} from './lab.js';
import {resolveThirdPersonCameraCollision} from '../../walking/camera-collision.js?v=1';
import {updateCuratedCharacterAnimation} from '../../walking/curated-explorer-character.js?v=8';
import {createIndexedDbDiscoveryProfileStore} from '../../discovery/profile-store.js?v=5';

export function createResearchDeck({ctx,resetDynamics,updateVessel,onActivityChanged=()=>{},hudFactory=createResearchDeckHud}) {
 const research=ensureMarineResearch(ctx);
 let disposed=false,active=false,host=null,parent=null,hud=null,targetId='lab',busy=false,epoch=0,jumpHeld=false;
 let pose={...RCRV_LAYOUT.spawn},route=[],routeAge=Infinity,wayfinding=null,mapOpen=false;
 let world={x:0,y:0,z:0},origin='',closeCamera=false;
 const supported=()=>!disposed&&ctx.boatMode?.active&&ctx.boatMode.transportCatalogId==='ocean-research-vessel';
 const navigation=()=>ctx.boatMode?.mesh?.userData.researchNavigation;
 const layout=()=>RCRV_LAYOUT;
 const stations=()=>layout().stations;
 const ready=()=>ctx.boatMode?.mesh?.userData.researchVesselState==='ready'&&!!navigation();
 const stationDistance=id=>{
  const station=stations().find(s=>s.id===id);
  if(!station||researchRoomAt(pose).id!==station.room)return Infinity;
  return station?Math.hypot(pose.x-station.x,pose.z-station.z,(pose.y??RCRV_LAYOUT.floorY)-(station.y??RCRV_LAYOUT.floorY)):Infinity;
 };
 const stopped=()=>Math.hypot(ctx.boat.vx||0,ctx.boat.vz||0,ctx.boat.speed||0)*(ctx.METERS_PER_WORLD_UNIT||1)<=.5;
 function enter(atLadder=false) {
  if(active)return true;
  if(!supported()||!ready()||!stopped()||!ctx.Walk?.state?.characterMesh)return false;
  ctx.Walk.deactivateWater?.();resetDynamics();ctx.boatMode.moored=true;
  host=ctx.Walk.state.characterMesh;parent=host.parent;ctx.boatMode.mesh.add(host);host.visible=true;
  pose={...(atLadder?stations().find(s=>s.id==='dive'):layout().spawn),yaw:0};origin=`${ctx.LOC?.lat}:${ctx.LOC?.lon}`;active=true;epoch++;wayfinding=createResearchWayfinding(navigation());routeAge=Infinity;
  ctx.clearControlInputState?.('research-deck-enter');ctx.updateControlsModeUI?.();onActivityChanged();return true;
 }
 function release(){
  if(!active)return;
  active=false;epoch++;busy=false;wayfinding=null;route=[];mapOpen=false;hud?.closeMap?.();ctx.boatMode.mesh?.userData.researchInterior?.update(null);
  if(host){host.visible=false;host.rotation.set(0,0,0);if(parent)parent.add(host);else host.parent?.remove(host);}
  host=null;parent=null;ctx.clearControlInputState?.('research-deck-exit');ctx.updateControlsModeUI?.();onActivityChanged();
 }
 function helm(){release();return true;}
 function moor(){if(ctx.sharedMarine?.active)return false;if(!supported())return false;ctx.boatMode.moored=!ctx.boatMode.moored;if(ctx.boatMode.moored)resetDynamics();return true;}
 const select=id=>{if(stations().some(s=>s.id===id)){targetId=id;routeAge=Infinity;}};
 async function enterWater(jump=false){
  if(!active||busy||stationDistance('dive')>2.4)return false;
  const synthetic=ctx.boatMode.currentWater?.synthetic||ctx.boatMode.currentWater?.source?.synthetic;
  if(synthetic){
   busy=true;
   try{return !!await ctx.transferBoatToSubmarine?.({source:'research-platform-swim',asDiver:true,jump});}
   finally{busy=false;}
  }
  const started=ctx.boatSwimming?.start();
  if(!started)hud?.message('The water beside the ladder is too shallow, obstructed or has not loaded. Move into clear deep water.');
  return !!started;
 }
 async function act(){
  if(!active||busy||ctx.paused||mapOpen||stationDistance(targetId)>2.4)return false;
  if(targetId==='helm')return helm();
  if(targetId==='chart'){ctx.openLargeMap?.();return true;}
  if(targetId==='sub'){
   busy=true;try{const started=!!await ctx.transferBoatToSubmarine?.({source:'research-cradle'});if(!started)hud?.message(ctx.boatMode.promptMessage||'Submarine launch is unavailable here. Move to deeper open water and try again.');return started;}finally{busy=false;}
  }
  if(targetId==='dive'){
   return enterWater();
  }
  if(targetId==='galley'){
   if(ctx.sharedMarine?.active){hud?.message('Carried provisions are available in your personal voyage.');return false;}
   const inventory=ensurePlayerBackpackInventory(ctx),condition=ensurePlayerConditionAuthority(ctx);
   const items=inventory.snapshot().items.filter(item=>['trail-water','route-snack'].includes(item.catalogId)&&item.quantity>0);
   hud?.provisions?.(items.map(item=>({...item,label:item.label||inventory.definition?.(item.catalogId)?.label||item.metadata?.label||item.catalogId})),itemId=>{
    if(!active||ctx.paused||stationDistance('galley')>2.4||ctx.sharedMarine?.active)return false;
    const item=inventory.item(itemId);if(!items.some(i=>i.instanceId===itemId)||!item)return false;
    const result=consumePlayerProvision(inventory,condition,item);
    if(result.ok&&ctx.playerBackpackStore?.save?.(inventory.exportState())!==true){hud?.message('Used for this session. Backpack storage is unavailable; keep this tab open and download a backup.');return true;}
    hud?.message(result.ok?`Provisions used · condition ${Math.round(result.condition*100)}%.`:result.reason==='full_health'?'You are already in good condition. Provisions were kept.':'These provisions are no longer in your Backpack.');return result.ok;
   });return true;
  }
  if(['mess','drylab','briefing'].includes(targetId)){
   const section=targetId==='briefing'?'guide':'journal';
   if(ctx.worldDiscoveryRuntime&&ctx.openWorldDiscoverySection){ctx.openWorldDiscoverySection(section);return true;}
   const token=epoch;const module=await import('../../discovery/journey-journal.js');
   return token===epoch&&active?module.openJourneyJournal(ctx,section):false;
  }
  if(targetId==='quarters'){
   const saved=ctx.oceanVoyage?.surfaceCheckpoint?.();hud?.message(saved?'Voyage checkpoint saved. You can return to this vessel from Travel.':'A voyage checkpoint could not be saved. Existing saves are kept.');return !!saved;
  }
  if(targetId!=='lab')return false;
  const record=researchLabRecord(ctx);if(!record){hud?.message('Location unavailable; conditions were not recorded.');return false;}
  const token=epoch;busy=true;hud?.message('Saving conditions to your Journal…');
  try{
   const store=ctx.discoveryProfileStore ||= createIndexedDbDiscoveryProfileStore();
   const result=await (ctx.recordExplorerEvent?ctx.recordExplorerEvent(record):store.recordExplorerEvent(record));
   if(token!==epoch)return false;
   const durable=store.type==='IndexedDbDiscoveryProfileStore';
   hud?.message((result.recorded||result.reason==='already-recorded')?`${result.reason==='already-recorded'?'Already recorded this hour.':durable?'Saved to this device’s Journal.':'Recorded for this session only.'} ${record.detail}`:'The Journal did not save this review. Try again.');
   return result.recorded||result.reason==='already-recorded';
  }catch{if(token===epoch)hud?.message('Could not save. Your existing Journal is unchanged; try again when storage is available.');return false;}
  finally{if(token===epoch)busy=false;}
 }
 function update(dt){
  if(disposed)return false;
  if(active&&(!ready()||!supported()||origin!==`${ctx.LOC?.lat}:${ctx.LOC?.lon}`||ctx.getEnv?.()&&ctx.getEnv()!=='EARTH'))release();
  if(!supported()){hud?.hide();return false;}
  hud ||= hudFactory({enter:()=>enter(),helm:()=>select('helm'),mapChanged:open=>{mapOpen=open;ctx.clearControlInputState?.('research-map');},moor,act:()=>void act(),select,retry:()=>void ctx.boatMode?.mesh?.userData.retryResearchVisual?.(),coastalApi:()=>research.coastal,investigationApi:()=>research.investigation,researchAct:()=>void research.labAction(),sharedAct:()=>void import('../../ocean/shared-marine-runtime.js').then(m=>m.openSharedMarine(ctx)).catch(e=>hud?.message(e.message))});
  if(active){
   updateVessel(ctx.paused?0:dt);
   const actions=ctx.paused||ctx.showLargeMap||mapOpen?{}:ctx.readControlActions?.('walk')||{};
   const jump=Number(actions.jump)>0;
   if(jump&&!jumpHeld&&stationDistance('dive')<=2.4){jumpHeld=jump;void enterWater(true);if(!active)return false;}
   jumpHeld=jump;
   const step=ctx.paused||ctx.showLargeMap||mapOpen?0:Math.min(.05,Math.max(0,dt));pose.yaw+=(Number(actions.turn)||Number(actions.lookYaw)||0)*2*step;
   const forward=Number(actions.move)||0,side=Number(actions.strafe)||0,length=Math.max(1,Math.hypot(forward,side)),speed=(actions.sprint?3.8:2.2)*step/length;
   const move=navigation().move;
   pose=move(pose,(Math.sin(pose.yaw)*forward-Math.cos(pose.yaw)*side)*speed,(Math.cos(pose.yaw)*forward+Math.sin(pose.yaw)*side)*speed);
   host.position.set(pose.x,pose.y??RCRV_LAYOUT.floorY,pose.z);host.rotation.set(0,pose.yaw,0);host.visible=true;
   updateCuratedCharacterAnimation(host,Math.hypot(forward,side)>.05,step,false);
   ctx.boatMode.mesh.userData.researchInterior?.update(pose,ctx);
   routeAge+=dt;if(routeAge>=.65){route=wayfinding?.route(pose,targetId)||[];routeAge=0;}
   host.updateWorldMatrix(true,true);const p=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(pose.x,(pose.y??RCRV_LAYOUT.floorY)+RESEARCH_EYE_HEIGHT,pose.z));world={x:p.x,y:p.y,z:p.z};
  }
  const target=stations().find(s=>s.id===targetId),distance=stationDistance(targetId);
  const next=route.find(p=>Math.hypot(p.x-pose.x,p.z-pose.z)>.65)||target;
  const bearing=Math.atan2(next.x-pose.x,next.z-pose.z)-pose.yaw;
  const turn=Math.atan2(Math.sin(bearing),Math.cos(bearing));const direction=Math.abs(turn)<.6?'ahead':Math.abs(turn)>2.5?'behind':turn>0?'to port':'to starboard';
  hud.show({active,canEnter:ready()&&stopped()&&!!ctx.Walk?.state?.characterMesh,failed:ctx.boatMode.mesh?.userData.researchVesselState==='failed',reason:!ready()?'Preparing the vessel and its equipment.':stopped()?'Explorer is loading.':'Stop the vessel before walking the deck.',moored:!!ctx.boatMode.moored,target,pose,route,room:researchRoomAt(pose),deck:researchDeckAt(pose),stations:stations(),distance,direction,busy,research:research.snapshot()});
  return active;
 }
 function camera(){
  if(!active)return false;
  const y=pose.y??RCRV_LAYOUT.floorY,anchor={x:pose.x,y:y+1.4,z:pose.z};
  const desired={x:pose.x-Math.sin(pose.yaw)*3.5,y:y+2.5,z:pose.z-Math.cos(pose.yaw)*3.5};
  const collision=navigation().blocked;
  const safe=resolveThirdPersonCameraCollision({anchor,target:desired,checkBuildingCollision:(x,z,r,actor)=>({collision:collision(x,z,r,actor.actorBaseY,actor.actorHeight)})});
  const distance=Math.hypot(safe.x-anchor.x,safe.y-anchor.y,safe.z-anchor.z);
  closeCamera=distance<(closeCamera?1.9:1.5);
  const point=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(closeCamera?pose.x:safe.x,closeCamera?y+RESEARCH_EYE_HEIGHT:safe.y,closeCamera?pose.z:safe.z));
  const look=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(closeCamera?pose.x+Math.sin(pose.yaw)*5:anchor.x,closeCamera?y+RESEARCH_EYE_HEIGHT:anchor.y,closeCamera?pose.z+Math.cos(pose.yaw)*5:anchor.z));
  ctx.camera.position.copy(point);ctx.camera.up.set(0,1,0);ctx.camera.lookAt(look);host.visible=!closeCamera;return true;
 }
 return {enter,release,helm,moor,select,act,update,camera,get active(){return active},
  stationDistance,atDivePlatform:()=>active&&stationDistance('dive')<=2.4,
  navigationActor:()=>({position:{...world},yaw:pose.yaw+(ctx.boat.angle||0)}),
  snapshot:()=>({active,pose:{...pose},world:{...world},targetId,room:researchRoomAt(pose),deck:researchDeckAt(pose),route:route.map(p=>({...p})),mapOpen,moored:!!ctx.boatMode?.moored,busy}),
  dispose(){if(disposed)return;release();disposed=true;hud?.dispose();hud=null;}};
}
