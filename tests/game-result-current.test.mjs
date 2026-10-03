import test from 'node:test';import assert from 'node:assert/strict';
import {createGameResultController} from '../app/js/gameplay/result-controller.js';
import {createActivityCompletionStore} from '../app/js/activity-discovery/completion.js';
import {createActivePlayClock} from '../app/js/gameplay/active-clock.js';
test('common result retries Journal before replay, releases only its pause, and retains the selected replay callback',async()=>{
 const elements=Object.fromEntries(['resultTitle','resultStats','resultScreen','resultJournalStatus','resultJournalRetry','againBtn'].map(id=>[id,{classList:{add(){},remove(){}},textContent:'',hidden:false,disabled:false}]));
 const reasons=new Set(['manual_pause']),disk=new Map(),events=[];let reject=true,replays=0;
 const completions=createActivityCompletionStore({storage:()=>({getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)}),recordEvent:async event=>{if(reject)throw Error('quota');events.push(event);return {recorded:true,event}}});
 const c=createGameResultController({gameMode:'trial',gameTimer:12,setPauseReason:(id,enabled)=>enabled?reasons.add(id):reasons.delete(id),startMode:()=>{replays++;return true}},{document:{getElementById:id=>elements[id]},completions});
 await c.show('Time is up','Failed',{outcome:'failed'});assert.equal(elements.againBtn.disabled,true);assert.equal(elements.resultJournalRetry.hidden,false);assert.match(elements.resultJournalStatus.textContent,/failed/);assert.equal(c.replay(),false);
 reject=false;assert.equal(await c.retry(),true);assert.equal(elements.againBtn.disabled,false);assert.equal(events[0].points,0);assert.equal(events[0].metadata.resultOwner,'game-result');assert.equal(c.replay(),true);assert.equal(replays,1);assert.deepEqual([...reasons],['manual_pause']);
 await c.show('Flower found','Run time',{activityId:'flower-sprint',replay:()=>{replays+=10;return true}});c.replay();assert.equal(replays,11);
});
test('active gameplay clock excludes a full pause interval and repeated nested pause updates',()=>{
 let t=1000;const c=createActivePlayClock(()=>t);assert.equal(c.now(),1000);c.setPaused(true);t+=5000;c.setPaused(true);assert.equal(c.now(),1000);t+=2000;c.setPaused(false);assert.equal(c.now(),1000);t+=80;assert.equal(c.now(),1080);
});
test('DeFlock uses active time and restores a finished elapsed total without doubling it',async()=>{
 const {createDeFlockState,getElapsedMs,markVirtuallyDisabled}=await import('../app/js/deflock/state.js');let t=1000;const clock=createActivePlayClock(()=>t),features=[{sourceId:'camera-one'}];
 const s=createDeFlockState(features,{clock:()=>clock.now()});t+=100;clock.setPaused(true);t+=9000;assert.equal(getElapsedMs(s),100);clock.setPaused(false);t+=50;markVirtuallyDisabled(s,'camera-one');assert.equal(getElapsedMs(s),150);
 const restored=createDeFlockState(features,{clock:()=>0,persisted:{disabled:['camera-one'],elapsedMs:150}});assert.equal(getElapsedMs(restored),150);
});
