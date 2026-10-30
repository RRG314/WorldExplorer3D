// Shared by native ground refinement and its existing road grading pass.
export const REVIEWED_CORRIDOR_INNER_SPACING_METERS=3;
export const REVIEWED_CORRIDOR_OUTER_SPACING_METERS=8;
export const REVIEWED_CORRIDOR_INNER_MARGIN_METERS=8;
export const REVIEWED_CORRIDOR_OUTER_MARGIN_METERS=40;
export const REVIEWED_PAVEMENT_BOUNDARY_POLICY='fitted-pavement-boundary-v1';
export function hasReviewedPavementBoundary(feature){
 const model=feature?.transportSurfaceModel,survey=model?.surveyedSurface,evidence=feature?.surfaceSurveyEvidence;
 return !!(model?.reviewedSurfacePhase==='accepted'&&survey?.surfaceModel==='banked-road-v1'&&survey.terrainEdgePolicy===REVIEWED_PAVEMENT_BOUNDARY_POLICY&&
  evidence?.terrainEdgePolicy===REVIEWED_PAVEMENT_BOUNDARY_POLICY&&survey.venueSource&&survey.venueSource===evidence.venueSource&&survey.sourceFeatureId===feature.sourceFeatureId&&[...survey.venueSource.sourceFeatureIds,...(survey.venueSource.pitSourceFeatureIds||[])].includes(feature.sourceFeatureId));
}
// Detailed source tiles halve to about 3.04 m at this venue. A 3.1 m ceiling
// avoids another fourfold subdivision merely to remove centimetres of spacing.
export const REVIEWED_DETAIL_MAXIMUM_SPACING_METERS=3.1;
export const REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES=196608;
export const REVIEWED_CORRIDOR_SUPPORT_METERS=REVIEWED_DETAIL_MAXIMUM_SPACING_METERS*Math.SQRT2;

export function reviewedTerrainCorridors(context,{includeLandscape=false}={}){
 const runtime=context.worldLoadRuntimeState,pack=runtime?.venuePack,venue=pack?.venueSource;
 if(!venue||runtime.sequence!==context._worldLoadSequence)return null;
 const selected=new Set([...venue.sourceFeatureIds,...(venue.pitSourceFeatureIds||[])]),roads=(context.roads||[]).filter(r=>selected.has(r.sourceFeatureId));
 if(roads.length!==selected.size||roads.some(r=>r.surfaceSurveyEvidence?.venueSource!==venue||r.transportSurfaceModel?.surveyedSurface?.venueSource!==venue||r.transportSurfaceModel.reviewedSurfacePhase!=='accepted'))throw Error('reviewed_terrain_source_unavailable');
 const scale=Number(context.WORLD_UNITS_PER_METER)||1,segments=[],landscape=includeLandscape?pack.landscapeRefinement:null;
 for(const road of roads){
  if(road.structureSemantics?.terrainMode!=='at_grade')continue;
  const half=road.transportRecord?.crossSection?.pavementSections?.maximumExtent??road.width*.5;
  for(let i=1;i<road.pts.length;i++)segments.push({a:road.pts[i-1],b:road.pts[i],innerRadius:half+REVIEWED_CORRIDOR_INNER_MARGIN_METERS*scale,outerRadius:half+REVIEWED_CORRIDOR_OUTER_MARGIN_METERS*scale,...(landscape?{landscapeRadius:landscape.radiusMeters*scale}:{})});
 }
 return {runtime,pack,venue,scale,segments};
}
