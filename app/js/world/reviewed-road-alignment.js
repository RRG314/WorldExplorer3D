// Preparation of an authored usable corridor inside a mapped pit apron. The
// pinned map is retained unchanged; terrain, junctions, meshes and contacts all
// receive the same compiled path. This owns no runtime pose or height state.
export function alignReviewedRoadPoints(points,survey,metersPerWorldUnit){
 const alignment=survey?.usableAlignment;
 if(!alignment)return points;
 const offsets=alignment.nodeOffsetsMeters;
 if(!(metersPerWorldUnit>0)||offsets?.length!==points.length||offsets[0]!==0||offsets.at(-1)!==0||
  offsets.some(n=>!Number.isFinite(n)||Math.abs(n)>4)||!survey.venueSource?.pitSourceFeatureIds?.includes(survey.sourceFeatureId))throw Error('reviewed_road_alignment_invalid');
 return points.map((p,i)=>{
  const offset=offsets[i];if(!offset)return p;
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],length=Math.hypot(b.x-a.x,b.z-a.z);
  if(!(length>0))throw Error('reviewed_road_alignment_invalid');
  return {...p,x:p.x-(b.z-a.z)/length*offset/metersPerWorldUnit,z:p.z+(b.x-a.x)/length*offset/metersPerWorldUnit};
 });
}
