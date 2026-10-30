import {hasReviewedPavement} from '../world/compiler/reviewed-deck-profile.js';
import {roadWidthAtSegment} from '../world/road-cross-section-profile.js?v=1';
import {roadPlacementOffsetWorld} from '../world/road-units.js';

// Exact degree-two source continuations reuse the existing swept road corner.
// No proximity alias, navigation node, source point or height is introduced.
export function reviewedRoadContinuations(roads,venue){
 const result=new Map();if(!Array.isArray(venue?.sourceFeatureIds))return result;
 const selected=new Set(venue.sourceFeatureIds),nodes=new Map();
 for(const road of roads){
  const model=road.transportSurfaceModel;
  if(!selected.has(road.sourceFeatureId)||model?.reviewedSurfacePhase!=='accepted'||model.surveyedSurface?.venueSource!==venue||road.surfaceSurveyEvidence?.venueSource!==venue||road.structureSemantics?.terrainMode!=='at_grade'||road.sourceNodeIds?.length!==road.pts?.length||road.pts.length<2)continue;
  for(const index of [0,road.pts.length-1]){
   const id=road.sourceNodeIds[index];if(id===undefined||id===null)continue;
   if(!nodes.has(id))nodes.set(id,[]);nodes.get(id).push({road,index});
  }
 }
 const ordinary=entry=>!entry.road.transportSurfaceModel.engineeredApproach&&!hasReviewedPavement(entry.road);
 for(const entries of nodes.values()){
  if(entries.length!==2||!entries.some(ordinary))continue;
  entries.sort((a,b)=>Number(ordinary(b))-Number(ordinary(a))||a.road.sourceFeatureId.localeCompare(b.road.sourceFeatureId)||a.index-b.index);
  const [a,b]=entries,point=a.road.pts[a.index],other=b.road.pts[b.index];
  if(Math.hypot(point.x-other.x,point.z-other.z)>1e-6)continue;
  const width=entry=>roadWidthAtSegment(entry.road,entry.index===0?0:entry.index-1,entry.index===0?0:1)/2,
   inside=entry=>entry.road.pts[entry.index===0?1:entry.index-1];
  const join={previous:inside(a),point,next:inside(b),halfWidth:width(a),nextHalfWidth:width(b),
   offset:roadPlacementOffsetWorld(a.road,a.index===0?0:a.index-1,a.index===0?0:1)*(a.index===0?-1:1),nextOffset:roadPlacementOffsetWorld(b.road,b.index===0?0:b.index-1,b.index===0?0:1)*(b.index===0?1:-1),
   minimumTurnRadians:0,pavementContinuation:true};
  if(!result.has(a.road))result.set(a.road,[]);result.get(a.road).push(join);
 }
 return result;
}
