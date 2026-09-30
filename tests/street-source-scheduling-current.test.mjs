import test from 'node:test';
import assert from 'node:assert/strict';
import {streetSourceInput,streetSourceInputCooperatively,sendStreetSourceInChunks} from '../app/js/world/street-source-input.js';

test('cooperative street snapshot preserves identities, order and filtering',async()=>{
 const ctx={METERS_PER_WORLD_UNIT:1.2,roads:Array.from({length:700},(_,id)=>({type:'residential',pts:[{x:id,z:0}],width:7})),buildings:[{pts:[{x:1,z:2}]},{allowsPassageBelow:true,pts:[]}],linearFeatures:[{kind:'footway',subtype:'sidewalk',pts:[]}],landuses:[]};
 let yields=0;
 const actual=await streetSourceInputCooperatively(ctx,()=>true,{budgetMs:0,yieldWork:async()=>{yields++;}});
 assert.deepEqual(actual,streetSourceInput(ctx)); assert.ok(yields>=700);
 assert.equal(actual.buildings.length,1);
 const received={roads:[],buildings:[],landuses:[],linearFeatures:[]};let messages=0;
 await sendStreetSourceInChunks(actual,async packet=>{
  structuredClone(packet);messages++;
  if(packet.type==='source-chunk'){assert.ok(packet.items.length<=256);received[packet.field].push(...packet.items);}
 },{yieldWork:async()=>{}});
 for(const field of Object.keys(received))assert.deepEqual(received[field],actual[field]);
 assert.equal(messages,6);
});

test('superseded source transfer stops sending without preparing partial coverage',async()=>{
 const input={roads:[1,2,3],buildings:[],landuses:[],linearFeatures:[],metersPerWorldUnit:1};
 let current=true;const packets=[];
 await assert.rejects(sendStreetSourceInChunks(input,async packet=>{packets.push(packet);},{chunkSize:1,current:()=>current,yieldWork:async()=>{current=false;}}),/superseded/);
 assert.deepEqual(packets.map(p=>p.type),['source-begin','source-chunk']);
});
