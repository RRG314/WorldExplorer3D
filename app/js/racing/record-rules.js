import {raceCourseKey} from './course-library.js';
import {BANKED_ROAD_MODEL,PROFILED_ROAD_PAVEMENT_MODEL} from '../physics/road-plane-dynamics.js';

// Bump when shared handling or timing rules change. Unclassified old records
// remain in the Journal; different builds/conditions never replace each other.
export const RACE_PHYSICS_VERSION='earth-road-2026-10-28.2';
// Opt-in pavement forces form a separate class. Unchanged ordinary courses
// keep their existing qualification receipts and comparable record identities.
export const RACE_BANKED_PHYSICS_VERSION='earth-banked-road-2026-10-29.1';
export const RACE_PROFILED_PAVEMENT_PHYSICS_VERSION='earth-profiled-pavement-2026-10-30.1';
export function racePhysicsVersion(course){
 if(course?.pavementModel!==undefined){if(course.pavementModel!==PROFILED_ROAD_PAVEMENT_MODEL||course.surfaceModel!==BANKED_ROAD_MODEL)throw Error('invalid_race_surface_model');return RACE_PROFILED_PAVEMENT_PHYSICS_VERSION;}
 if(course?.surfaceModel===undefined)return RACE_PHYSICS_VERSION;
 if(course.surfaceModel===BANKED_ROAD_MODEL)return RACE_BANKED_PHYSICS_VERSION;
 throw Error('invalid_race_surface_model');
}
export const isCurrentRacePhysicsVersion=version=>version===RACE_PHYSICS_VERSION||version===RACE_BANKED_PHYSICS_VERSION||version===RACE_PROFILED_PAVEMENT_PHYSICS_VERSION;
export function raceRecordConfiguration(profile,{course}={}) {
 if(!profile?.vehicleId||!Number.isFinite(profile.conditionValue))throw Error('invalid_race_record_profile');
 return {physicsVersion:racePhysicsVersion(course),vehicleId:profile.vehicleId,condition:profile.conditionValue,
  grip:profile.surface.grip,upgrades:profile.upgrades,character:'standard',boost:false};
}
// A rear-row start covers more distance. Grid-to-finish times must never
// silently replace front-row times in the same competitive class.
export function raceCompetitiveRecordConfiguration(profile,{slot,participants,course}){
 if(!Number.isInteger(participants)||participants<1||participants>4||!Number.isInteger(slot)||slot<0||slot>=participants)throw Error('invalid_race_record_grid');
 return {...raceRecordConfiguration(profile,{course}),gridRow:Math.floor(slot/2),gridParticipants:participants,timing:'grid-to-finish'};
}
export async function racePracticeRecordKey(course,profile) {
 const encoded=new TextEncoder().encode(JSON.stringify({courseId:await raceCourseKey(course),...raceRecordConfiguration(profile,{course})}));
 const digest=await crypto.subtle.digest('SHA-256',encoded);
 return 'race-practice-'+Array.from(new Uint8Array(digest).slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
}
