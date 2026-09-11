// Shared browser/derivative authority. Wall indices and region coordinates never move.
export function exteriorPhotoGeometry(points,height,patch){
  const a=points[patch.wall],b=points[(patch.wall+1)%points.length];
  if(!a||!b)throw Error('invalid_hybrid_wall');
  const [l,bottom,r,top]=patch.region;
  const point=(u,v)=>[a.x+(b.x-a.x)*u,height*v,a.z+(b.z-a.z)*u];
  const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0);
  // In east/south coordinates a positive ring is viewed from the back of the
  // original quad. V2 makes photo-left read left from OUTSIDE for either winding.
  // Missing version intentionally preserves already-authored/approved V1 imagery.
  const flip=patch.orientationVersion===2&&area>0;
  return {positions:[...point(l,bottom),...point(r,bottom),...point(r,top),...point(l,top)],
    uv:flip?[1,0,0,0,0,1,1,1]:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]};
}
