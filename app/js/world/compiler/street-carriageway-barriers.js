import {isGroundStreet} from './street-frontage-policy.js';
import {streetRoadSegments,carriagewaySegmentPolygon,carriagewayJoinPolygons} from './street-carriageway.js';
import {roadWidthAtSegment} from '../road-cross-section-profile.js?v=1';
import {roadPlacementOffsetWorld} from '../road-units.js';

// Visibility barriers consume the same footprint primitives as rendering and
// pavement subtraction. There is no second width-refinement algorithm here.
export function createStreetCarriagewayBarriers(roads=[]) {
  const buckets=new Map(),cell=64;
  const insert=(polygon,road)=>{
    for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const edge={a:{x:ring[i-1][0],z:ring[i-1][1]},b:{x:ring[i][0],z:ring[i][1]},road};
      for(let x=Math.floor(Math.min(edge.a.x,edge.b.x)/cell);x<=Math.floor(Math.max(edge.a.x,edge.b.x)/cell);x++)for(let z=Math.floor(Math.min(edge.a.z,edge.b.z)/cell);z<=Math.floor(Math.max(edge.a.z,edge.b.z)/cell);z++){
        const k=`${x}:${z}`;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(edge);
      }
    }
  };
  for(const road of roads){
    if(!isGroundStreet(road))continue;
    for(const segment of streetRoadSegments(road)){
      const polygon=carriagewaySegmentPolygon(segment);if(polygon)insert(polygon,road);
    }
    for(let i=1;i<(road.pts?.length||0)-1;i++){
      const join={road,previous:road.pts[i-1],point:road.pts[i],next:road.pts[i+1],halfWidth:roadWidthAtSegment(road,i,0)/2,offset:roadPlacementOffsetWorld(road)};
      for(const polygon of carriagewayJoinPolygons(join))insert(polygon,road);
    }
  }
  return {query(point,reach,exclude){const found=new Set();
    for(let x=Math.floor((point.x-reach)/cell);x<=Math.floor((point.x+reach)/cell);x++)for(let z=Math.floor((point.z-reach)/cell);z<=Math.floor((point.z+reach)/cell);z++)for(const edge of buckets.get(`${x}:${z}`)||[])if(edge.road!==exclude)found.add(edge);
    return [...found];
  },dispose(){buckets.clear();}};
}
export function frontageBlocked(point,nx,nz,distance,barriers,exclude){
  for(const {a,b,road} of barriers){
    if(exclude && road===exclude)continue;
    const dx=b.x-a.x,dz=b.z-a.z,den=nx*dz-nz*dx;
    if(Math.abs(den)<1e-10)continue;
    const ax=a.x-point.x,az=a.z-point.z;
    const ray=(ax*dz-az*dx)/den,t=(ax*nz-az*nx)/den;
    if(ray>1e-6&&ray<distance-1e-6&&t>=-1e-7&&t<=1+1e-7)return true;
  }
  return false;
}
