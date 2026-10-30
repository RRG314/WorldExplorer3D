import {roadPavementSectionForSegment} from './road-pavement-sections.js';
// A camera probe needs the closest segment and its surface, not driving
// connectivity, transition distances, continuity weights or a route result.
// Scratch belongs to this invocation so nested surface queries are safe.
export function cameraRoadSurfaceHit(roads, x, y, z, radius, sampleHeight, widthAt, isSuppressed) {
  const projection={x:0,z:0,dist:Infinity,segIndex:-1,t:0};
  for(const road of roads){
    if(isSuppressed(road))continue;
    const points=road?.pts;
    if(!Array.isArray(points)||points.length<2)continue;
    projection.dist=Infinity;projection.segIndex=-1;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
      if(lengthSquared===0)continue;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/lengthSquared));
      const px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(x-px,z-pz);
      if(distance<projection.dist){projection.x=px;projection.z=pz;projection.dist=distance;projection.segIndex=i;projection.t=t;}
    }
    if(projection.segIndex<0)continue;
    const section=roadPavementSectionForSegment(road,projection.segIndex,projection.t);
    let extent=widthAt(road,projection)*.5;
    if(section){const a=points[projection.segIndex],b=points[projection.segIndex+1],lateral=-(x-projection.x)*(b.z-a.z)+(z-projection.z)*(b.x-a.x);extent=lateral>=0?section.positive:section.negative;}
    if(projection.dist>extent+radius)continue;
    const height=sampleHeight(road,x,z,projection);
    if(Number.isFinite(height)&&Math.abs(y-height)<=radius+.12)return true;
  }
  return false;
}
