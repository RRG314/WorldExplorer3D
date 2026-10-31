import {racePavementCrossSection,racePavementLateralOffsets} from './pavement-cross-section.js';
import {sameRaceVenueSource} from './venue-course-policy.js';
import {buildRaceRoadGraph,createRaceCourse,sampleRaceSegmentY} from './course-rules.js';
import {raceDistrictFingerprint,normalizeRaceRouteReference,restoreRaceCourse,raceCourseKey} from './course-library.js';
import {racePhysicsVersion,RACE_PHYSICS_VERSION} from './record-rules.js';

export {canonicalRaceDistrict} from './district-facts.js';
import {canonicalRaceDistrict} from './district-facts.js';
import {readRaceDistrictFacts,raceDistrictChunkPath} from './district-storage.js';

export async function reconstructPublishedRace(reference,facts){
 const fingerprint=await raceDistrictFingerprint(facts),graph=buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit,venueSource:facts.venueSource});
 return restoreRaceCourse(normalizeRaceRouteReference(reference),facts,graph,fingerprint);
}
export async function rebaseRaceReference(reference,approvedFacts,localFacts){
 const route=normalizeRaceRouteReference(reference);
 if(route.districtFingerprint!==await raceDistrictFingerprint(localFacts))throw Error('race_roads_changed_requalify_route');
 // Source path identity survives millimetre normalisation, never a replacement
 // provider's guessed nearest road. The world remains the admission authority.
 const next={...route,districtFingerprint:await raceDistrictFingerprint(approvedFacts)};
 const course=await reconstructPublishedRace(next,approvedFacts);assertRaceCourseInDistrict(course,localFacts);return next;
}
export function assertRaceCourseInDistrict(course,localFacts){
 if(course.locationId!==localFacts.locationId||Math.abs(course.anchor.lat-localFacts.anchor.lat)>1e-7||Math.abs(course.anchor.lon-localFacts.anchor.lon)>1e-7||course.metersPerUnit!==localFacts.metersPerUnit)throw Error('race_course_wrong_world');
 const graph=buildRaceRoadGraph(localFacts.roads,{metersPerUnit:localFacts.metersPerUnit,venueSource:localFacts.venueSource}),byId=new Map(graph.edges.map(e=>[e.id,e]));
 // Rebuild the entire path using currently published and collision-qualified
 // spans, including direction, decks, water, width and tunnel admission.
 const local=createRaceCourse(graph,course.sourcePath,{...course,eventRules:course.eventRules||null});
 if(local.surfaceModel!==course.surfaceModel||local.pavementModel!==course.pavementModel||!sameRaceVenueSource(local.venueSource,course.venueSource))throw Error('race_roads_changed_requalify_route');
 if(local.segments.length!==course.segments.length)throw Error('race_roads_changed_requalify_route');
 for(let i=0;i<course.segments.length;i++){
  const a=course.segments[i],b=local.segments[i];
  if(a.pavementModel!==b.pavementModel||a.structure!==b.structure||a.widthMeters>b.widthMeters+.003||a.clearanceMeters>b.clearanceMeters+.003||!byId.has(course.sourcePath[Math.min(i,course.sourcePath.length-1)]))throw Error('race_roads_changed_requalify_route');
  for(const key of ['a','b'])if(Math.hypot(a[key].x-b[key].x,a[key].z-b[key].z)*course.metersPerUnit>.01)throw Error('race_roads_changed_requalify_route');
  const steps=Math.ceil(a.lengthMeters/4);
  if(a.pavementModel||a.surfaceKind==='ground'){
   const stations=new Set(Array.from({length:steps+1},(_,j)=>j/steps));
   for(const segment of [a,b]){const range=segment.heightSampleRange||{start:0,end:1};for(const row of segment.heightSamples){const t=(row.t-range.start)/(range.end-range.start);if(t>=0&&t<=1)stations.add(t);}}
   for(const t of stations){
    const left=racePavementCrossSection(a,t),right=racePavementCrossSection(b,t);
    if(a.pavementModel&&['minimumMeters','maximumMeters','racingOffsetMeters','racingWidthMeters'].some(k=>Math.abs(left[k]-right[k])>.003))throw Error('race_roads_changed_requalify_route');
    for(const offset of [...racePavementLateralOffsets(a,t),...racePavementLateralOffsets(b,t)])if(Math.abs(sampleRaceSegmentY(a,t,offset)-sampleRaceSegmentY(b,t,offset))*course.metersPerUnit>.01)throw Error('race_roads_changed_requalify_route');
   }
  }
  for(let j=0;j<=steps;j++)for(const side of [-1.2,0,1.2])if(Math.abs(sampleRaceSegmentY(a,j/steps,side)-sampleRaceSegmentY(b,j/steps,side))*course.metersPerUnit>.01)throw Error('race_roads_changed_requalify_route');
 }
 if(Boolean(local.pitLane)!==Boolean(course.pitLane))throw Error('race_roads_changed_requalify_route');
 if(course.pitLane){
  for(const key of ['entryDistanceMeters','exitDistanceMeters','replacedDistanceMeters'])if(Math.abs(local.pitLane[key]-course.pitLane[key])>.003)throw Error('race_roads_changed_requalify_route');
  assertRaceCourseInDistrict(course.pitLane.course,localFacts);
 }
 return true;
}
export async function racePublicationIdentity(reference,facts){const course=await reconstructPublishedRace(reference,facts);return {course,id:await raceCourseKey(course)};}
export async function raceLocationKey(id){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(String(id))));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
// Both HTTP publication and the socket service call this exact admission rule.
export async function readPublishedRaceCourse({read,id,uid,roomCode,nowMs=Date.now()}){
 if(!/^road-race-[a-f0-9]{32}$/.test(id||''))throw Error('race_invalid_course');
 if(roomCode){
  if(!/^[A-Z0-9]{6}$/.test(roomCode))throw Error('race_invalid_room');
  const root=`rooms/${roomCode}`,record=await read(`${root}/racingCourses/${id}`);
  if(record){
   const [room,player,district,a,b]=await Promise.all([read(root),read(`${root}/players/${uid}`),read(`${root}/racingDistricts/${record.districtId}`),read(`users/${uid}/blockedPlayers/${record.ownerUid}`),read(`users/${record.ownerUid}/blockedPlayers/${uid}`)]),time=t=>t?.toMillis?.()??0;
   if(a||b||record.status!=='room'||record.roomCode!==roomCode||time(record.expiresAt)<=nowMs||room?.world?.seed!==record.worldSeed||room?.world?.kind!=='earth'||player?.uid!==uid||time(player.expiresAt)<=nowMs||nowMs-time(player.lastSeenAt)>120000||time(player.lastSeenAt)>nowMs+5000)throw Error('race_room_presence_expired');
   if(district?.status!=='room'||time(district.expiresAt)<=nowMs||district.worldSeed!==record.worldSeed)throw Error('race_district_unavailable');
   const facts=canonicalRaceDistrict(district.facts);
   if(await raceDistrictFingerprint(facts)!==`race-district:${record.districtId}`||Math.abs(room.world.lat-facts.anchor.lat)>1e-7||Math.abs(room.world.lon-facts.anchor.lon)>1e-7)throw Error('race_course_wrong_world');
   const course=await reconstructPublishedRace(record.reference,facts);
   if(!course.eventRules||await raceCourseKey(course)!==id||record.physicsVersion!==racePhysicsVersion(course))throw Error('race_course_changed');
   return {...course,publication:{status:'room',purpose:'room-race',ownerUid:record.ownerUid,revision:record.revision,districtId:record.districtId,roomCode,worldSeed:record.worldSeed}};
  }
 }
 const record=await read(`racingCourses/${id}`);
 if(!record||record.status!=='approved'&&!(record.ownerUid===uid&&['draft','rejected'].includes(record.status)))return null;
 const district=await read(`racingDistricts/${record.districtId}`);
 if(district?.status!=='approved')throw Error('race_district_unavailable');
 const facts=await readRaceDistrictFacts(district,index=>read(raceDistrictChunkPath(record.districtId,index)));
 if(!facts||await raceDistrictFingerprint(facts)!==`race-district:${record.districtId}`)throw Error('race_district_unavailable');
 const pointer=await read(`racingLocations/${await raceLocationKey(facts.locationId)}`);
 if(pointer?.districtId!==record.districtId)throw Error('race_roads_changed_requalify_route');
 const course=await reconstructPublishedRace(record.reference,facts);
 if((record.physicsVersion??RACE_PHYSICS_VERSION)!==racePhysicsVersion(course))throw Error('race_physics_version_changed');
 if(await raceCourseKey(course)!==id)throw Error('race_course_changed');
 return {...course,publication:{status:record.status,ownerUid:record.ownerUid,revision:record.revision,districtId:record.districtId,
  purpose:record.status==='approved'?(course.discipline==='time-trial'?'time-trial':'competition'):'qualification'}};
}
