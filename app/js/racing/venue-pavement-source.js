import {compileMappedVenueLayout,compileMappedVenuePitLayout} from './venue-layout.js';
import {validateRoadPavementSections} from '../world/road-pavement-sections.js';

// Verified source-load preparation shares the existing source lifetime. Neither
// provider tags nor JSON transport can confer this private review annotation.
const reviewedSections=Symbol('reviewed-venue-pavement-sections');
export function annotateReviewedVenuePavementSections(source,artifact,{descriptor,requiredArtifacts,contentSha256}){
 const fail=()=>{throw Error('venue_pavement_source_invalid');},layout=compileMappedVenueLayout(source),pit=compileMappedVenuePitLayout(source,descriptor,layout),selected=[...layout.wayIds,...(pit?.wayIds||[])],profiles=new Map();
 if(descriptor.pavementWidthPolicy!=='profiled'||artifact?.type!=='ReviewedVenuePavementSections'||artifact.version!==1||
  artifact.venueId!==descriptor.id||artifact.sourceSha256!==descriptor.sourceSha256||artifact.license!=='ODbL-1.0'||
  !/^[a-f0-9]{64}$/.test(contentSha256)||!artifact.interpretation||!/^https:\/\//.test(artifact.observation?.url)||
  !/^[a-f0-9]{64}$/.test(artifact.observation?.sha256)||!Array.isArray(artifact.profiles)||artifact.profiles.length!==selected.length||
  !Array.isArray(artifact.groundArtifacts)||artifact.groundArtifacts.length!==requiredArtifacts.length||
  requiredArtifacts.some(r=>!artifact.groundArtifacts.some(a=>a.artifactId===r.artifactId&&a.contentSha256===r.contentSha256)))fail();
 for(const record of artifact.profiles){
  const id=Number(record?.sourceFeatureId?.replace(/^osm:way:/,'')),way=layout.ways.get(id);
  if(!selected.includes(id)||record.sourceFeatureId!==`osm:way:${id}`||profiles.has(id)||record.sourceVersion!==way.version||record.observationSha256!==artifact.observation.sha256)fail();
  const profile=validateRoadPavementSections(record,{venueId:descriptor.id,sourceFeatureId:record.sourceFeatureId,sourceSha256:descriptor.sourceSha256,nodeIds:way.nodes});
  if(profile.samples.some(s=>s.positiveMeters+s.bankNegativeMeters<source.layout.usableWidthMeters))fail();
  profiles.set(id,profile);
 }
 // The selected loop already proves exact directed node continuity. Derive
 // endpoint transects from those same adjoining source spans, never pit roads
 // or proximity guesses. No source coordinate or observation is replaced.
 for(let i=0;i<layout.wayIds.length;i++){
  const id=layout.wayIds[i],previous=layout.ways.get(layout.wayIds[(i+layout.wayIds.length-1)%layout.wayIds.length]),next=layout.ways.get(layout.wayIds[(i+1)%layout.wayIds.length]);
  profiles.set(id,Object.freeze({...profiles.get(id),geographicContinuations:Object.freeze({start:Object.freeze({...previous.geometry.at(-2)}),end:Object.freeze({...next.geometry[1]})})}));
 }
 if(pit)for(let i=0;i<pit.wayIds.length;i++){
  const id=pit.wayIds[i],previous=i?layout.ways.get(pit.wayIds[i-1]).geometry.at(-2):pit.mainContinuations.start,next=i<pit.wayIds.length-1?layout.ways.get(pit.wayIds[i+1]).geometry[1]:pit.mainContinuations.end;
  profiles.set(id,Object.freeze({...profiles.get(id),geographicContinuations:Object.freeze({start:Object.freeze({...previous}),end:Object.freeze({...next})})}));
 }
 Object.defineProperty(source,reviewedSections,{value:Object.freeze({contentSha256,profiles}),enumerable:false});return source;
}
export function reviewedVenuePavementSections(source,descriptor,wayId){
 if(descriptor.pavementWidthPolicy!=='profiled')return null;
 const prepared=source?.[reviewedSections];
 if(!descriptor.reviewedPavementSections||prepared?.contentSha256!==descriptor.reviewedPavementSections.contentSha256)throw Error('venue_pavement_source_not_prepared');
 const profile=prepared.profiles.get(wayId);if(!profile)throw Error('venue_pavement_profile_unavailable');return profile;
}
