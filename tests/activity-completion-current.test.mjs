import test from 'node:test';import assert from 'node:assert/strict';
import {createActivityCompletionStore,activityCompletionMessage} from '../app/js/activity-discovery/completion.js';
const activity={id:'harbor-test',title:'Harbor walk'};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}};
test('a rejected Journal save cannot advance completion, and reload retries the same event exactly once',async()=>{
 const disk=storage(),events=new Map();let reject=true,calls=0;
 const recordEvent=async event=>{calls++;if(reject)throw Error('quota');if(events.has(event.eventId))return {recorded:false,reason:'already-recorded',event};events.set(event.eventId,event);return {recorded:true,event}};
 let store=createActivityCompletionStore({storage:()=>disk,recordEvent});
 assert.equal(await store.complete(activity,13000,{x:1,z:2}),false);assert.equal(store.get(activity.id),null);assert.equal(store.status(activity.id).status,'retry');assert.equal(store.canStart(activity.id),false);
 assert.match(activityCompletionMessage(null,store.status(activity.id)),/needs retry/);
 store=createActivityCompletionStore({storage:()=>disk,recordEvent});reject=false;
 assert.equal(await store.retry(activity.id),true);assert.equal(store.get(activity.id).count,1);assert.equal(store.status(activity.id).status,'saved');assert.equal(events.size,1);assert.equal(calls,2);
 assert.equal(await store.retry(activity.id),true);assert.equal(calls,2);
 await store.complete(activity,11000,{x:1,z:2});assert.equal(store.get(activity.id).count,2);assert.equal(store.get(activity.id).bestTimeMs,11000);assert.equal([...events.values()].reduce((n,e)=>n+e.points,0),2);
});
test('saving is single-flight and never labels a pending or legacy result as Journal accepted',async()=>{
 const disk=storage();let finish,calls=0;const store=createActivityCompletionStore({storage:()=>disk,recordEvent:event=>{calls++;return new Promise(resolve=>finish=()=>resolve({recorded:true,event}))}});
 const a=store.complete(activity,1000,{}),b=store.retry(activity.id);assert.equal(calls,1);assert.equal(store.status(activity.id).status,'saving');assert.match(activityCompletionMessage(null,store.status(activity.id)),/Saving/);finish();await Promise.all([a,b]);assert.equal(store.get(activity.id).count,1);
 assert.match(activityCompletionMessage({count:3},{status:'unverified'}),/not verified/);
});
test('cache failure retains accepted event for idempotent retry; unrelated duplicate receipts are rejected',async()=>{
 const disk=storage();let fail=true;const wrapped={getItem:disk.getItem,setItem(k,v){if(fail&&k.includes('activityCompletions'))throw Error('quota');disk.setItem(k,v)}};const events=new Map();
 const store=createActivityCompletionStore({storage:()=>wrapped,recordEvent:async event=>{const duplicate=events.has(event.eventId);events.set(event.eventId,event);return {recorded:!duplicate,reason:'already-recorded',event}}});
 assert.equal(await store.complete(activity,1000,{}),true);assert.equal(store.status(activity.id).status,'cache-retry');fail=false;assert.equal(await store.retry(activity.id),true);assert.equal(store.get(activity.id).count,1);assert.equal(events.size,1);
 const bad=createActivityCompletionStore({storage:()=>storage(),recordEvent:async()=>({recorded:false,reason:'already-recorded',event:{eventId:'other'}})});assert.equal(await bad.complete(activity,1000,{}),false);
});
test('blocked storage is explicitly non-durable, while failed attempts receive no completion credit',async()=>{
 const store=createActivityCompletionStore({storage:()=>({getItem:()=>null,setItem(){throw Error('quota')}}),recordEvent:async()=>{throw Error('offline')}});await store.complete(activity,1000,{});assert.equal(store.status(activity.id).durable,false);assert.match(activityCompletionMessage(null,store.status(activity.id)),/keep this tab open/);
 let event;const failed=createActivityCompletionStore({storage:()=>storage(),recordEvent:async e=>(event=e,{recorded:true,event:e})});await failed.complete({id:'trial-attempt'},2000,{}, {outcome:'failed'});assert.equal(event.eventType,'activity-ended');assert.equal(event.points,0);assert.equal(event.firstCompletion,false);
});
test('pending retry retains the location and time where the game ended',async()=>{
 let location='harbor',time=1000,reject=true,accepted;const disk=storage();
 const store=createActivityCompletionStore({storage:()=>disk,now:()=>time,context:()=>({regionId:location,locationSnapshot:{name:location}}),recordEvent:async e=>{if(reject)throw Error('quota');accepted=e;return {recorded:true,event:e}}});
 await store.complete(activity,1000,{});location='mars';time=5000;reject=false;await store.retry(activity.id);assert.equal(accepted.regionId,'harbor');assert.equal(accepted.locationSnapshot.name,'harbor');assert.equal(accepted.occurredAt,1000);
});
test('cached saved wording is reverified against the Journal after reload or restore',async()=>{
 const disk=storage(),events=[];const recordEvent=async e=>(events.push(e),{recorded:true,event:e}),lookupEvents=async ids=>events.filter(e=>ids.includes(e.eventId));
 const first=createActivityCompletionStore({storage:()=>disk,recordEvent,lookupEvents});await first.complete(activity,1000,{});
 const reload=createActivityCompletionStore({storage:()=>disk,recordEvent,lookupEvents});assert.equal(reload.status(activity.id).status,'unverified');await reload.verify(activity.id);assert.equal(reload.status(activity.id).status,'saved');events.length=0;await reload.verify(activity.id);assert.equal(reload.status(activity.id).status,'unverified');
});
