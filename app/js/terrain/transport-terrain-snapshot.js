import {createTerrainHeightSamplingApi} from './height-sampling.js?v=15';
import {sampleFarFieldGridWorldY} from './far-field-geometry.js?v=18';
import {terrainHeightWithPortalCuts} from './structure-terrain-portals.js?v=2';

// This snapshot contains geometry and source coordinates only. No scene,
// renderer, cache or mutable world object crosses the worker boundary.
export function captureTransportTerrain(appCtx) {
  const meshes=(appCtx.terrainGroup?.children||[]).filter(mesh=>mesh.visible!==false&&
    !mesh.userData?.pendingTerrainTile&&(mesh.userData?.isTerrainMesh||mesh.userData?.isFarTerrainClipmap)).map(mesh=>({
      position:{x:mesh.position.x,y:mesh.position.y,z:mesh.position.z},
      positions:mesh.geometry.attributes.position.array,
      indices:mesh.geometry.getIndex()?.array||null,
      segments:mesh.geometry.parameters?.widthSegments,
      userData:{isTerrainMesh:mesh.userData.isTerrainMesh,isFarTerrainClipmap:mesh.userData.isFarTerrainClipmap,
        terrainTile:mesh.userData.terrainTile?true:undefined,
        structureTerrainPortalDescriptors:mesh.userData.structureTerrainPortalDescriptors}
    }));
  return {meshes,segments:appCtx.TERRAIN_SEGMENTS,far:appCtx.getFarTerrainSurfaceSnapshot?.()||null,
    portalMasks:appCtx.structureTerrainPortalDescriptors||[]};
}
export function restoreTransportTerrain(snapshot) {
  const meshes=snapshot.meshes.map(item=>{
    const a=item.positions;
    return {visible:true,position:item.position,userData:item.userData,geometry:{
      parameters:{widthSegments:item.segments},attributes:{position:{array:a,count:a.length/3,getX:i=>a[i*3],getY:i=>a[i*3+1],getZ:i=>a[i*3+2]}},
      getIndex:()=>item.indices?{array:item.indices}:null
    }};
  });
  const api=createTerrainHeightSamplingApi({appCtx:{terrainGroup:{children:meshes},TERRAIN_SEGMENTS:snapshot.segments,
    sampleFarTerrainWorldYAt:(x,z,options={})=>{
      const y=sampleFarFieldGridWorldY(x,z,snapshot.far?.grid);
      return options.ignorePortalCuts?y:terrainHeightWithPortalCuts(snapshot.far?.portals,x,z,y);
    }},elevationWorldYAtWorldXZ:()=>NaN});
  return {meshes,sampleTop:(x,z)=>api.cachedTerrainHeight(x,z)+.18,
    sampleUncutTop:(x,z)=>api.terrainMeshHeightAt(x,z,{ignorePortalCuts:true})+.18,dispose:api.clearTerrainHeightCache};
}
