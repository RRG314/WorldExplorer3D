import {prepareCarriagewayTiles,carriagewaySegmentPolygon,carriagewayJoinPolygons} from '../world/compiler/street-carriageway.js';
import {reviewedRoadContinuations} from './reviewed-road-continuations.js';
import {REVIEWED_PAVEMENT_BOUNDARY_POLICY,hasReviewedPavementBoundary} from './reviewed-corridor-policy.js';

const area=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a.x*b.z-a.z*b.x;},0)/2;
function halfPlane(ring,a,b,sign){
 const out=[],distance=p=>sign*((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x));
 for(let i=0;i<ring.length;i++){
  const p=ring[i],q=ring[(i+1)%ring.length],u=distance(p),v=distance(q),inside=u>=0,next=v>=0;
  if(inside)out.push(p);
  if(inside!==next){const t=u/(u-v);out.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
 }
 return out.filter((p,i)=>Math.hypot(p.x-out[(i+out.length-1)%out.length].x,p.z-out[(i+out.length-1)%out.length].z)>1e-9);
}
function carve(ring,footprint){
 let inside=ring;const outside=[],sign=Math.sign(area(footprint));
 for(let i=0;i<footprint.length&&inside.length>=3;i++){
  const a=footprint[i],b=footprint[(i+1)%footprint.length],rest=halfPlane(inside,a,b,-sign);
  if(rest.length>=3&&Math.abs(area(rest))>1e-10)outside.push(rest);
  inside=halfPlane(inside,a,b,sign);
 }
 return {inside:inside.length>=3&&Math.abs(area(inside))>1e-10?inside:null,outside};
}
const bounds=ring=>({minX:Math.min(...ring.map(p=>p.x)),maxX:Math.max(...ring.map(p=>p.x)),minZ:Math.min(...ring.map(p=>p.z)),maxZ:Math.max(...ring.map(p=>p.z))});
const overlap=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;

export function reviewedRoadBoundaryPartition(context){
 const pack=context.worldLoadRuntimeState?.venuePack,venue=pack?.venueSource;if(pack?.terrainEdgePolicy===undefined)return null;
 if(pack.terrainEdgePolicy!==REVIEWED_PAVEMENT_BOUNDARY_POLICY||!venue)throw Error('reviewed_terrain_boundary_policy_invalid');
 const selected=new Set(venue.sourceFeatureIds),roads=(context.roads||[]).filter(r=>selected.has(r.sourceFeatureId));
 if(roads.length!==selected.size||roads.some(r=>!hasReviewedPavementBoundary(r)||r.surfaceSurveyEvidence.venueSource!==venue))throw Error('reviewed_terrain_boundary_source_unavailable');
 return createRoadBoundaryPartition(roads,venue);
}

// Temporary topology input for the existing terrain compiler. The exact same
// convex swept road pieces define the pavement boundary; no height is stored.
export function createRoadBoundaryPartition(roads,venue){
 const joins=reviewedRoadContinuations(roads,venue),tiles=prepareCarriagewayTiles(roads.map(r=>({...r,endpointContinuations:joins.get(r)}))),index=new Map(),cache=new Map();
 const pieces=(item,join)=>{
  if(!cache.has(item))cache.set(item,(join?carriagewayJoinPolygons(item):[carriagewaySegmentPolygon(item)]).filter(Boolean).map(p=>{
   const ring=p[0].slice(0,-1).map(([x,z])=>({x,z}));return {ring,bounds:bounds(ring)};
  }));return cache.get(item);
 };
 for(const tile of tiles)index.set(tile.key,[...tile.segments.flatMap(s=>pieces(s,false)),...tile.joins.flatMap(j=>pieces(j,true))]);
 return triangle=>{
  const b=bounds(triangle),candidates=new Set();
  for(let x=Math.floor(b.minX/128);x<=Math.floor(b.maxX/128);x++)for(let z=Math.floor(b.minZ/128);z<=Math.floor(b.maxZ/128);z++)for(const p of index.get(`${x}:${z}`)||[])if(overlap(b,p.bounds))candidates.add(p);
  if(!candidates.size)return [triangle];
  let remaining=[triangle];const inside=[];
  for(const p of candidates){const next=[];for(const piece of remaining){
   if(!overlap(bounds(piece),p.bounds)){next.push(piece);continue;}
   const split=carve(piece,p.ring);if(split.inside)inside.push(split.inside);next.push(...split.outside);
  }remaining=next;if(remaining.length+inside.length>128)throw Error('reviewed_terrain_boundary_capacity');}
  const triangles=[];for(const piece of [...inside,...remaining])for(let i=2;i<piece.length;i++){const t=[piece[0],piece[i-1],piece[i]];if(Math.abs(area(t))>1e-10)triangles.push(t);}
  return triangles;
 };
}
