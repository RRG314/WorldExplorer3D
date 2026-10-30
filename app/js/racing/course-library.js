import {normalizeRaceVenueSource} from './venue-course-policy.js';
import {createRaceCourse,RACE_DISCIPLINES,RACE_MAX_ROUTE_EDGES} from './course-rules.js';
export function normalizeRaceRouteReference(value) {
 if(!value||value.version!==1||!/^race-district:[a-f0-9]{64}$/.test(value.districtFingerprint)||
  !Array.isArray(value.path)||value.path.length<1||value.path.length>RACE_MAX_ROUTE_EDGES||value.path.some(id=>typeof id!=='string'||id.length>190)||
  !RACE_DISCIPLINES.includes(value.discipline)||!Number.isInteger(value.laps)||value.laps<1||value.laps>8||
  !Number.isInteger(value.participants)||value.participants<1||value.participants>4)throw Error('invalid_saved_race_route');
 const offset=value.startOffsetMeters??null;if(offset!==null&&(!Number.isFinite(offset)||offset<=0))throw Error('invalid_saved_race_route');
 return {version:1,districtFingerprint:value.districtFingerprint,path:[...value.path],discipline:value.discipline,laps:value.laps,
  participants:value.participants,startOffsetMeters:offset,name:String(value.name||'Your mapped route').trim().slice(0,100)};
}
export async function raceDistrictFingerprint(district) {
 const value=JSON.stringify({version:1,...(district.venueSource?{venueSource:normalizeRaceVenueSource(district.venueSource)}:{}),locationId:district.locationId,anchor:district.anchor,metersPerUnit:district.metersPerUnit,
  roads:[...district.roads].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)).map(r=>({id:r.sourceId,a:r.a,b:r.b,width:r.widthMeters,
   ...(r.surfaceModel?{surfaceModel:r.surfaceModel}:{}),...(r.edgeBandModel?{edgeBandModel:r.edgeBandModel}:{}),
   direction:r.direction||'both',structure:r.structure,clearance:r.clearanceMeters,heights:r.heightSamples,span:r.heightSampleSpanMeters}))});
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return 'race-district:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export function raceCourseReference(course,districtFingerprint) {
 return normalizeRaceRouteReference({version:1,districtFingerprint,path:course.sourcePath,discipline:course.discipline,laps:course.laps,
  participants:course.participants,startOffsetMeters:course.startOffsetMeters,name:course.name});
}
export function restoreRaceCourse(reference,district,graph,fingerprint) {
 const route=normalizeRaceRouteReference(reference);
 if(route.districtFingerprint!==fingerprint)throw Error('race_roads_changed_requalify_route');
 return createRaceCourse(graph,route.path,{...route,locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,
  ...(route.startOffsetMeters===null?{startOffsetMeters:undefined}:{})});
}
export async function raceCourseKey(course) {
 const data=new TextEncoder().encode(JSON.stringify({version:course.version,...(course.venueSource?{venueSource:normalizeRaceVenueSource(course.venueSource)}:{}),location:course.locationId,anchor:course.anchor,
  ...(course.surfaceModel?{surfaceModel:course.surfaceModel}:{}),...(course.edgeBandModel?{edgeBandModel:course.edgeBandModel}:{}),
  discipline:course.discipline,laps:course.laps,segments:course.segments}));
 const hash=await crypto.subtle.digest('SHA-256',data);
 return 'road-race-'+Array.from(new Uint8Array(hash).slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
}
