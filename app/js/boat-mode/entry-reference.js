// A checked ocean handoff has already selected and committed its geographic
// frame. The outgoing drone/plane/tunnel contact belongs to the previous frame.
// Ordinary nearby boarding continues to use that active actor's reachability.
export function resolveBoatEntryReference(current,options={},origin={}) {
 const arrival=options.surfaceArrival,candidate=options.candidate;
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
