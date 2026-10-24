import {isEarthWorldUsable} from '../earth-core/world-readiness.js';

// A checked ocean handoff has already selected and committed its geographic
// frame. The outgoing drone/plane/tunnel contact belongs to the previous frame.
// Ordinary nearby boarding continues to use that active actor's reachability.
export function resolveBoatEntryReference(current,options={},origin={},context={}) {
 const candidate=options.candidate,restoration=options.earthSessionArrival;
 if(restoration){
  // A saved-vessel return belongs to a currently published Earth session. The
  // retiring airborne actor cannot provide a nearby boarding reference. This
  // reference only selects the arrival; hull/depth/obstacle admission still runs.
  if(context.earthResumePending!==true||context.getEnv?.()!==context.ENV?.EARTH||
    !isEarthWorldUsable(context)||restoration.publication!==context.worldPublication||
    restoration.session?.isCurrent?.()!==true||restoration.lat!==origin.lat||restoration.lon!==origin.lon||
    ![restoration.lat,restoration.lon,options.spawnX,options.spawnZ,candidate?.surfaceY].every(Number.isFinite))return null;
  return {x:options.spawnX,y:candidate.surfaceY,z:options.spawnZ,angle:Number(options.yaw)||0,mode:'walk',structureTerrainMode:'at_grade'};
 }
 const arrival=options.surfaceArrival;
 if(!arrival)return current;
 if(arrival.lat!==origin.lat||arrival.lon!==origin.lon||
   ![arrival.lat,arrival.lon,options.spawnX,options.spawnZ,candidate?.surfaceY].every(Number.isFinite)||
   candidate?.source?.synthetic!==true||candidate?.source?.provenance?.dataset!=='synthetic-transition')return null;
 return {x:options.spawnX,y:candidate.surfaceY,z:options.spawnZ,angle:Number(options.yaw)||0,mode:'walk',structureTerrainMode:'at_grade'};
}

// Teardown (menu/planetary/air handoff) must also work when the session began
// directly at sea and no terrestrial terrain module was loaded. These are
// transient actor poses; this does not publish a ground surface or enable exit.
export function boatExitActorHeights(ctx,x,z,vesselY) {
 const elevation=ctx.elevationWorldYAtWorldXZ?.(x,z);
 const fallback=Number.isFinite(elevation)?elevation:Number.isFinite(vesselY)?vesselY:0;
 const walk=ctx.GroundHeight?.walkSurfaceY?.(x,z),road=ctx.GroundHeight?.roadSurfaceY?.(x,z);
 return {walkerY:(Number.isFinite(walk)?walk:fallback)+1.7,carY:(Number.isFinite(road)?road:fallback)+1.1};
}
