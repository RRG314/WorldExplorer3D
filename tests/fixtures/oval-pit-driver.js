import {projectRacePosition} from '../../app/js/racing/course-rules.js';
import {raceAiActions} from '../../app/js/racing/ai-controller.js';
import {ovalDistanceGap} from '../../app/js/racing/oval-rules.js';
// Controller-generated inputs for this controlled fixture. Never a pose path,
// public autopilot, native venue qualification or steady human-input evidence.
export function ovalPitDriverActions(course,geometry,player,profile,{paceMetersPerSecond=10}={}){
 const projection=projectRacePosition(course,player.pose),approach=!player.pit.visits&&Math.abs(ovalDistanceGap(projection?.distanceMeters??0,geometry.entryDistanceMeters,course.lengthMeters))<100,
  takeBranch=!player.pit.visits&&player.progress.nextGate===geometry.covered[0].index;
 if(player.pit.active||!player.pit.visits&&(player.pit.approach||takeBranch))return raceAiActions(geometry.pitPavement,player.vehicleState,{nextGate:player.pit.nextGate??0,finished:false},profile,{formation:true,paceMetersPerSecond});
 return raceAiActions(course,player.vehicleState,player.progress,profile,{laneOffsetMeters:approach?3.2:-1.4,...(approach?{formation:true,paceMetersPerSecond}:{})});
}
