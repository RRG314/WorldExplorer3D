import { createResidentBody,normalizedHeading } from './resident-body.mjs';
import { createConstructionProjection } from './construction-projection.mjs';
import { createWorldAuthority } from './world-authority.mjs';
import { createWorkshopService } from './workshop.mjs';

const finitePoint = p => p && ['x','y','z'].every(key => Number.isFinite(p[key]));

export function resourceReachObservation(from,to,metersPerWorldUnit){
 const distanceMeters=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)*metersPerWorldUnit;
 return {distanceMeters,withinReach:distanceMeters<=3,reachMeters:3};
}

export function targetDirectionObservation(from,to,heading,metersPerWorldUnit){
 const dx=to.x-from.x,dz=to.z-from.z;
 const horizontalDistanceMeters=Math.hypot(dx,dz)*metersPerWorldUnit;
 return {horizontalDistanceMeters,forwardMeters:(dx*Math.sin(heading)+dz*Math.cos(heading))*metersPerWorldUnit,leftMeters:(-dx*Math.cos(heading)+dz*Math.sin(heading))*metersPerWorldUnit,relativeBearingRadians:horizontalDistanceMeters<1e-9?null:normalizedHeading(Math.atan2(dx,dz)-heading)};
}

// Operator-owned connection to an ALREADY loaded isolated World Explorer scene.
// It never imports app-entry, initializes accounts, or creates replacement ground.
export function createMappedWorldHost({THREE,appCtx,manifest,initialState,persistWorkshop}) {
  const publication=appCtx?.worldPublication;
  if(manifest?.environment!=='isolated-research' || manifest.runId!==initialState?.runId ||
      manifest.worldSnapshotId!==publication?.id || publication?.type!=='WorldSnapshot' || !Object.isFrozen(publication) ||
      appCtx.worldLoading || !appCtx.scene || typeof appCtx.SurfaceQuery?.walkAt!=='function' ||
      typeof appCtx.checkBuildingCollision!=='function' || !finitePoint(manifest.spawn) ||
      !Number.isFinite(manifest.spawn.yaw) || !Number.isFinite(manifest.radiusMeters) || manifest.radiusMeters<5 || manifest.radiusMeters>100 ||
      Object.keys(initialState.actors).length!==1 || typeof persistWorkshop!=='function')throw Error('An isolated, published research world and one-resident manifest are required.');
  const actorId=Object.keys(initialState.actors)[0];
  const surfaceQuery=appCtx.SurfaceQuery;
  const origin={...manifest.spawn};
  const units=appCtx.METERS_PER_WORLD_UNIT;
  if(!Number.isFinite(units)||units<=0)throw Error("Mapped world units are required.");
  const validWorld=()=>{
    if(appCtx.worldPublication!==publication || appCtx.SurfaceQuery!==surfaceQuery || appCtx.worldLoading || appCtx.activeInterior || appCtx.onMoon || appCtx.onMars)throw Error('Research world changed; pause and rebind a new run.');
  };
  const inside=p=>finitePoint(p)&&Math.hypot(p.x-origin.x,p.z-origin.z)*units<=manifest.radiusMeters;
  const projection=createConstructionProjection({THREE,scene:appCtx.scene,runId:manifest.runId});
  const worldCollision=(x,z,radius,options)=>{
    validWorld();if(!inside({x,y:0,z}))return {collision:true};
    return appCtx.checkBuildingCollision(x,z,radius,options);
  };
  const surfaceAt=(x,z,options={})=>{
    validWorld();if(!inside({x,y:0,z}))throw Error('Outside research boundary.');
    const sample=surfaceQuery.walkAt(x,z,options);
    if(!finitePoint(sample?.position)||sample.traversal?.walk!==true||sample.kind==='water'||sample.kind==='interior'||sample.provenance?.fallback===true||(sample.kind==='terrain'&&sample.provenance?.source!=='accepted_ground_artifact'))throw Error('No accepted outdoor walking surface.');
    return sample;
  };
  const buildingCollision=(x,z,radius,options)=>worldCollision(x,z,radius,options);
  const combinedBuildCollision=(...args)=>{
    validWorld();const research=projection.getBuildCollisionAtWorldXZ(...args);
    const existing=appCtx.getBuildCollisionAtWorldXZ?.(...args);
    if(existing?.blocked)return existing;if(research.blocked)return research;
    const tops=[research.stepTopY,existing?.stepTopY].filter(Number.isFinite);
    return {...research,stepTopY:tops.length?Math.max(...tops):null};
  };
  const combinedBuildTop=(...args)=>{
    validWorld();const tops=[projection.getBuildTopSurfaceAtWorldXZ(...args),appCtx.getBuildTopSurfaceAtWorldXZ?.(...args)].filter(Number.isFinite);
    return tops.length?Math.max(...tops):null;
  };
  let body,workshop;
  try {
    const spawnSurface=surfaceAt(origin.x,origin.z,{currentY:origin.y-1.7});
    if(Math.abs(spawnSurface.position.y+1.7-origin.y)>.15 || buildingCollision(origin.x,origin.z,.35,{actorBaseY:origin.y-1.7,actorHeight:1.7}).collision)throw Error('Spawn does not match clear mapped ground.');
    projection.reconcile(initialState);
    body=createResidentBody({THREE,scene:appCtx.scene,actorId,spawn:origin,world:{
      walkSurfaceAt:surfaceAt,checkBuildingCollision:buildingCollision,metersPerWorldUnit:units,
      getBuildCollisionAtWorldXZ:combinedBuildCollision,getBuildTopSurfaceAtWorldXZ:combinedBuildTop,
      getBuildingsArray:()=>appCtx.buildings||[],getNearbyBuildings:appCtx.getNearbyBuildings,
      isPointInPolygon:appCtx.pointInPolygon
    }});
    const raycaster=new THREE.Raycaster();
    function lineOfSight({from,to}) {
      validWorld();if(!inside(from)||!inside(to))return false;
      const delta=new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z),length=delta.length();
      if(length<.001)return true;
      raycaster.set(new THREE.Vector3(from.x,from.y,from.z),delta.normalize());raycaster.near=.02;raycaster.far=Math.max(.02,length-.05);
      if(raycaster.intersectObjects((appCtx.buildingMeshes||[]).filter(m=>m.visible!==false),true).length)return false;
      // Include constructed walls using the retained block collision query.
      for(let d=.1;d<length-.05;d+=.1){const p={x:from.x+delta.x*d,y:from.y+delta.y*d,z:from.z+delta.z*d};if(combinedBuildCollision(p.x,p.z,p.y,0,.02).blocked)return false;}
      return true;
    }
    const buildSites=manifest.buildSites||[];
    const grants=new Set(manifest.resourceNodeIds||[]);
    const authority=createWorldAuthority({runId:manifest.runId,metersPerWorldUnit:units,snapshot:()=>workshop.snapshot(),bodies:new Map([[actorId,body]]),world:{
      lineOfSight,
      permits:({actorId:id,target,action})=>{
        validWorld();if(id!==actorId||!inside(target.position))return false;
        if(action==='gather')return grants.has(target.id);
        if(['store','retrieve','work'].includes(action))return target.ownerId===actorId;
        if(action==='build')return true;
        return false; // No inferred rights to mapped private rooms or other actors.
      },
      placementAllowed:({placement})=>{
        validWorld();const {gx,gy,gz}=placement;
        if(!buildSites.some(site=>site.gx===gx&&site.gy===gy&&site.gz===gz))return false;
        const ground=surfaceAt(gx,gz,{currentY:gy}).position.y;
        if(gy-.5<ground-.1 || gy-ground>3)return false;
        if(buildingCollision(gx,gz,.75,{actorBaseY:gy-.5,actorHeight:1}).collision)return false;
        return !combinedBuildCollision(gx,gz,gy-.5,0,1).blocked;
      },
      shelterAt:()=>null,transferConsented:()=>false
    }});
    workshop=createWorkshopService({initialState,authorize:authority.authorize,persist:persistWorkshop,maxEvents:manifest.runWindow?.maxEvents??1000});
    function perceive() {
      validWorld();const observedBody=body.observation(),from=observedBody.position,heading=observedBody.yaw,state=workshop.stateView();
      const visible=[];
      for(const node of Object.values(state.nodes)) {
        if(!grants.has(node.id)||!inside(node.position)||Math.hypot(node.position.x-from.x,node.position.y-from.y,node.position.z-from.z)*units>25||!lineOfSight({from,to:node.position}))continue;
        visible.push({id:node.id,kind:'resource',materialId:node.materialId,position:{...node.position},...resourceReachObservation(from,node.position,units),...targetDirectionObservation(from,node.position,heading,units),remaining:node.remaining,requiredTool:node.requiredTool??null});
      }
      for(const structure of Object.values(state.structures)) {
        const position={x:structure.block.gx,y:structure.block.gy,z:structure.block.gz};
        if(Math.hypot(position.x-from.x,position.y-from.y,position.z-from.z)*units>25)continue;
        // Owned construction is remembered, not proof of current line of sight.
        visible.push({id:structure.id,kind:structure.kind,knowledge:'owned-construction-record',position,capabilities:structure.capabilities});
      }
      const sight=[];
      for(let ray=0;ray<9;ray++) {
        const yaw=heading-.8+ray*.2;let clearMeters=0;
        for(let distance=.25;distance<=8;distance+=.25) {
          const x=from.x+Math.sin(yaw)*distance/units,z=from.z+Math.cos(yaw)*distance/units;
          if(!inside({x,y:from.y,z})||worldCollision(x,z,.35,{actorBaseY:from.y-1.7,actorHeight:1.7}).collision||combinedBuildCollision(x,z,from.y-1.7,.65,1.7).blocked)break;
          clearMeters=distance;
        }
        sight.push({yaw:normalizedHeading(yaw),relativeBearingRadians:ray*.2-.8,clearMeters,maximumMeters:8});
      }
      return {worldSnapshotId:publication.id,coordinates:'World Explorer local units, +y up; yaw zero faces +z; yaw and relative bearings are radians in [-pi,pi]; positive bearing uses positive turn; forwardMeters and leftMeters are body-relative offsets, not a verified route',metersPerWorldUnit:units,forwardClearance:sight,objects:visible.slice(0,32),buildSites:buildSites.filter(p=>Math.hypot(p.gx-from.x,p.gz-from.z)*units<=3)};
    }
    return Object.freeze({body,workshop,perceive,validate:validWorld,
      reconcile(){validWorld();return projection.reconcile(workshop.stateView());},
      dispose(){body.dispose();projection.dispose();}
    });
  }catch(error){body?.dispose();projection.dispose();throw error;}
}
