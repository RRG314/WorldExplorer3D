// Private annotation on a prepared source object. Provider tags and cached JSON
// cannot opt themselves into surveyed cross-sections. This is source metadata,
// consumed once by the existing transport compiler, not a runtime height store.
const surveyKey=Symbol('reviewed-road-source-survey');
export function annotateRoadSourceSurvey(way,evidence){
 Object.defineProperty(way,surveyKey,{value:Object.freeze({...evidence}),enumerable:false});
 return way;
}
export function roadSourceSurvey(way){return way?.[surveyKey]||null;}
