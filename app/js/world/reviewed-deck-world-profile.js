// Convert reviewed geographic deck observations once, at road compilation.
// Rendering, support, contacts and approaches then use the shared packed model.
import {roadPavementSectionsInWorld} from './road-pavement-sections.js';
export function reviewedDeckSurveyInWorld(survey,points,{geoToWorld,heightToWorld,metersPerWorldUnit}={}){
 if(survey?.sourcePavementSections){
  if(survey.geographicDeckProfile||survey.geographicPavementProfile)throw Error('reviewed_surface_profile_conflict');
  const {sourcePavementSections,...evidence}=survey;return Object.freeze({...evidence,pavementSections:roadPavementSectionsInWorld(sourcePavementSections,points,metersPerWorldUnit,{geoToWorld})});
 }
 const deck=survey?.geographicDeckProfile||survey?.geographicPavementProfile;if(!deck)return survey;
 if(survey.geographicDeckProfile&&survey.geographicPavementProfile)throw Error('reviewed_surface_profile_conflict');
 if(typeof geoToWorld!=='function'||typeof heightToWorld!=='function'||points?.length<2)throw Error('reviewed_deck_world_frame_missing');
 const distances=[0];
 for(let i=1;i<points.length;i++){const length=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);if(!(length>1e-6))throw Error('reviewed_deck_source_path_changed');distances.push(distances.at(-1)+length);}
 const samples=deck.samples.map(row=>{
  const index=row.sourceSegment,a=points[index],b=points[index+1];
  if(!a||!b||!Number.isFinite(row.fraction)||row.fraction<0||row.fraction>1)throw Error('reviewed_deck_source_path_changed');
  const center=geoToWorld(row.latitude,row.longitude),positive=geoToWorld(row.positiveNormal.latitude,row.positiveNormal.longitude),length=distances[index+1]-distances[index];
  const x=a.x+(b.x-a.x)*row.fraction,z=a.z+(b.z-a.z)*row.fraction;
  if(![center?.x,center?.z,positive?.x,positive?.z].every(Number.isFinite)||Math.hypot(center.x-x,center.z-z)>.02)throw Error('reviewed_deck_source_path_changed');
  const normalX=-(b.z-a.z)/length,normalZ=(b.x-a.x)/length,lateral=(positive.x-center.x)*normalX+(positive.z-center.z)*normalZ;
  const centerY=heightToWorld(row.heightMetersEgm2008),positiveY=heightToWorld(row.positiveNormal.heightMetersEgm2008);
  if(![centerY,positiveY,lateral].every(Number.isFinite)||Math.abs(lateral)<.1)throw Error('reviewed_deck_world_frame_invalid');
  return Object.freeze({t:(distances[index]+row.fraction*length)/distances.at(-1),centerY,crossfall:(positiveY-centerY)/lateral});
 });
 const {geographicDeckProfile,geographicPavementProfile,...evidence}=survey;
 const profile=Object.freeze({version:1,coordinateFrame:'world',contentSha256:deck.contentSha256,
  observedCoreWidthMeters:deck.observedCoreWidthMeters,reconstructedWidthMeters:deck.reconstructedWidthMeters,
  ...(geographicPavementProfile?{maximumAdjustmentMeters:deck.maximumAdjustmentMeters,reconstructedSpans:deck.reconstructedSpans}:{}),samples:Object.freeze(samples)});
 return Object.freeze({...evidence,...(geographicPavementProfile?{pavementProfile:profile}:{deckProfile:profile})});
}
