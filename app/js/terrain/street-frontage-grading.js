import { frontageHit } from '../world/compiler/street-frontage-geometry.js';
import { resolveStreetSection } from '../world/compiler/street-section.js';

// The frontage search shares the pavement compiler's ray/occlusion rules.
// Retain building references in spatial buckets, not a duplicate city mesh.
export function createStreetFrontageGrading(buildings = [], metersPerWorldUnit = 1) {
  const scale = Number.isFinite(metersPerWorldUnit) && metersPerWorldUnit > 0 ? metersPerWorldUnit : 1;
  const buckets = new Map(), corners = new Map(), attached = new WeakSet();
  const ring = b => b.surfaceFootprint || b.pts || b.footprint || [];
  const key = p => `${Math.round(p.x*10)}:${Math.round(p.z*10)}`;
  for (const b of buildings) if (!b.allowsPassageBelow) for (const k of new Set(ring(b).map(key))) corners.set(k,(corners.get(k)||0)+1);
  for (const b of buildings) {
    if (b.allowsPassageBelow) continue;
    const pts=ring(b); if(pts.length<3)continue;
    if(pts.some(p=>corners.get(key(p))>1))attached.add(b);
    const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
    for(let ix=Math.floor(minX/64);ix<=Math.floor(maxX/64);ix++)for(let iz=Math.floor(minZ/64);iz<=Math.floor(maxZ/64);iz++){
      const k=`${ix}:${iz}`; if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(b);
    }
  }
  corners.clear();
  const cache=new Map();
  let sampleCount=0;
  return {
    outerDistance(road,projection,x,z,halfWidth) {
      const a=road.pts[projection.segIndex],b=road.pts[projection.segIndex+1];
      if(!a||!b)return halfWidth;
      const length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)return halfWidth;
      const px=a.x+(b.x-a.x)*projection.t,pz=a.z+(b.z-a.z)*projection.t;
      const nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length,sign=(x-px)*nx+(z-pz)*nz>=0?1:-1;
      // Exact coordinates avoid quantization steps on a continuous grade.
      let roadCache=cache.get(road);if(!roadCache&&sampleCount<20000){roadCache=new Map();cache.set(road,roadCache);}
      const cacheKey=`${px}:${pz}:${halfWidth}:${sign}`;
      if(roadCache?.has(cacheKey))return roadCache.get(cacheKey);
      const reach=halfWidth+44/scale,seen=new Set(),edges=[];
      for(let ix=Math.floor((px-reach)/64);ix<=Math.floor((px+reach)/64);ix++)for(let iz=Math.floor((pz-reach)/64);iz<=Math.floor((pz+reach)/64);iz++)for(const building of buckets.get(`${ix}:${iz}`)||[]){
        if(seen.has(building))continue;seen.add(building);const pts=ring(building);
        for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];if(Math.hypot(b.x-a.x,b.z-a.z)<3)continue;
          if(Math.min(a.x,b.x)>px+reach||Math.max(a.x,b.x)<px-reach||Math.min(a.z,b.z)>pz+reach||Math.max(a.z,b.z)<pz-reach)continue;
          edges.push({a,b,extendedFrontage:attached.has(building)?24/scale:0});}
      }
      const tags=road.transportRecord?.sourceTags||road.tags||{};
      const section=resolveStreetSection({...tags,highway:tags.highway||road.type},{urban:edges.length>0})[sign>0?'left':'right'];
      let outer=halfWidth;
      if(section.presence==='present'){
        outer+=section.widthMeters/scale;
        const hit=frontageHit({x:px,z:pz},nx*sign,nz*sign,edges,outer,halfWidth+7/scale);
        if(hit)outer=hit.distance;
      }
      // This cache is local to one terrain publication; bound long source roads.
      if(roadCache && roadCache.size<256 && sampleCount<20000){roadCache.set(cacheKey,outer);sampleCount++;}
      return outer;
    },
    clearSamples(){cache.clear();sampleCount=0;},
    dispose(){cache.clear();buckets.clear();sampleCount=0;}
  };
}
