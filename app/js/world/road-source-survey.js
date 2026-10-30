// Private annotation on a prepared source object. Provider tags and cached JSON
// cannot opt themselves into surveyed cross-sections. This is source metadata,
// consumed once by the existing transport compiler, not a runtime height store.
import {sampleRoadPavementSection} from './road-pavement-sections.js';
const surveyKey=Symbol('reviewed-road-source-survey');
export function annotateRoadSourceSurvey(way,evidence){
 Object.defineProperty(way,surveyKey,{value:Object.freeze({...evidence}),enumerable:false});
 return way;
}
export function roadSourceSurvey(way){return way?.[surveyKey]||null;}

// The usable race corridor and the mapped pavement are different facts. Most
// reviewed packs author a conservative pavement width; a pack with explicit
// mapped widths can retain those widths while admitting a narrower corridor.
export function reviewedRoadTransportRecord(record,survey){
 if(!survey)return record;
 const policy=survey.pavementWidthPolicy||'usable-corridor';
 if(!['usable-corridor','mapped','profiled'].includes(policy)||!(survey.usableWidthMeters>=6&&survey.usableWidthMeters<=30))throw Error('invalid_reviewed_road_width');
 let crossSection;
 if(policy==='mapped'){
  if(!String(record.crossSection?.widthSource).startsWith('source:width')||survey.usableWidthMeters>record.crossSection.widthMeters)throw Error('reviewed_road_mapped_width_unavailable');
  crossSection=record.crossSection;
 }else if(policy==='profiled'){
  const profile=survey.pavementSections,venue=survey.venueSource;
  if(!venue||profile?.coordinateSpace!=='world'||profile.venueId!==survey.venueId||profile.sourceFeatureId!==record.identity||
   profile.sourceSha256!==venue?.sourceSha256||venue.id!==survey.venueId||!venue.sourceFeatureIds.includes(record.identity)||
   profile.samples.some(s=>(s.positive+s.bankNegative)*profile.metersPerWorldUnit<survey.usableWidthMeters))throw Error('reviewed_road_pavement_profile_unavailable');
  const widthMeters=Math.max(...profile.samples.map(s=>(s.positive+s.negative)*profile.metersPerWorldUnit)),mid=sampleRoadPavementSection(profile,profile.length*.5);
  crossSection=Object.freeze({...record.crossSection,widthMeters,widthSource:'reviewed-venue-pavement-sections',pavementSections:profile,
   placement:Object.freeze({...record.crossSection.placement,centerlineOffsetMeters:mid.offset*profile.metersPerWorldUnit,status:'reviewed-pavement-sections'})});
 }else crossSection=Object.freeze({...record.crossSection,widthMeters:survey.usableWidthMeters,widthSource:'reviewed-venue-usable-corridor'});
 let access=record.access;
 let safeForDriving=record.safeForDriving;
 if(survey.motorAccess!==undefined){
  // A reviewed virtual raceway is driveable in the game, even where the map
  // correctly records private real-world access. Preserve the original tags
  // and pedestrian decision. No ordinary private road or explicit motor ban
  // can acquire this capability from provider/cache JSON.
  if(survey.motorAccess!=='virtual-raceway-v1'||record.sourceTags?.highway!=='raceway'||record.sourceTags?.access!=='private'||
   record.completeness!=='lossless'||record.routeState!=='complete'||access?.motorSource!=='access'||
   !survey.venueSource||survey.venueSource.id!==survey.venueId||!survey.venueSource.sourceFeatureIds.includes(record.identity))throw Error('invalid_reviewed_raceway_access');
  access=Object.freeze({...access,motorVehicle:'allowed',motorSource:'reviewed:virtual-raceway'});safeForDriving=true;
 }
 return Object.freeze({...record,crossSection,access,safeForDriving,provenance:Object.freeze({...record.provenance,reviewedVenue:survey.venueId,
  ...(survey.motorAccess?{reviewedMotorAccess:survey.motorAccess}:{})})});
}
