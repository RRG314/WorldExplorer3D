import test from 'node:test';import assert from 'node:assert/strict';
import {racingCareerContext,verifiedCareerFinish,careerFinishEligible,racingSeriesStandings,racingRivalOutcome} from '../app/js/racing/career-rules.js';
const board='a'.repeat(64),other='b'.repeat(64),run='12345678-1234-1234-1234-123456789abc';
function result(){return {receipt:{id:run,purpose:'competition',players:[{uid:'driver',finished:true,timeMs:12000,boardId:board}]},snapshot:{id:run,phase:'complete',startAtMs:100000,players:[{uid:'driver',ai:false,dnf:false,barrierContacts:0,progress:{finished:true,elapsedMs:12000,penaltyMs:1000}}]}};}
test('career context is bounded admission-time metadata, not a client score or another profile',()=>{
 const a='1'.repeat(32),b='2'.repeat(32),context=racingCareerContext({openRivalIds:[a,a,'bad',b,...Array.from({length:20},(_,i)=>i.toString(16).padStart(32,'0'))],openSeriesIds:[b,b]},200);
 assert.equal(context.rivalIds.length,8);assert.deepEqual(context.seriesIds,[b]);assert.equal(context.capturedAtMs,200);assert.equal(context.profile,undefined);
});
test('only matching accepted human receipts produce a career finish; penalties do not move the actual crossing deadline',()=>{
 const r=result(),finish=verifiedCareerFinish(r,'driver');assert.equal(finish.finishAtMs,111000);assert.equal(finish.timeMs,12000);assert.equal(finish.clean,false);
 assert.equal(careerFinishEligible(finish,{boardId:board,joinedAtMs:99000,expiresAtMs:111000}),true);
 assert.equal(careerFinishEligible(finish,{boardId:board,joinedAtMs:100001,expiresAtMs:120000}),false);
 assert.equal(careerFinishEligible(finish,{boardId:other,joinedAtMs:99000,expiresAtMs:120000}),false);
 assert.equal(careerFinishEligible(finish,{boardId:board,joinedAtMs:99000,expiresAtMs:110999}),false);
 for(const mutate of [v=>v.receipt.purpose='qualification',v=>v.receipt.players[0].timeMs=1,v=>v.snapshot.players[0].ai=true,v=>v.snapshot.players[0].dnf=true,v=>v.snapshot.phase='running',v=>v.receipt.id='other']){const bad=result();mutate(bad);assert.equal(verifiedCareerFinish(bad,'driver'),null);}
 assert.equal(verifiedCareerFinish(r,'someone-else'),null);
});
test('series rank completion before aggregate time, preserve ties, and keep a withdrawn entrant out of winning place',()=>{
 const series={stages:[{boardId:board},{boardId:other}],entries:[{uid:'withdrawn',withdrawn:true,bests:{[board]:{timeMs:1},[other]:{timeMs:1}}},{uid:'partial',bests:{[board]:{timeMs:2}}},{uid:'one',bests:{[board]:{timeMs:1000},[other]:{timeMs:2000}}},{uid:'two',bests:{[board]:{timeMs:1500},[other]:{timeMs:1500}}}]},rows=racingSeriesStandings(series);
 assert.deepEqual(rows.map(r=>[r.uid,r.position]),[['one',1],['two',1],['partial',3],['withdrawn',4]]);assert.equal(rows[0].finished,true);assert.equal(rows[2].finished,false);
});
test('rival outcomes require two accepted times; ties share the outcome without creating a payment',()=>{
 const c={status:'active',players:['one','two'],bests:{one:{timeMs:1000}}};assert.equal(racingRivalOutcome(c),null);c.bests.two={timeMs:1000};assert.deepEqual(racingRivalOutcome(c),{winners:['one','two'],tie:true});c.bests.two.timeMs=900;assert.deepEqual(racingRivalOutcome(c),{winners:['two'],tie:false});c.status='invited';assert.equal(racingRivalOutcome(c),null);
});
