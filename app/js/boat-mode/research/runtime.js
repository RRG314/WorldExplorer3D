import {ensureMarineResearch} from '../../ocean/research-outing.js';
import {RESEARCH_DECK as deck,RESEARCH_STATIONS,moveOnResearchDeck,researchDeckCollision,researchStationDistance} from './layout.js';
import {createResearchDeckHud} from './ui.js';
import {researchLabRecord} from './lab.js';
import {resolveThirdPersonCameraCollision} from '../../walking/camera-collision.js?v=1';
import {updateCuratedCharacterAnimation} from '../../walking/curated-explorer-character.js?v=8';
import {createIndexedDbDiscoveryProfileStore} from '../../discovery/profile-store.js?v=5';

export function createResearchDeck({ctx,resetDynamics,updateVessel,hudFactory=createResearchDeckHud}) {
 const research=ensureMarineResearch(ctx);
 let active=false,host=null,parent=null,hud=null,targetId='lab',busy=false,epoch=0;
 let pose={x:2.4,z:-24,yaw:0},world={x:0,y:0,z:0},origin='';
 const supported=()=>ctx.boatMode?.active&&ctx.boatMode.transportCatalogId==='ocean-research-vessel';
 const stopped=()=>Math.hypot(ctx.boat.vx||0,ctx.boat.vz||0,ctx.boat.speed||0)*(ctx.METERS_PER_WORLD_UNIT||1)<=.5;
 function enter(atLadder=false) {
  if(active)return true;
  if(!supported()||!stopped()||!ctx.Walk?.state?.characterMesh)return false;
  ctx.Walk.deactivateWater?.();resetDynamics();ctx.boatMode.moored=true;
  host=ctx.Walk.state.characterMesh;parent=host.parent;ctx.boatMode.mesh.add(host);host.visible=true;
  pose={x:atLadder?6.1:2.4,z:-23.4,yaw:0};origin=`${ctx.LOC?.lat}:${ctx.LOC?.lon}`;active=true;epoch++;
  ctx.clearControlInputState?.('research-deck-enter');ctx.updateControlsModeUI?.();return true;
 }
 function release(){
  if(!active)return;
  active=false;epoch++;busy=false;
  if(host){host.visible=false;host.rotation.set(0,0,0);if(parent)parent.add(host);else host.parent?.remove(host);}
  host=null;parent=null;ctx.clearControlInputState?.('research-deck-exit');ctx.updateControlsModeUI?.();
 }
 function helm(){release();return true;}
 function moor(){if(ctx.sharedMarine?.active)return false;if(!supported())return false;ctx.boatMode.moored=!ctx.boatMode.moored;if(ctx.boatMode.moored)resetDynamics();return true;}
 const select=id=>{if(RESEARCH_STATIONS.some(s=>s.id===id))targetId=id};
 async function act(){
  if(!active||busy||researchStationDistance(pose,targetId)>2.4)return false;
  if(targetId==='helm')return helm();
  if(targetId==='chart'){ctx.openLargeMap?.();return true;}
  if(targetId==='sub'){
   busy=true;try{const started=!!await ctx.transferBoatToSubmarine?.({source:'research-cradle'});if(!started)hud?.message(ctx.boatMode.promptMessage||'Submarine launch is unavailable here. Move to deeper open water and try again.');return started;}finally{busy=false;}
  }
  if(targetId==='dive'){
   const started=ctx.boatSwimming?.start();
   if(!started)hud?.message('Ladder swimming needs loaded mapped deep water. Use Travel → Submarine for open-ocean exploration.');
   return !!started;
  }
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
  if(active&&(!supported()||origin!==`${ctx.LOC?.lat}:${ctx.LOC?.lon}`||ctx.getEnv?.()&&ctx.getEnv()!=='EARTH'))release();
  if(!supported()){hud?.hide();return false;}
  hud ||= hudFactory({enter:()=>enter(),helm,moor,act:()=>void act(),select,researchAct:()=>void research.labAction(),sharedAct:()=>void import('../../ocean/shared-marine-runtime.js').then(m=>m.openSharedMarine(ctx)).catch(e=>hud?.message(e.message))});
  if(active){
   updateVessel(ctx.paused?0:dt);
   const actions=ctx.paused||ctx.showLargeMap?{}:ctx.readControlActions?.('walk')||{};
   const step=Math.min(.05,Math.max(0,dt));pose.yaw+=(Number(actions.turn)||Number(actions.lookYaw)||0)*2*step;
   const forward=Number(actions.move)||0,side=Number(actions.strafe)||0,length=Math.max(1,Math.hypot(forward,side)),speed=(actions.sprint?3.8:2.2)*step/length;
   pose=moveOnResearchDeck(pose,(Math.sin(pose.yaw)*forward-Math.cos(pose.yaw)*side)*speed,(Math.cos(pose.yaw)*forward+Math.sin(pose.yaw)*side)*speed);
   host.position.set(pose.x,deck.y,pose.z);host.rotation.set(0,pose.yaw,0);host.visible=true;
   updateCuratedCharacterAnimation(host,Math.hypot(forward,side)>.05,step,false);
   host.updateWorldMatrix(true,true);const p=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(pose.x,deck.y+deck.eyeHeight,pose.z));world={x:p.x,y:p.y,z:p.z};
  }
  const target=RESEARCH_STATIONS.find(s=>s.id===targetId),distance=researchStationDistance(pose,targetId);
  const bearing=Math.atan2(target.x-pose.x,target.z-pose.z)-pose.yaw;
  const turn=Math.atan2(Math.sin(bearing),Math.cos(bearing));const direction=Math.abs(turn)<.6?'ahead':Math.abs(turn)>2.5?'behind':turn>0?'to port':'to starboard';
  hud.show({active,canEnter:stopped()&&!!ctx.Walk?.state?.characterMesh,reason:stopped()?'Explorer is loading.':'Stop the vessel before walking the deck.',moored:!!ctx.boatMode.moored,target,distance,direction,busy,research:research.snapshot()});
  return active;
 }
 function camera(){
  if(!active)return false;
  const anchor={x:pose.x,y:deck.y+1.4,z:pose.z};
  const desired={x:pose.x-Math.sin(pose.yaw)*3.5,y:deck.y+2.5,z:pose.z-Math.cos(pose.yaw)*3.5};
  const safe=resolveThirdPersonCameraCollision({anchor,target:desired,checkBuildingCollision:(x,z,r,actor)=>({collision:researchDeckCollision(x,z,r,actor.actorBaseY,actor.actorHeight)})});
  const point=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(safe.x,safe.y,safe.z));
  const look=ctx.boatMode.mesh.localToWorld(new THREE.Vector3(anchor.x,anchor.y,anchor.z));
  ctx.camera.position.copy(point);ctx.camera.up.set(0,1,0);ctx.camera.lookAt(look);host.visible=safe.ratio>.12;return true;
 }
 return {enter,release,helm,moor,select,act,update,camera,get active(){return active},
  atDivePlatform:()=>active&&researchStationDistance(pose,'dive')<=2.4,
  navigationActor:()=>({position:{...world},yaw:pose.yaw+(ctx.boat.angle||0)}),
  snapshot:()=>({active,pose:{...pose},world:{...world},targetId,moored:!!ctx.boatMode?.moored,busy}),
  dispose(){release();hud?.dispose();hud=null;}};
}
