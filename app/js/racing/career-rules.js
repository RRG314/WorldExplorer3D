// Optional social competition reads the accepted race receipt. These rules
// never simulate a car, accept a client time, mint Credits or alter handling.
import {RACE_MAXIMUM_DURATION_MS} from './session-limits.js';
export const RACING_CAREER_LIMITS=Object.freeze({crewMembers:8,crewInvites:16,rivals:8,series:4,stages:5,durationMs:7*86400000,finalizationGraceMs:RACE_MAXIMUM_DURATION_MS+30000});
export function racingCareerContext(value={},capturedAtMs){
 const ids=(list,max)=>[...new Set((Array.isArray(list)?list:[]).filter(id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)))].slice(0,max);
 return {rivalIds:ids(value.openRivalIds,RACING_CAREER_LIMITS.rivals),seriesIds:ids(value.openSeriesIds,RACING_CAREER_LIMITS.series),capturedAtMs};
}
export function verifiedCareerFinish(result,uid){
 if(!result||result.snapshot?.phase!=='complete'||!['competition','time-trial'].includes(result.receipt?.purpose)||result.receipt.id!==result.snapshot.id)return null;
 const receipt=result.receipt.players?.find(p=>p.uid===uid),player=result.snapshot.players?.find(p=>p.uid===uid),start=result.snapshot.startAtMs;
 if(!receipt?.finished||!player?.progress?.finished||player.dnf||player.ai||!Number.isFinite(start)||!Number.isFinite(receipt.timeMs)||receipt.timeMs<=0||receipt.timeMs!==player.progress.elapsedMs||!/^[a-f0-9]{64}$/.test(receipt.boardId))return null;
 const penalty=player.progress.penaltyMs||0;if(!Number.isFinite(penalty)||penalty<0||penalty>receipt.timeMs)return null;
 return {runId:result.receipt.id,uid,boardId:receipt.boardId,timeMs:receipt.timeMs,startAtMs:start,finishAtMs:start+receipt.timeMs-penalty,
  clean:!player.barrierContacts&&!penalty};
}
export function careerFinishEligible(finish,{boardId,joinedAtMs,expiresAtMs,leftAtMs}={}){
 return !!finish&&finish.boardId===boardId&&Number.isFinite(joinedAtMs)&&Number.isFinite(expiresAtMs)&&finish.startAtMs>=joinedAtMs&&finish.finishAtMs<=expiresAtMs&&
  (!Number.isFinite(leftAtMs)||finish.finishAtMs<=leftAtMs);
}
export function racingSeriesStandings(series){
 const stages=series.stages||[],rows=(series.entries||[]).map(entry=>{
  const times=stages.map(s=>entry.bests?.[s.boardId]?.timeMs),completed=times.filter(t=>Number.isFinite(t)&&t>0).length;
  return {uid:entry.uid,label:entry.label,withdrawn:entry.withdrawn===true,completed,totalMs:times.reduce((sum,t)=>sum+(Number.isFinite(t)&&t>0?t:0),0),finished:completed===stages.length&&stages.length>0};
 }).sort((a,b)=>Number(a.withdrawn)-Number(b.withdrawn)||b.completed-a.completed||a.totalMs-b.totalMs||a.uid.localeCompare(b.uid));
 let position=0;return rows.map((row,i)=>{const previous=rows[i-1],tie=previous&&row.withdrawn===previous.withdrawn&&row.completed===previous.completed&&row.totalMs===previous.totalMs;position=tie?position:i+1;return {...row,position};});
}
export function racingRivalOutcome(challenge){
 if(challenge.status!=='active'||challenge.players?.length!==2)return null;
 const rows=challenge.players.map(uid=>({uid,best:challenge.bests?.[uid]}));
 if(rows.some(p=>!Number.isFinite(p.best?.timeMs)||p.best.timeMs<=0))return null;
 const fastest=Math.min(...rows.map(p=>p.best.timeMs));return {winners:rows.filter(p=>p.best.timeMs===fastest).map(p=>p.uid),tie:rows[0].best.timeMs===rows[1].best.timeMs};
}
