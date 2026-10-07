import {resolveSwimHullCamera} from '../walking/water/hull-camera.js';
import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
import {styleMarinePanel,setMarineText} from '../ocean/interface.js';

export function boatSwimAdmission({speed,coverage,depth,synthetic=false,walkingReady=true}) {
  if (!walkingReady) return {allowed:false,reason:'Explorer is still loading.'};
  if (!Number.isFinite(speed) || Math.abs(speed) > .5) return {allowed:false,reason:'Stop the vessel before entering the water.'};
  if (synthetic || coverage !== 'known-water-body' || !Number.isFinite(depth)) return {allowed:false,reason:'Swimming requires loaded mapped water and a known game bed.'};
  if (depth < 2) return {allowed:false,reason:'Move to water at least 2 m deep before using the ladder.'};
  return {allowed:true,reason:''};
}

export function boatLadderLocalPoint(catalog) {
  return {x:catalog.dimensions.width*.5+.18,y:0,z:-catalog.dimensions.length*.3};
}

export function addBoatSwimLadder(THREE,mesh,catalog) {
  const ladder=new THREE.Group();ladder.name='Boarding ladder';
  const p=boatLadderLocalPoint(catalog);ladder.position.set(p.x,0,p.z);
  const top=Math.max(.7,Math.min(catalog.dimensions.height*.17,catalog.dimensions.width*.45));
  const metal=new THREE.MeshStandardMaterial({color:0xe0c169,metalness:.65,roughness:.35});
  const tube=(radius,length,x,y,z,rotation=0)=>{
    const rung=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,8),metal);
    rung.position.set(x,y,z);rung.rotation.x=rotation;ladder.add(rung);
  };
  for (const z of [-.32,.32]) tube(.035,top+1.6,0,(top-1.6)/2,z);
  for (let y=-1.4;y<top;y+=.3) tube(.03,.64,0,y,0,Math.PI/2);
  mesh.add(ladder);
  return ladder;
}

export function createBoatSwimming({ctx,sample,groundY,park,resume,updateParked,hudFactory=createBoatSwimHud}) {
  let session=null,hud=null;
  const origin=()=>`${ctx.LOC?.lat}:${ctx.LOC?.lon}`;
  function ladderPoint(outside=0) {
    const p=boatLadderLocalPoint(getMaritimeCatalogEntry(ctx.boatMode.transportCatalogId));
    const angle=ctx.boat.angle,c=Math.cos(angle),s=Math.sin(angle);
    return {x:ctx.boat.x+(p.x+outside)*c+p.z*s,z:ctx.boat.z-(p.x+outside)*s+p.z*c};
  }
  function waterAt(p) {
    const bottom=groundY(p.x,p.z);
    return sample(p.x,p.z,null,{bottomY:bottom});
  }
  function admission() {
    if(ctx.boatDeck?.active&&!ctx.boatDeck.atDivePlatform())return {allowed:false,reason:"Walk to the dive platform first."};
    const point=ladderPoint(1),water=waterAt(point),units=ctx.METERS_PER_WORLD_UNIT||1;
    const result=boatSwimAdmission({speed:Math.hypot(ctx.boat.vx||0,ctx.boat.vz||0,ctx.boat.speed||0)*units,
      coverage:water.coverage,depth:(water.surfaceY-groundY(point.x,point.z))*units,
      synthetic:!!(ctx.boatMode.currentWater?.synthetic||ctx.boatMode.currentWater?.source?.synthetic),walkingReady:!!ctx.Walk?.state?.characterMesh});
    const wall=ctx.checkBuildingCollision?.(point.x,point.z,.4,{actorBaseY:water.surfaceY-.6,actorHeight:1});
    return {...result,...(wall?.collision?{allowed:false,reason:'The ladder exit is obstructed. Move into clear water.'}:{}),point,water};
  }
  function start() {
    if(session||!ctx.boatMode?.active||ctx.paused)return false;
    const gate=admission();if(!gate.allowed)return false;
    session={origin:origin(),entityId:ctx.boatMode.transportEntityId,catalogId:ctx.boatMode.transportCatalogId};
    ctx.boatMode.swimming=true;
    park();
    const w=ctx.Walk.state.walker;
    Object.assign(w,{x:gate.point.x,z:gate.point.z,y:gate.water.surfaceY+.18,yaw:ctx.boat.angle,angle:ctx.boat.angle,vy:0,vx:0,vz:0,_resolvedGroundState:null});
    ctx.Walk.setModeWalk({preserveResolvedSpawn:true,preserveResolvedSurface:true});
    ctx.updateControlsModeUI?.();
    return true;
  }
  function boarding() {
    if(!session)return {allowed:false,distance:Infinity};
    const p=ladderPoint(),w=ctx.Walk.state.walker,water=waterAt(p),units=ctx.METERS_PER_WORLD_UNIT||1;
    const distance=Math.hypot(w.x-p.x,w.z-p.z)*units;
    return {distance,allowed:distance<=3&&Math.abs(w.y-water.surfaceY)*units<=1.2};
  }
  function board(recovery=false) {
    if(!session||session.origin!==origin()||session.entityId!==ctx.boatMode.transportEntityId)return false;
    if(!recovery&&!boarding().allowed)return false;
    session=null;ctx.boatMode.swimming=false;
    ctx.Walk.setModeDrive({preserveResolvedSpawn:true});
    ctx.Walk.resupplyWater?.();
    resume();ctx.updateControlsModeUI?.();return true;
  }
  function cancel() {
    session=null;ctx.boatMode.swimming=false;
    if(!ctx.boatMode.active){if(ctx.boatMode.mesh)ctx.boatMode.mesh.visible=false;}
    hud?.hide();
  }
  function collision(x,z,radius,actor) {
    if(!session)return false;
    const dx=x-ctx.boat.x,dz=z-ctx.boat.z,c=Math.cos(ctx.boat.angle),s=Math.sin(ctx.boat.angle);
    const localX=dx*c-dz*s,localZ=dx*s+dz*c;
    const catalog=getMaritimeCatalogEntry(session.catalogId);
    return Math.abs(localX)<catalog.dimensions.width*.5+radius&&Math.abs(localZ)<catalog.dimensions.length*.5+radius
      && actor.actorBaseY<ctx.boat.y+catalog.dimensions.height&&actor.actorBaseY+actor.actorHeight>ctx.boat.y-catalog.dimensions.draft;
  }
  function update(dt) {
    const earth=!ctx.getEnv||ctx.getEnv()==='EARTH';
    if(session&&(!earth||origin()!==session.origin||ctx.Walk?.state?.mode!=='walk'||ctx.planeMode?.active||ctx.droneMode))cancel();
    if(!earth||(!session&&!ctx.boatMode?.active)){hud?.hide();return;}
    if(!session&&ctx.boatMode.transportCatalogId==='ocean-research-vessel'){hud?.hide();return;}
    hud ||= hudFactory({start,board});
    if(session){updateParked(ctx.paused?0:dt);hud.show({swimming:true,...boarding()});}
    else hud.show({swimming:false,...admission()});
  }
  function cameraPose(anchor,target) {
    if(!session)return target;
    return resolveSwimHullCamera({anchor,target,vesselPosition:ctx.boat,checkBuildingCollision:(...args)=>({collision:collision(...args)||!!ctx.checkBuildingCollision?.(...args)?.collision})});
  }
  return {start,board,update,cancel,collision,cameraPose,get active(){return !!session},snapshot:()=>session?{...session,...boarding()}:null,
    dispose(){cancel();hud?.dispose();hud=null;}};
}

function createBoatSwimHud({start,board}) {
  const panel=document.createElement('section');panel.id='boatSwimmingControls';panel.setAttribute('aria-label','Vessel swimming');
  styleMarinePanel(panel,'swimmer');
  const button=document.createElement('button'),status=document.createElement('div');button.type='button';button.id='boatSwimmingToggle';status.setAttribute('role','status');
  panel.append(button,status);document.body.append(panel);let swimming=false;
  button.onclick=()=>{button.blur();if(swimming)board();else start()};
  return {hide:()=>{panel.hidden=true},dispose:()=>{panel.remove()},show:value=>{
    panel.hidden=false;swimming=value.swimming;button.disabled=!value.allowed;
    setMarineText(button,swimming?`Board via ladder · ${Math.round(value.distance)} m`:'Enter water at ladder');
    setMarineText(status,swimming?'Return to the ladder at the surface. Recover brings you aboard.':value.reason||'Vessel stays moored while you swim.');
  }};
}
