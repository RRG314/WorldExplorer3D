import {raceSegmentAtDistance,sampleRaceSegmentY,projectRacePosition} from './course-rules.js';
import {racePavementCrossSection} from './pavement-cross-section.js';
import {ovalDistanceGap,ovalTrackZone} from './oval-rules.js';
import {restrictedRaceSpeedActions} from './speed-controls.js';

// Original game circuit policy, not an official venue/series speed claim.
export const CIRCUIT_PIT_SPEED_METERS_PER_SECOND=60/3.6;
export const CIRCUIT_PIT_PENALTY_MS=5000;
export const CIRCUIT_PIT_MERGE_CLEARANCE_METERS=10;
export const circuitPitPaceActions=(actions,speed,restricted)=>restrictedRaceSpeedActions(actions,speed,restricted,CIRCUIT_PIT_SPEED_METERS_PER_SECOND);

function gateAt(course,distanceMeters){
 const s=raceSegmentAtDistance(course,distanceMeters),t=Math.max(0,Math.min(1,(distanceMeters-s.startMeters)/s.lengthMeters)),section=racePavementCrossSection(s,t),offset=section?.racingOffsetMeters||0;
 return {x:s.a.x+(s.b.x-s.a.x)*t+s.forward.z*offset/course.metersPerUnit,y:sampleRaceSegmentY(s,t,offset),z:s.a.z+(s.b.z-s.a.z)*t-s.forward.x*offset/course.metersPerUnit,
  forward:s.forward,halfWidthMeters:section?section.racingWidthMeters/2:s.widthMeters/2,distanceMeters};
}
// Immutable query/timing views of the existing qualified course, owned by its
// session/controller. No inferred pavement, alternate height field or actor.
export function createRacePitGeometry(course){
 if(!course.pitLane)return null;
 const {course:pit,entryDistanceMeters,exitDistanceMeters,replacedDistanceMeters}=course.pitLane,length=course.lengthMeters,
  covered=course.gates.map((g,index)=>({index,delta:(g.distanceMeters-entryDistanceMeters+length)%length})).filter(g=>g.delta>0&&g.delta<=replacedDistanceMeters+1e-6).sort((a,b)=>a.delta-b.delta);
 if(covered.length<2)throw Error('race_pit_timing_unavailable');
 const gates=course.gates.map(g=>Object.freeze({...g,pitUnavailable:true})),requirements=new Map();for(const {index,delta}of covered){const distance=Math.min(pit.lengthMeters,delta/replacedDistanceMeters*pit.lengthMeters);gates[index]=Object.freeze(gateAt(pit,distance));requirements.set(index,pit.gates.filter(g=>g.distanceMeters<=distance+1e-7).length);}
 // The pit path stays open. Aerodynamic force does not make its exit wrap to
 // its entry, nor change how a controller looks ahead along this branch.
 const pitPavement=Object.freeze({...pit,ovalAerodynamics:course.discipline==='oval'}),timing=Object.freeze({...pitPavement,laps:course.laps,gates:Object.freeze(gates)}),
  union=Object.freeze({...course,segments:Object.freeze([...course.segments,...pit.segments]),fullRoadContactProjection:true});
 return Object.freeze({pitPavement,timing,union,covered:Object.freeze(covered.map(Object.freeze)),requirements,entry:Object.freeze(gateAt(pit,0)),exit:Object.freeze(gateAt(pit,pit.lengthMeters)),entryDistanceMeters,exitDistanceMeters,replacedDistanceMeters});
}
export function racePitGateCrossing(gate,from,to,metersPerUnit){
 const f=gate.forward,a=(from.x-gate.x)*f.x+(from.z-gate.z)*f.z,b=(to.x-gate.x)*f.x+(to.z-gate.z)*f.z;
 if(!(a<=0&&b>0))return false;
 const t=-a/(b-a),x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t,y=from.y+(to.y-from.y)*t;
 return Math.abs(((x-gate.x)*f.z-(z-gate.z)*f.x)*metersPerUnit)<=gate.halfWidthMeters&&Math.abs(y-gate.y)*metersPerUnit<=2;
}
export function racePitEntryNearby(course,geometry,projection){return Boolean(projection&&Math.abs(ovalDistanceGap(geometry.entryDistanceMeters,projection.distanceMeters,course.lengthMeters))<=35);}
export function racePitMappedDistance(course,geometry,distance){return (geometry.entryDistanceMeters+Math.max(0,Math.min(1,distance/geometry.pitPavement.lengthMeters))*geometry.replacedDistanceMeters)%course.lengthMeters;}
export function racePitPavementAt(course,geometry,pose,{active=false,approach=false,pitProjection,mainProjection}={}){
 if(!geometry)return course;
 if(active){const d=(pitProjection||projectRacePosition(geometry.pitPavement,pose))?.distanceMeters??0;return d<15||d>geometry.pitPavement.lengthMeters-15?geometry.union:geometry.pitPavement;}
 if(approach)return geometry.union;
 const projection=mainProjection||projectRacePosition(course,pose);
 return (course.discipline==='circuit'||ovalTrackZone(projection)==='apron')&&racePitEntryNearby(course,geometry,projection)?geometry.union:course;
}
