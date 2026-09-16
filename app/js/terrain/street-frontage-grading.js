import {createStreetCarriagewayBarriers,frontageBlocked} from '../world/compiler/street-carriageway-barriers.js';
import { frontageHit } from '../world/compiler/street-frontage-geometry.js';
import { createStreetFrontagePolicy, streetScale, streetSideEdge, FRONTAGE_RULES } from '../world/compiler/street-frontage-policy.js';

// The frontage search shares the pavement compiler's ray/occlusion rules.
// Retain building references in spatial buckets, not a duplicate city mesh.
export function createStreetFrontageGrading(buildings = [], metersPerWorldUnit = 1, roads = []) {
  const scale = streetScale(metersPerWorldUnit);
  const policy = createStreetFrontagePolicy(buildings, scale);
  const barriers=createStreetCarriagewayBarriers(roads);
  const cache=new Map();
  let sampleCount=0;
  const stats={queries:0,outsideInfluence:0};
  function outerDistance(road,projection,x,z,halfWidth,shoulderBlend=null) {
      const a=road.pts[projection.segIndex],b=road.pts[projection.segIndex+1];
      if(!a||!b)return halfWidth;
      const length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)return halfWidth;
      const px=a.x+(b.x-a.x)*projection.t,pz=a.z+(b.z-a.z)*projection.t;
      const nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length,sign=(x-px)*nx+(z-pz)*nz>=0?1:-1;
      // Exact coordinates avoid quantization steps on a continuous grade.
      let roadCache=cache.get(road);if(!roadCache&&sampleCount<20000){roadCache=new Map();cache.set(road,roadCache);}
      const cacheKey=`${px}:${pz}:${halfWidth}:${sign}`;
      if(roadCache?.has(cacheKey))return roadCache.get(cacheKey);
      const section=policy.section(road,projection.segIndex)[sign>0?'left':'right'];
      const edge=streetSideEdge(road,halfWidth,sign);
      let outer=edge;
      if(section.presence==='present')outer+=section.widthMeters/scale;
      // A spatial bucket is deliberately broader than the physical influence.
      // Reject only beyond every legal facade reach, including attached rows
      // and explicitly wide sidewalks, before the expensive per-point raycast.
      const maximum=section.presence==='present' ? Math.max(edge+FRONTAGE_RULES.ordinaryReach/scale,outer+FRONTAGE_RULES.attachedReach/scale) : outer;
      if(Number.isFinite(shoulderBlend)&&Number.isFinite(projection.dist)&&projection.dist>maximum+shoulderBlend+1e-7){stats.outsideInfluence++;return null;}
      if(section.presence==='present'){
        const reach=halfWidth+44/scale;
        stats.queries++;
        const edges=policy.query({x:px,z:pz},undefined,reach);
        const hit=frontageHit({x:px,z:pz},nx*sign,nz*sign,edges,outer,edge+FRONTAGE_RULES.ordinaryReach/scale);
        if(hit && !frontageBlocked({x:px,z:pz},nx*sign,nz*sign,hit.distance,barriers.query({x:px,z:pz},hit.distance,road)))outer=hit.distance;
      }
      // This cache is local to one terrain publication; bound long source roads.
      if(roadCache && roadCache.size<256 && sampleCount<20000){roadCache.set(cacheKey,outer);sampleCount++;}
      return outer;
  }
  return {
    outerDistance:(road,projection,x,z,halfWidth)=>outerDistance(road,projection,x,z,halfWidth),
    influenceOuterDistance:outerDistance,
    stats:()=>({...stats}),
    clearSamples(){cache.clear();sampleCount=0;},
    dispose(){cache.clear();policy.dispose();barriers.dispose();sampleCount=0;}
  };
}
