import {frontageHit} from './street-frontage-geometry.js';
import {FRONTAGE_RULES} from './street-frontage-policy.js';
function inRing(x,z,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,az]=ring[i],[bx,bz]=ring[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
}
// A dense cell can contain thousands of pavement edges. Corner probes used to
// walk every ring, including polygons nowhere near the probe. Bounds only reject
// impossible hits; the original even/odd test still decides boundaries and holes.
export function pavementCoverageQuery(polygons){
  const entries=polygons.map(polygon=>{
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const [x,z] of polygon[0]){minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
    return {polygon,minX,minZ,maxX,maxZ};
  });
  return point=>{
    for(const {polygon,minX,minZ,maxX,maxZ} of entries){
      if(point.x<minX||point.x>maxX||point.z<minZ||point.z>maxZ||!inRing(point.x,point.z,polygon[0]))continue;
      let hole=false;
      for(let i=1;i<polygon.length;i++)if(inRing(point.x,point.z,polygon[i])){hole=true;break;}
      if(!hole)return true;
    }
    return false;
  };
}

// A convex building corner with pavement already reaching both adjacent
// facades defines a corner region between those facades and the two curb
// lines. This is a geometric construction, not dilation/erosion of a tile.
// Building, carriageway and protected-land subtraction still apply afterward.
export function frontageCornerRegions(buildingPolygons,pavementParts,roadEdges,metersPerWorldUnit){
  const result=[],probe=.04/metersPerWorldUnit,maxReach=FRONTAGE_RULES.ordinaryReach/metersPerWorldUnit;
  const covers=pavementCoverageQuery(pavementParts);
  for(const polygon of buildingPolygons){
    const ring=polygon[0];if(!ring||ring.length<4)continue;
    const points=ring.slice(0,-1),[ox,oz]=points[0];let area=0;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=(a[0]-ox)*(b[1]-oz)-(b[0]-ox)*(a[1]-oz);}
    const orientation=Math.sign(area);if(!orientation)continue;
    for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
      const dx1=b[0]-a[0],dz1=b[1]-a[1],dx2=c[0]-b[0],dz2=c[1]-b[1],l1=Math.hypot(dx1,dz1),l2=Math.hypot(dx2,dz2);
      if(l1<probe*4||l2<probe*4||(dx1*dz2-dz1*dx2)*orientation<=1e-8)continue;
      const n1={x:orientation*dz1/l1,z:-orientation*dx1/l1},n2={x:orientation*dz2/l2,z:-orientation*dx2/l2},corner={x:b[0],z:b[1]};
      const beside1={x:b[0]-dx1/l1*probe+n1.x*probe,z:b[1]-dz1/l1*probe+n1.z*probe};
      const beside2={x:b[0]+dx2/l2*probe+n2.x*probe,z:b[1]+dz2/l2*probe+n2.z*probe};
      if(!covers(beside1)||!covers(beside2))continue;
      const first=frontageHit(corner,n1.x,n1.z,roadEdges,probe,maxReach),second=frontageHit(corner,n2.x,n2.z,roadEdges,probe,maxReach);
      if(!first||!second)continue;
      const determinant=n1.x*n2.z-n1.z*n2.x;if(Math.abs(determinant)<1e-8)continue;
      const rx=(first.distance*n2.z-n1.z*second.distance)/determinant,rz=(n1.x*second.distance-first.distance*n2.x)/determinant;
      // Extremely acute, unsupported corners need an explicit design rather
      // than a long inferred miter into an unrelated part of the block.
      if(Math.hypot(rx,rz)>2*Math.max(first.distance,second.distance))continue;
      result.push([[b,[b[0]+n1.x*first.distance,b[1]+n1.z*first.distance],[b[0]+rx,b[1]+rz],[b[0]+n2.x*second.distance,b[1]+n2.z*second.distance],b]]);
    }
  }
  return result;
}
