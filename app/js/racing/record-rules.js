import {raceCourseKey} from './course-library.js';

// Bump when shared handling or timing rules change. Unclassified old records
// remain in the Journal; different builds/conditions never replace each other.
export const RACE_PHYSICS_VERSION='earth-road-2026-10-28.2';
export function raceRecordConfiguration(profile) {
 if(!profile?.vehicleId||!Number.isFinite(profile.conditionValue))throw Error('invalid_race_record_profile');
 return {physicsVersion:RACE_PHYSICS_VERSION,vehicleId:profile.vehicleId,condition:profile.conditionValue,
  grip:profile.surface.grip,upgrades:profile.upgrades,character:'standard',boost:false};
}
export async function racePracticeRecordKey(course,profile) {
 const encoded=new TextEncoder().encode(JSON.stringify({courseId:await raceCourseKey(course),...raceRecordConfiguration(profile)}));
 const digest=await crypto.subtle.digest('SHA-256',encoded);
 return 'race-practice-'+Array.from(new Uint8Array(digest).slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
}
