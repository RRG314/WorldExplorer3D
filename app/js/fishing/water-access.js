import {pointInWaterBody} from '../world/water-surface-registry.js?v=3';
import {nearestPointOnPolygon,nearestPointOnPolyline} from '../boat-mode/water-geometry.js?v=4';
import {waterSurfaceBaseYAt} from '../boat-mode/water-query.js?v=21';

// Fishing access is not a vessel-size test. A mapped pond or narrow exposed
// stream can support a bank cast without becoming navigable by a boat.
export function nearestFishingWater(ctx,x,z,maxDistance,options={}) {
 if (!Array.isArray(ctx.waterAreas) && !Array.isArray(ctx.waterways)) return ctx.inspectBoatCandidate?.(x,z,maxDistance,options) || null;
 let best=null;
 for(const source of [...(ctx.waterAreas||[]),...(ctx.waterways||[])]) {
  if(source.synthetic || source.structureSemantics?.terrainMode==='subgrade')continue;
  const linear=source.shape==='waterway';
  let edge=linear?nearestPointOnPolyline(x,z,source.pts):nearestPointOnPolygon(x,z,source.pts);
  if(!edge)continue;
  if(!linear)for(const hole of source.holes||[]){const next=nearestPointOnPolygon(x,z,hole);if(next&&next.dist<edge.dist)edge=next;}
  const halfWidth=linear?Math.max(0,Number(source.width)||0)*.5:0;
  if(linear && !halfWidth)continue;
  const inside=linear?edge.dist<=halfWidth:pointInWaterBody(source,x,z);
  const distanceToWater=inside?0:Math.max(0,edge.dist-halfWidth);
  if(distanceToWater>maxDistance || best&&best.distanceToWater<=distanceToWater)continue;
  const towardX=edge.point.x-x,towardZ=edge.point.z-z,len=Math.hypot(towardX,towardZ)||1;
  let target=linear?{x:edge.point.x-towardX/len*Math.max(0,halfWidth-1),z:edge.point.z-towardZ/len*Math.max(0,halfWidth-1)}
    :{x:edge.point.x+towardX/len,z:edge.point.z+towardZ/len};
  if(!linear&&!pointInWaterBody(source,target.x,target.z)){
    const normal={x:-edge.tangent.z,z:edge.tangent.x};
    target={x:edge.point.x+normal.x*.25,z:edge.point.z+normal.z*.25};
    if(!pointInWaterBody(source,target.x,target.z))target={x:edge.point.x-normal.x*.25,z:edge.point.z-normal.z*.25};
    if(!pointInWaterBody(source,target.x,target.z))continue;
  }
  const candidate={source,inside,distanceToWater,entryPoint:target,waterKind:source.waterKind,label:source.label};
  const y=waterSurfaceBaseYAt(target.x,target.z,candidate);
  if(Number.isFinite(options.referenceY)&&(!Number.isFinite(y)||Math.abs(options.referenceY-y)>(options.maximumVerticalDelta||8)))continue;
  best=candidate;
 }
 return best;
}
