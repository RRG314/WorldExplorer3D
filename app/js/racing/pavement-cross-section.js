import {PROFILED_ROAD_PAVEMENT_MODEL} from '../physics/road-plane-dynamics.js';

// The course owns these immutable, qualified triangle observations. This reader
// adds no height field, source line, actor state or runtime cache.
function station(segment,t){
 const rows=segment.heightSamples,range=segment.heightSampleRange;
 if(range)t=range.start+(range.end-range.start)*Math.max(0,Math.min(1,t));
 let lo=0,hi=rows.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid].t<t)lo=mid;else hi=mid;}
 const a=rows[lo],b=rows[hi],u=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)));return {a,b,u};
}
export function racePavementLateralOffsets(segment,t){
 if(segment.pavementModel!==PROFILED_ROAD_PAVEMENT_MODEL)return null;
 const {a,b,u}=station(segment,t);return a.lateralSamples.map((p,i)=>p.offsetMeters+(b.lateralSamples[i].offsetMeters-p.offsetMeters)*u);
}
export function racePavementCrossSection(segment,t){
 if(segment.pavementModel!==PROFILED_ROAD_PAVEMENT_MODEL)return null;
 const {a,b,u}=station(segment,t),mix=(x,y)=>x+(y-x)*u;
 return {minimumMeters:mix(a.lateralSamples[0].offsetMeters,b.lateralSamples[0].offsetMeters),
  maximumMeters:mix(a.lateralSamples.at(-1).offsetMeters,b.lateralSamples.at(-1).offsetMeters),
  racingOffsetMeters:mix(a.racingOffsetMeters,b.racingOffsetMeters),racingWidthMeters:segment.racingWidthMeters};
}
