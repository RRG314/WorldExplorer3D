import {PERSONAL_VEHICLES,personalVehicleById} from '../transport/vehicle-garage-rules.js';
import {PROFICIENCY_RANKS,rankForXp} from '../character/catalog.js?v=1';

// Read the existing garage and character profile. No racing inventory, wallet
// or XP store: Journal acceptance remains the sole character-progress writer.
export function racingCollectionSummary(garage,profile) {
 const vehicles=PERSONAL_VEHICLES.filter(v=>garage?.vehicles?.[v.id]);
 const classicIds=new Set(['bmw_e34','delorean','cadillac_coupe','cadillac_fleetwood','golf_ii','datsun_280z']);
 const utilityStyles=new Set(['suv','pickup','van','box-truck','bus']);
 const families={classics:0,everyday:0,utility:0};
 for(const v of vehicles)families[classicIds.has(v.id)?'classics':utilityStyles.has(v.category)?'utility':'everyday']++;
 const xp=Number(profile?.characterState?.proficiencies?.['ground-vehicle']?.xp),available=Number.isFinite(xp)&&xp>=0;
 const rank=rankForXp(PROFICIENCY_RANKS,available?xp:0),next=PROFICIENCY_RANKS.find(r=>r.rank>rank.rank);
 return {owned:vehicles.length,available:PERSONAL_VEHICLES.length,families,
  ready:vehicles.filter(v=>garage.vehicles[v.id].condition>=.3).length,
  homed:vehicles.filter(v=>garage.vehicles[v.id].homeId).length,
  skill:profile?{xp:available?xp:0,label:rank.label,nextXp:next?.minimumXp??null}:null};
}

export function racePracticeFeedback(player) {
 if(!player?.progress?.finished||player.dnf)return {finished:false,clean:false,consistent:false,lapSpread:null};
 const clean=player.barrierContacts===0&&player.progress.penaltyMs===0;
 const laps=player.progress.lapTimes,valid=Array.isArray(laps)&&laps.length>=3&&laps.every(t=>Number.isFinite(t)&&t>0);
 const spread=valid?(Math.max(...laps)-Math.min(...laps))/Math.min(...laps):null;
 return {finished:true,clean,consistent:clean&&spread!==null&&spread<=.05,lapSpread:spread};
}

function raceResultMetadata(result,player,{courseId,recordKey,physicsVersion},online,qualification=false) {
 if(!personalVehicleById(player?.vehicleId)||!/^road-race-[a-f0-9]{32}$/.test(courseId)||
  !(qualification?/^race-route-test-[a-f0-9]{32}$/:online?/^race-online-[a-f0-9]{32}$/:/^race-practice-[a-f0-9]{32}$/).test(recordKey)||!racePracticeFeedback(player).finished||
  !Number.isFinite(player.progress.elapsedMs)||player.progress.elapsedMs<=0||!Number.isSafeInteger(player.barrierContacts)||player.barrierContacts<0)throw Error('invalid_race_practice_result');
 const feedback=racePracticeFeedback(player);
 return {resultOwner:'game-result',...(qualification?{racingQualificationVersion:1,raceVerified:false,serverResultId:result.id}:online?{raceVerified:true,serverResultId:result.id}:{racingPracticeVersion:1,raceVerified:false}),vehicleClass:'car',vehicleId:player.vehicleId,
  courseId,recordKey,physicsVersion,discipline:result.discipline,position:player.position,difficulty:'basic',
  elapsedMs:player.progress.elapsedMs,barrierContacts:player.barrierContacts,penaltyMs:player.progress.penaltyMs,
  cleanFinish:feedback.clean,consistentLaps:feedback.consistent};
}
export function racePracticeMetadata(result,player,options={}){return raceResultMetadata(result,player,options,false);}
export function raceOnlineMetadata(result,player,options={}){
 const receipt=result.receipt?.players?.find(p=>p.uid===player?.uid);
 if(['qualification','room-race'].includes(result.receipt?.purpose)||result.settlement!=='saved'||result.receipt?.id!==result.id||!receipt?.finished||receipt.timeMs!==player?.progress?.elapsedMs)throw Error('race_server_receipt_required');
 return raceResultMetadata(result,player,options,true);
}
export function raceQualificationMetadata(result,player,options={}){
 const receipt=result.receipt?.players?.find(p=>p.uid===player?.uid);
 if(result.receipt?.purpose!=='qualification'||result.settlement!=='saved'||result.receipt.id!==result.id||!receipt?.finished||receipt.timeMs!==player?.progress?.elapsedMs)throw Error('race_server_receipt_required');
 return raceResultMetadata(result,player,options,false,true);
}

export function raceRoomMetadata(result,player,options={}){
 const receipt=result.receipt?.players?.find(p=>p.uid===player?.uid);
 if(result.receipt?.purpose!=='room-race'||result.settlement!=='saved'||result.receipt.id!==result.id||!receipt?.finished||receipt.credits!==0||receipt.timeMs!==player?.progress?.elapsedMs)throw Error('race_server_receipt_required');
 return {...raceResultMetadata(result,player,options,false),racingRoomVersion:1,serverResultId:result.id,ranked:false};
}
