// Private annotation on a prepared source object. Provider tags and cached JSON
// cannot opt themselves into surveyed cross-sections. This is source metadata,
// consumed once by the existing transport compiler, not a runtime height store.
import {sampleRoadPavementSection} from './road-pavement-sections.js';
import {raceVenueContainsInterval} from '../racing/venue-course-policy.js';
const surveyKey=Symbol('reviewed-road-source-survey');
const stageKey=Symbol('reviewed-stage-source-intervals');
export function annotateRoadSourceSurvey(way,evidence){
 Object.defineProperty(way,surveyKey,{value:Object.freeze({...evidence}),enumerable:false});
 return way;
}
export function roadSourceSurvey(way){return way?.[surveyKey]||null;}
// This capability is created only by reviewed source compilation. Serializing
// source tags, a cached road or a transport record cannot retain it. A public
// road outside the selected intervals keeps its original access/width fence.
export function reviewedStageDrivingInterval(feature,segmentIndex,startT=0,endT=1){
 const proof=feature?.transportRecord?.[stageKey];
 if(!proof)return feature?.transportRecord?.access?.motorSource==='reviewed:virtual-stage-intervals'?{selected:false,minimumWidthMeters:6,originalDriveable:false}:null;
 const nodes=feature.originalSourceNodeIds,retained=feature.sourceNodeIds;
 const exact=Array.isArray(nodes)&&Array.isArray(retained)&&JSON.stringify(nodes)===JSON.stringify(proof.nodeIds)&&JSON.stringify(retained)===JSON.stringify(nodes);
 return {selected:exact&&feature.surfaceSurveyEvidence?.venueSource===proof.venue&&raceVenueContainsInterval(proof.venue,feature.transportRecord.identity,segmentIndex,startT,endT),
  minimumWidthMeters:proof.venue.stage.minimumWidthMeters,originalDriveable:proof.originalDriveable};
}

// The usable race corridor and the mapped pavement are different facts. Most
// reviewed packs author a conservative pavement width; a pack with explicit
// mapped widths can retain those widths while admitting a narrower corridor.
export function reviewedRoadTransportRecord(record,survey){
 if(!survey)return record;
 const stage=survey.venueSource?.version===2&&survey.venueSource.stage?.rally;
 const policy=survey.pavementWidthPolicy||'usable-corridor';
 if(!['usable-corridor','mapped','profiled'].includes(policy)||!(survey.usableWidthMeters>=(stage?survey.venueSource.stage.minimumWidthMeters:6)&&survey.usableWidthMeters<=30))throw Error('invalid_reviewed_road_width');
 if(stage&&(policy!=='mapped'||survey.motorAccess!=='virtual-stage-v1'))throw Error('invalid_reviewed_stage_access');
 let crossSection;
 if(policy==='mapped'){
  if(!String(record.crossSection?.widthSource).startsWith('source:width')||survey.usableWidthMeters>record.crossSection.widthMeters)throw Error('reviewed_road_mapped_width_unavailable');
  crossSection=record.crossSection;
 }else if(policy==='profiled'){
  const profile=survey.pavementSections,venue=survey.venueSource;
  if(!venue||profile?.coordinateSpace!=='world'||profile.venueId!==survey.venueId||profile.sourceFeatureId!==record.identity||
   profile.sourceSha256!==venue?.sourceSha256||venue.id!==survey.venueId||![...venue.sourceFeatureIds,...(venue.pitSourceFeatureIds||[])].includes(record.identity)||
   profile.samples.some(s=>(s.positive+s.bankNegative)*profile.metersPerWorldUnit<survey.usableWidthMeters))throw Error('reviewed_road_pavement_profile_unavailable');
  const widthMeters=Math.max(...profile.samples.map(s=>(s.positive+s.negative)*profile.metersPerWorldUnit)),mid=sampleRoadPavementSection(profile,profile.length*.5);
  crossSection=Object.freeze({...record.crossSection,widthMeters,widthSource:'reviewed-venue-pavement-sections',pavementSections:profile,
   placement:Object.freeze({...record.crossSection.placement,centerlineOffsetMeters:mid.offset*profile.metersPerWorldUnit,status:'reviewed-pavement-sections'})});
 }else crossSection=Object.freeze({...record.crossSection,widthMeters:survey.usableWidthMeters,widthSource:'reviewed-venue-usable-corridor'});
 let access=record.access;
 let safeForDriving=record.safeForDriving;
 let stageProof=null;
 if(survey.motorAccess==='virtual-stage-v1'){
  const venue=survey.venueSource;
  if(!stage||venue.id!==survey.venueId||record.identity!==survey.sourceFeatureId||!venue.sourceFeatureIds.includes(record.identity)||
   !['raceway','primary','secondary','tertiary','unclassified','residential','service','track','road'].includes(record.sourceTags?.highway)||
   record.completeness!=='lossless'||record.routeState!=='complete'||!Array.isArray(survey.sourceNodeIds)||survey.sourceNodeIds.length<2||
   survey.sourceNodeIds.some(id=>typeof id!=='string'||! /^[1-9][0-9]*$/.test(id))||
   venue.stage.legs.some(leg=>leg.sourceFeatureId===record.identity&&leg.endSegment>=survey.sourceNodeIds.length))throw Error('invalid_reviewed_stage_access');
  stageProof=Object.freeze({venue,nodeIds:Object.freeze([...survey.sourceNodeIds]),originalDriveable:record.safeForDriving});
  access=Object.freeze({...access,motorVehicle:'allowed',motorSource:'reviewed:virtual-stage-intervals'});safeForDriving=true;
 }else if(survey.motorAccess!==undefined){
  // A reviewed virtual raceway is driveable in the game, even where the map
  // correctly records private real-world access. Preserve the original tags
  // and pedestrian decision. No ordinary private road or explicit motor ban
  // can acquire this capability from provider/cache JSON.
  if(survey.motorAccess!=='virtual-raceway-v1'||record.sourceTags?.highway!=='raceway'||record.sourceTags?.access!=='private'||
   record.completeness!=='lossless'||record.routeState!=='complete'||access?.motorSource!=='access'||
   !survey.venueSource||survey.venueSource.id!==survey.venueId||!survey.venueSource.sourceFeatureIds.includes(record.identity))throw Error('invalid_reviewed_raceway_access');
  access=Object.freeze({...access,motorVehicle:'allowed',motorSource:'reviewed:virtual-raceway'});safeForDriving=true;
 }
 const reviewed={...record,crossSection,access,safeForDriving,provenance:Object.freeze({...record.provenance,reviewedVenue:survey.venueId,
  ...(survey.motorAccess?{reviewedMotorAccess:survey.motorAccess}:{})})};
 if(stageProof)Object.defineProperty(reviewed,stageKey,{value:stageProof,enumerable:false});
 return Object.freeze(reviewed);
}
