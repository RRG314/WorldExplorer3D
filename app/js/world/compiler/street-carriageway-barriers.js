import {isGroundStreet} from './street-frontage-policy.js';
import {streetRoadSegments,carriagewaySegmentPolygon,carriagewayJoinPolygons} from './street-carriageway.js';
import {roadWidthAtSegment} from '../road-cross-section-profile.js?v=1';
import {roadPlacementOffsetWorld} from '../road-units.js';

// Visibility barriers consume the same footprint primitives as rendering and
// pavement subtraction. There is no second width-refinement algorithm here.
export function createStreetCarriagewayBarriers(roads=[]) {
  const buckets=new Map(),cell=64,chunkSize=4096;
  const chunks=[],owners=[],views=new Map();
  let edgeCount=0;
  const candidates=(point,reach,exclude)=>{
    const found=new Set();
    for(let x=Math.floor((point.x-reach)/cell);x<=Math.floor((point.x+reach)/cell);x++)
      for(let z=Math.floor((point.z-reach)/cell);z<=Math.floor((point.z+reach)/cell);z++)
        for(const id of buckets.get(`${x}:${z}`)||[]) {
          const chunk=chunks[Math.floor(id/chunkSize)],offset=id%chunkSize;
          if(owners[chunk.owners[offset]]!==exclude)found.add(id);
        }
    return found;
  };
  const insert=(polygon,owner)=>{
    for(const ring of polygon)for(let i=1;i<ring.length;i++){
      // Float64 keeps the exact footprint coordinates used by ray tests. Only
      // queried edges need point objects; the full city retains numeric buffers.
      const ax=ring[i-1][0],az=ring[i-1][1],bx=ring[i][0],bz=ring[i][1];
      const id=edgeCount++,offset=id%chunkSize;
      if(offset===0)chunks.push({positions:new Float64Array(chunkSize*4),owners:new Uint32Array(chunkSize)});
      const chunk=chunks[chunks.length-1];
      chunk.positions.set([ax,az,bx,bz],offset*4);chunk.owners[offset]=owner;
      for(let x=Math.floor(Math.min(ax,bx)/cell);x<=Math.floor(Math.max(ax,bx)/cell);x++)
        for(let z=Math.floor(Math.min(az,bz)/cell);z<=Math.floor(Math.max(az,bz)/cell);z++){
          const k=`${x}:${z}`;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);
        }
    }
  };
  for(const road of roads){
    if(!isGroundStreet(road))continue;
    const owner=owners.length;owners.push(road);
    for(const segment of streetRoadSegments(road)){
      const polygon=carriagewaySegmentPolygon(segment);if(polygon)insert(polygon,owner);
    }
    for(let i=1;i<(road.pts?.length||0)-1;i++){
      const join={road,previous:road.pts[i-1],point:road.pts[i],next:road.pts[i+1],halfWidth:roadWidthAtSegment(road,i,0)/2,offset:roadPlacementOffsetWorld(road)};
      for(const polygon of carriagewayJoinPolygons(join))insert(polygon,owner);
    }
  }
  return {
    query(point,reach,exclude){
      return [...candidates(point,reach,exclude)].map(id=>{
        // Pavement cells deduplicate shared edges by identity. Materialize a
        // stable view only for consumers that need geometry objects; terrain
        // grading uses blocksRay directly and retains none of these views.
        if(!views.has(id)) {
          const chunk=chunks[Math.floor(id/chunkSize)],offset=id%chunkSize,p=chunk.positions,i=offset*4;
          views.set(id,{a:{x:p[i],z:p[i+1]},b:{x:p[i+2],z:p[i+3]},road:owners[chunk.owners[offset]]});
        }
        return views.get(id);
      });
    },
    blocksRay(point,nx,nz,distance,exclude){
      for(const id of candidates(point,distance,exclude)){
        const chunk=chunks[Math.floor(id/chunkSize)],i=(id%chunkSize)*4,p=chunk.positions;
        if(edgeBlocksRay(point,nx,nz,distance,p[i],p[i+1],p[i+2],p[i+3]))return true;
      }
      return false;
    },
    stats(){return {edges:edgeCount,bufferBytes:chunks.reduce((n,c)=>n+c.positions.byteLength+c.owners.byteLength,0),cells:buckets.size};},
    dispose(){buckets.clear();views.clear();chunks.length=0;owners.length=0;edgeCount=0;}
  };
}

function edgeBlocksRay(point,nx,nz,distance,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,den=nx*dz-nz*dx;
  if(Math.abs(den)<1e-10)return false;
  const x=ax-point.x,z=az-point.z;
  const ray=(x*dz-z*dx)/den,t=(x*nz-z*nx)/den;
  return ray>1e-6&&ray<distance-1e-6&&t>=-1e-7&&t<=1+1e-7;
}

export function frontageBlocked(point,nx,nz,distance,barriers,exclude){
  for(const {a,b,road} of barriers){
    if(exclude && road===exclude)continue;
    if(edgeBlocksRay(point,nx,nz,distance,a.x,a.z,b.x,b.z))return true;
  }
  return false;
}
