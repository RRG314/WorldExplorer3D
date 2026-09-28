import {prepareCarriagewayTiles,unionCarriageway} from '../world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../world/compiler/street-carriageway-mesh.js';
import {createPavementTerrainPartition} from '../world/pavement-terrain-partition.js';
import {pavementMaskLayout,rasterizePavementMask} from '../world/compiler/pavement-mask.js';
import {restoreTransportTerrain} from './transport-terrain-snapshot.js';
import {planTransportRegions,nearestTransportRegion} from './transport-detail-plan.js';
import {createSpatialRoadBatches} from './spatial-road-batches.js';

// The planar footprint is independent of terrain elevation. It can compile
// while the main thread publishes the final cut/fill surface.
export function prepareTransportDetailPlan({roads,focus={x:0,z:0},radius,maxTextureSize=4096}) {
  const tiles=prepareCarriagewayTiles(roads);
  const keys=tiles.map(tile=>tile.key),layout=pavementMaskLayout(keys,maxTextureSize);
  const masks=new Uint8Array(keys.length*layout.resolution**2);
  for(let i=0;i<tiles.length;i++){
    const tile=tiles[i];tile.polygons=unionCarriageway(tile);
    masks.set(rasterizePavementMask(tile.polygons,tile.bounds,layout.resolution),i*layout.resolution**2);
  }
  const plan=planTransportRegions(tiles,focus,radius);
  return {tiles,keys,layout,masks,plan};
}

export function createTransportDetailCompiler({roads,terrain,focus={x:0,z:0},radius,maxTextureSize=4096,heightProbes=[],preparedPlan=null}) {
  const restored=restoreTransportTerrain(terrain);
  const heightParity={samples:heightProbes.length,maximumDifference:0};
  for(const point of heightProbes){
    const actual=restored.sampleTop(point.x,point.z),difference=Math.abs(actual-point.y);
    if(!Number.isFinite(actual)||!Number.isFinite(point.y)||difference>1e-4)throw new Error('Transport terrain snapshot differs from the published height authority');
    heightParity.maximumDifference=Math.max(heightParity.maximumDifference,difference);
  }
  const partition=createPavementTerrainPartition(restored.meshes,{includeFarTerrain:true});
  const {tiles,keys,layout,masks,plan}=preparedPlan || prepareTransportDetailPlan({roads,focus,radius,maxTextureSize});
  function compile(region){
    const builder=createSpatialRoadBatches();
    for(const tile of region.tiles){
      const mesh=meshCarriagewayTile(tile,restored.sampleTop,partition,{polygons:tile.polygons});
      builder.append(mesh.positions,mesh.indices,'at_grade');
      tile.polygons=null;
    }
    builder.finish();
    return {key:region.key,bounds:region.bounds,keys:region.tiles.map(tile=>tile.key),
      roadIndices:[...new Set(region.tiles.flatMap(tile=>[...tile.segments,...tile.joins].map(item=>item.road.auditIndex)))],
      batches:builder.batches.map(batch=>({positions:Float32Array.from(batch.verts),indices:Uint32Array.from(batch.indices)}))};
  }
  const initial=plan.initial.map(compile);
  return {
    initial:{keys,layout,masks,heightParity,regions:initial,pending:plan.pending.map(({key,bounds})=>({key,bounds})),totalCells:tiles.length},
    next(focus={x:0,z:0}){
      const index=nearestTransportRegion(plan.pending,focus);
      if(index<0)return null;
      const region=plan.pending.splice(index,1)[0];
      return {...compile(region),remaining:plan.pending.length};
    },
    dispose(){partition.dispose();restored.dispose();plan.pending.length=0;plan.initial.length=0;tiles.length=0;}
  };
}
