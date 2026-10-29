// Private annotation on a prepared source object. Provider tags and cached JSON
// cannot opt themselves into surveyed cross-sections. This is source metadata,
// consumed once by the existing transport compiler, not a runtime height store.
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
 if(!['usable-corridor','mapped'].includes(policy)||!(survey.usableWidthMeters>=6&&survey.usableWidthMeters<=30))throw Error('invalid_reviewed_road_width');
 let crossSection;
 if(policy==='mapped'){
  if(!String(record.crossSection?.widthSource).startsWith('source:width')||survey.usableWidthMeters>record.crossSection.widthMeters)throw Error('reviewed_road_mapped_width_unavailable');
  crossSection=record.crossSection;
 }else crossSection=Object.freeze({...record.crossSection,widthMeters:survey.usableWidthMeters,widthSource:'reviewed-venue-usable-corridor'});
 return Object.freeze({...record,crossSection,provenance:Object.freeze({...record.provenance,reviewedVenue:survey.venueId})});
}
