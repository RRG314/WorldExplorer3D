import {hasReviewedPavement} from '../world/compiler/reviewed-deck-profile.js';
import {indexPavementPositions} from '../world/pavement-indexed-mesh.js';

// Temporary compiler input from the actual Float32 ribbon. Only an exact
// shared source endpoint in the same accepted venue can request a sewn join.
// The meshes/contact index remain the published surface owners.
export function publishedPavementJoins(feature,vertices,indices,roads){
 const model=feature?.transportSurfaceModel,venue=model?.surveyedSurface?.venueSource;
 if(!hasReviewedPavement(feature)||model.reviewedSurfacePhase!=='accepted'||!Array.isArray(venue?.sourceFeatureIds)||feature.surfaceSurveyEvidence?.venueSource!==venue||feature.structureSemantics?.terrainMode!=='at_grade'||feature.sourceNodeIds?.length!==feature.pts?.length)return [];
 const result=[],positions=Float32Array.from(vertices);
 for(const endpoint of [0,feature.pts.length-1]){
  const node=feature.sourceNodeIds[endpoint],point=feature.pts[endpoint],neighbors=[];
  for(const road of roads){
   const m=road.transportSurfaceModel,v=m?.surveyedSurface?.venueSource;
   if(road===feature||m?.reviewedSurfacePhase!=='accepted'||m.engineeredApproach||hasReviewedPavement(road)||road.structureSemantics?.terrainMode!=='at_grade'||v!==venue||road.surfaceSurveyEvidence?.venueSource!==venue||!venue.sourceFeatureIds.includes(road.sourceFeatureId)||road.sourceNodeIds?.length!==road.pts?.length)continue;
   if([0,road.pts.length-1].some(i=>road.sourceNodeIds[i]===node&&Math.hypot(road.pts[i].x-point.x,road.pts[i].z-point.z)<1e-6))neighbors.push(road.sourceFeatureId);
  }
  if(!neighbors.length)continue;
  const radius=Math.max(4,Number(feature.width)||0)*2,triangles=[];
  for(let i=0;i<indices.length;i+=3){
   const ids=[indices[i],indices[i+1],indices[i+2]];
   if(!ids.some(j=>Math.hypot(positions[j*3]-point.x,positions[j*3+2]-point.z)<=radius))continue;
   for(const j of ids)triangles.push(positions[j*3],positions[j*3+1],positions[j*3+2]);
  }
  if(triangles.length/3>16384)throw Error('pavement_join_capacity');
  if(triangles.length)result.push({...indexPavementPositions(triangles),neighbors,metersPerWorldUnit:Number(feature.metersPerWorldUnit)||1});
 }
 return result;
}
