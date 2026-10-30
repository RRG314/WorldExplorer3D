import {racePavementCrossSection} from './pavement-cross-section.js';
import {earthDrivingSteeringProfile}from'../controls/traversal-control-policy.js?v=9';
import {carSpeedToMph}from'../physics/vehicle-speed-units.js?v=2';
import {projectRacePosition,sampleRaceSegmentY,raceSegmentAtDistance}from'./course-rules.js';
import {raceVehicleGroundPose,raceVehicleSpeedMetersPerSecond}from'./vehicle-controller.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
export function pointOnRaceCourse(course,distanceMeters){
 const distance=course.discipline==='circuit'?((distanceMeters%course.lengthMeters)+course.lengthMeters)%course.lengthMeters:clamp(distanceMeters,0,course.lengthMeters);
 const segment=raceSegmentAtDistance(course,distance),t=clamp((distance-segment.startMeters)/segment.lengthMeters,0,1);
 const offset=racePavementCrossSection(segment,t)?.racingOffsetMeters||0,unit=course.metersPerUnit;
 return {x:segment.a.x+(segment.b.x-segment.a.x)*t+segment.forward.z*offset/unit,y:sampleRaceSegmentY(segment,t,offset),z:segment.a.z+(segment.b.z-segment.a.z)*t-segment.forward.x*offset/unit,segment};
}

// Controls, never a pose path or a rubber-band speed override. The same session
// vehicle calculation consumes these actions for rivals and human drivers.
export function raceAiActions(course,car,progress,profile,{difficulty=.65}={}){
 if(progress.finished)return {steer:0,throttle:0,serviceBrake:1};
 const goal=course.gates[progress.nextGate],pose=raceVehicleGroundPose(car),speed=Math.abs(raceVehicleSpeedMetersPerSecond(car));
 const projection=projectRacePosition(course,pose,{minimumMeters:Math.max(0,(course.gates[progress.nextGate-1]?.distanceMeters||0)-8),maximumMeters:Math.min(course.lengthMeters,goal.distanceMeters+15)});
 if(!projection)return {steer:0,throttle:0,serviceBrake:1};
 const look=clamp(3.5+speed*.6,4,15),target=pointOnRaceCourse(course,projection.distanceMeters+look);
 const dx=(target.x-car.x)*course.metersPerUnit,dz=(target.z-car.z)*course.metersPerUnit,heading=Math.atan2(dx,dz),error=wrap(heading-car.angle);
 const steering=earthDrivingSteeringProfile(carSpeedToMph(Math.abs(car.speed)));
 const desiredAngle=Math.atan2(2*profile.handling.wheelBase*Math.sin(error),Math.max(2,Math.hypot(dx,dz)));
 const maxAngle=steering.maxSteeringAngle*profile.handling.steeringScale*profile.condition.steeringScale;
 const steer=clamp(desiredAngle/Math.max(.1,maxAngle)*1.35,-1,1);
 let targetSpeed=Math.min(profile.handling.topSpeedMph*.44704*(.32+.25*clamp(difficulty,0,1)),23);
 const gripAcceleration=profile.config.gripRoad*profile.surface.grip*profile.handling.gripScale*profile.condition.gripScale*profile.upgrades.gripScale*9.81;
 const planningDeceleration=Math.max(1.2,Math.min(4,gripAcceleration*.45,profile.config.brake*.22352*profile.handling.brakeScale*.65));
 const horizon=Math.min(180,Math.max(70,speed*speed/(2*planningDeceleration)+look+15));
 for(let index=0;index<course.segments.length;index++){
  const segment=course.segments[index];
  let ahead=segment.startMeters-projection.distanceMeters;if(ahead<0&&course.discipline==='circuit')ahead+=course.lengthMeters;
  if(ahead<0||ahead>horizon)continue;
  const previous=course.segments[(index+course.segments.length-1)%course.segments.length];
  if(!index&&course.discipline!=='circuit')continue;
  const bend=Math.acos(clamp(previous.forward.x*segment.forward.x+previous.forward.z*segment.forward.z,-1,1));
  if(bend<.12)continue;
  const corner=Math.max(2.8,Math.min(15,4.5/bend))*Math.sqrt(profile.surface.grip),brakeDistance=Math.max(0,ahead-look*.35);
  targetSpeed=Math.min(targetSpeed,Math.sqrt(corner*corner+2*planningDeceleration*brakeDistance));
 }
 targetSpeed*=clamp(1-Math.abs(error)*.32,.25,1);
 const difference=targetSpeed-speed;
 return {steer,throttle:difference>.2?clamp(difference*.6,.12,1):0,reverse:0,brake:0,serviceBrake:difference<-.35?clamp(-difference*.3,0,1):0};
}
