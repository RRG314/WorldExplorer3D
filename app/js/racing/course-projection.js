import {normalizeRaceVenueSource} from './venue-course-policy.js';
import {racePhysicsVersion} from './record-rules.js';

// Long courses are already reconstructed from the approved district on both
// sides. Socket joins and settled receipts carry only their bounded identity
// and display facts; they never become a second geometry authority or store.
export function raceCourseProjection(course,courseId){
 if(!course.venueSource)return course;
 if(!/^road-race-[a-f0-9]{32}$/.test(courseId||''))throw Error('invalid_race_course_projection');
 return {type:'RaceCourseProjection',version:1,courseId,physicsVersion:racePhysicsVersion(course),
  venueSource:normalizeRaceVenueSource(course.venueSource),locationId:course.locationId,locationLabel:course.locationLabel,
  anchor:{lat:course.anchor.lat,lon:course.anchor.lon},name:course.name,description:course.description,
  discipline:course.discipline,laps:course.laps,participants:course.participants,lengthMeters:course.lengthMeters,metersPerUnit:course.metersPerUnit,
  ...(course.surfaceModel?{surfaceModel:course.surfaceModel}:{})};
}
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
export function resolveRaceCourseProjection(value,expectedCourse,courseId){
 if(value?.type!=='RaceCourseProjection')return value;
 if(!expectedCourse?.venueSource||JSON.stringify(ordered(value))!==JSON.stringify(ordered(raceCourseProjection(expectedCourse,courseId))))throw Error('invalid_race_snapshot');
 return expectedCourse;
}
