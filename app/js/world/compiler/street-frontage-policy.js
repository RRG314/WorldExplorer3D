import {roadPlacementOffsetWorld} from '../road-units.js';
import { resolveStreetSection } from './street-section.js';

// Policy dimensions are metres. Road widths passed to geometry are world
// coordinates; source placement is converted through the shared unit adapter.
export const FRONTAGE_RULES = Object.freeze({ minimumFacade: 3, urbanReach: 20, ordinaryReach: 7 });
export const isGroundStreet = feature => !feature.isStructureConnector &&
  ['at_grade', undefined].includes(feature.structureSemantics?.terrainMode) &&
  !feature.structureSemantics?.gradeSeparated && !feature.structureSemantics?.rampCandidate;
export function streetSideEdge(road, halfWidth, sign) {
  const offset = roadPlacementOffsetWorld(road);
  return Math.max(.3, halfWidth - sign * offset);
}
export function streetScale(value = 1.11) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Street metres per world unit must be finite and positive');
  return value;
}
export function streetScaleForWorld(world) {
  const direct = world.METERS_PER_WORLD_UNIT;
  const inverse = world.WORLD_UNITS_PER_METER;
  if (direct != null) return streetScale(Number(direct));
  if (inverse != null) return streetScale(1 / Number(inverse));
  return 1.11;
}
export function streetFootprint(building) {
  const pts = building.surfaceFootprint || building.pts || building.footprint || [];
  return !building.allowsPassageBelow && pts.length >= 3 && pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)) ? pts : [];
}
const bounds = (a,b) => ({ minX: Math.min(a.x,b.x), maxX: Math.max(a.x,b.x), minZ: Math.min(a.z,b.z), maxZ: Math.max(a.z,b.z) });
function pointSegment(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
  const t=l ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)) : 0;
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
function segmentDistance(a,b,c,d) {
  // Terrain frontage samples are points, not nonzero road segments. Their
  // distance needs one projection; the other three cannot be closer.
  if(a.x===b.x && a.z===b.z)return pointSegment(a,c,d);
  if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function pointSegmentSquared(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)) : 0;
  const x=p.x-a.x-dx*t,z=p.z-a.z-dz*t;
  return x*x+z*z;
}
function segmentWithinReach(a,b,c,d,reach) {
  if(a.x!==b.x || a.z!==b.z) {
    if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)return true;
  }
  const squared=a.x===b.x && a.z===b.z ? pointSegmentSquared(a,c,d) :
    Math.min(pointSegmentSquared(a,c,d),pointSegmentSquared(b,c,d),pointSegmentSquared(c,a,b),pointSegmentSquared(d,a,b));
  const limit=reach*reach;
  // Near the decision boundary, retain the original hypot calculation and
  // its rounding. Squared comparisons only reject/accept well-separated cases.
  if(reach<0 || !Number.isFinite(squared) || !Number.isFinite(limit) ||
    Math.abs(squared-limit)<=32*Number.EPSILON*Math.max(1,squared,limit))return segmentDistance(a,b,c,d)<=reach;
  return squared<limit;
}
export function createStreetFrontagePolicy(buildings = [], metersPerWorldUnit = 1.11, { retainEdges = true } = {}) {
  const scale=streetScale(metersPerWorldUnit), buckets=new Map();
  // Terrain owns a compiled snapshot, not a second object graph of every city
  // facade. The pavement compiler can still retain stable geometry identities.
  let edges=retainEdges ? [] : null, edgeCount=0;
  const pages=[], pageSize=4096;
  const scratchEdge=()=>({a:{x:0,z:0},b:{x:0,z:0},bounds:{minX:0,maxX:0,minZ:0,maxZ:0},facadeEligible:false});
  function readEdge(id,result) {
    if(edges)return edges[id];
    const page=pages[Math.floor(id/pageSize)],offset=id%pageSize,p=page.points,i=offset*4;
    result.a.x=p[i];result.a.z=p[i+1];result.b.x=p[i+2];result.b.z=p[i+3];
    result.bounds.minX=Math.min(p[i],p[i+2]);result.bounds.maxX=Math.max(p[i],p[i+2]);
    result.bounds.minZ=Math.min(p[i+1],p[i+3]);result.bounds.maxZ=Math.max(p[i+1],p[i+3]);
    result.facadeEligible=!!page.eligible[offset];
    return result;
  }
  const copyEdge=edge=>({a:{...edge.a},b:{...edge.b},bounds:{...edge.bounds},facadeEligible:edge.facadeEligible});
  let sections=new WeakMap();
  const candidateRegions=new Map(),sectionValues=new Map();
  const rings=buildings.map(streetFootprint);
  const cell=64/scale;
  for(const pts of rings){
    for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length];
      const length=Math.hypot(b.x-a.x,b.z-a.z)*scale;
      if(length<1e-8)continue;
      // Shared building vertices describe buildings, not public paving rights.
      // A plaza beyond the bounded street frontage needs a mapped area.
      const id=edgeCount++,box=bounds(a,b),facadeEligible=length>=FRONTAGE_RULES.minimumFacade-1e-8;
      if(edges)edges.push({a,b,bounds:box,facadeEligible});
      else {
        const offset=id%pageSize;
        if(offset===0)pages.push({points:new Float64Array(pageSize*4),eligible:new Uint8Array(pageSize)});
        const page=pages[pages.length-1],i=offset*4;
        page.points[i]=a.x;page.points[i+1]=a.z;page.points[i+2]=b.x;page.points[i+3]=b.z;
        page.eligible[offset]=facadeEligible ? 1 : 0;
      }
      for(let x=Math.floor(box.minX/cell);x<=Math.floor(box.maxX/cell);x++)for(let z=Math.floor(box.minZ/cell);z<=Math.floor(box.maxZ/cell);z++){
        const k=`${x}:${z}`;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);
      }
    }
  }
  function query(a,b=a,pad=0,facadeOnly=false){
    const box=bounds(a,b);
    const x0=Math.floor((box.minX-pad)/cell),x1=Math.floor((box.maxX+pad)/cell);
    const z0=Math.floor((box.minZ-pad)/cell),z1=Math.floor((box.maxZ+pad)/cell);
    const key=`${x0}:${x1}:${z0}:${z1}`;
    let candidates=candidateRegions.get(key);
    if(!candidates){
      const seen=new Set();
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const id of buckets.get(`${x}:${z}`)||[])seen.add(id);
      candidates=[...seen];
      // Neighboring terrain samples revisit the same buckets. Cache only
      // their ordered candidates, never an approximate distance/result.
      // Bound both region count and retained edge references for large cities.
      if(candidates.length<=2048){
        if(candidateRegions.size>=128)candidateRegions.delete(candidateRegions.keys().next().value);
        candidateRegions.set(key,candidates);
      }
    }
    const result=facadeOnly ? null : [],scratch=edges ? null : scratchEdge();
    // Bucket overlap is only a coarse candidate test. Reject disjoint edge
    // bounds before the exact projections, retaining a conservative roundoff
    // margin for translated coordinates and the existing distance tolerance.
    const reach=pad+1e-8+8*Number.EPSILON*Math.max(1,Math.abs(box.minX),Math.abs(box.maxX),Math.abs(box.minZ),Math.abs(box.maxZ),Math.abs(pad));
    for(const id of candidates){
      const edge=readEdge(id,scratch),eb=edge.bounds;
      if(eb.maxX<box.minX-reach || eb.minX>box.maxX+reach || eb.maxZ<box.minZ-reach || eb.minZ>box.maxZ+reach)continue;
      if(segmentWithinReach(a,b,edge.a,edge.b,pad+1e-8)){
        if(facadeOnly){if(edge.facadeEligible)return true;}
        else result.push(edges ? edge : copyEdge(edge));
      }
    }
    return facadeOnly ? false : result;
  }
  return {
    get edges(){
      // Geometry consumers opt in by asking for the full view. Terrain never
      // does; once materialized, identities are stable for compiler deduping.
      if(!edges){const all=[],scratch=scratchEdge();for(let id=0;id<edgeCount;id++)all.push(copyEdge(readEdge(id,scratch)));edges=all;pages.length=0;}
      return edges;
    },
    query,
    stats(){return {edgeCount,retainedEdgeObjects:edges?.length||0,numericBytes:pages.reduce((n,p)=>n+p.points.byteLength+p.eligible.byteLength,0)};},
    section(road,index=0){
      let cache=sections.get(road);if(!cache){cache=new Map();sections.set(road,cache);}if(cache.has(index))return cache.get(index);
      const a=road.pts?.[index],b=road.pts?.[index+1]||a;
      const urban=!!a && query(a,b,FRONTAGE_RULES.urbanReach/scale,true);
      const tags=road.transportRecord?.sourceTags||road.tags||{};
      let section=resolveStreetSection({...tags,highway:tags.highway||road.type},{urban});
      if (!isGroundStreet(road)) section=Object.freeze({...section,
        left:Object.freeze({...section.left,presence:'absent',source:'excluded-structure',widthMeters:null}),
        right:Object.freeze({...section.right,presence:'absent',source:'excluded-structure',widthMeters:null})});
      // Many sampled segments have exactly the same immutable semantic value.
      // Share that value instead of retaining three objects per segment. Key
      // the resolved evidence, not mutable road tags or an assumed revision.
      const valueKey=JSON.stringify(section),shared=sectionValues.get(valueKey);
      if(shared)section=shared;
      else {
        if(sectionValues.size>=128)sectionValues.delete(sectionValues.keys().next().value);
        sectionValues.set(valueKey,section);
      }
      cache.set(index,section);return section;
    },
    dispose(){if(edges)edges.length=0;pages.length=0;edgeCount=0;buckets.clear();candidateRegions.clear();sectionValues.clear();sections=new WeakMap();}
  };
}
