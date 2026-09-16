import {drainCooperatively} from './cooperative-scheduling.js?v=1';

// Keep the accepted scene and collision placements together until replacement
// preparation succeeds. Staged roots are owned here even if rendering cancels.
export async function publishVegetationCooperatively(ctx, {collect,render,dispose,current=()=>true,onSlice=()=>{},...scheduler}) {
  const meshes=[];
  let features=[], status, committed=false;
  const schedule={...scheduler,current,onSlice};
  const stage={
    get _worldLoadSequence(){return ctx._worldLoadSequence;},
    worldSurfaceProfile:ctx.worldSurfaceProfile, LOC:ctx.LOC,
    terrainMeshHeightAt:ctx.terrainMeshHeightAt?.bind(ctx),
    elevationWorldYAtWorldXZ:ctx.elevationWorldYAtWorldXZ?.bind(ctx),
    scheduleWorldCoverVegetationRefresh:()=>ctx.scheduleWorldCoverVegetationRefresh?.(),
    vegetationMeshes:meshes, addEarthWorldObject(){},
    replaceWorldCollection(name,value){if(name==='vegetationFeatures')features=value;},
    set vegetationModelStatus(value){status=value;}
  };
  try {
    const placements=await collect(schedule);
    const count=await render(stage,placements,schedule);
    if(!current())return null;
    const previous=ctx.vegetationMeshes || [];
    for(const mesh of previous)mesh?.parent?.remove(mesh);
    for(const mesh of meshes)ctx.addEarthWorldObject(mesh);
    ctx.replaceWorldCollection('vegetationMeshes',meshes);
    ctx.replaceWorldCollection('vegetationFeatures',features);
    ctx.vegetationModelStatus=status;
    committed=true;
    // Retired geometry can be released across turns after atomic publication.
    await drainCooperatively((function*(){for(const mesh of previous){dispose(mesh);yield;}})(), {...scheduler,onSlice});
    return count;
  } finally {
    if(!committed)for(const mesh of meshes)dispose(mesh);
  }
}
