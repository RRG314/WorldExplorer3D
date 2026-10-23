import test from 'node:test';
import assert from 'node:assert/strict';
import {streetSourceInput,streetSourceInputCooperatively,sendStreetSourceInChunks} from '../app/js/world/street-source-input.js';
import{prepareStreetPavement,compilePavementTile}from'../app/js/world/compiler/street-pavement.js';
import{roadWidthAtSegment}from'../app/js/world/road-cross-section-profile.js';

test('compact worker evidence preserves constrained widths, ground admission, mapped areas and crossing rules',()=>{
 const ring=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
 const tags={highway:'residential',sidewalk:'both','sidewalk:left:width':'6 ft','sidewalk:right:width':'invalid',foot:'',bridge:null,unknown_future_tag:'retained',_sourceFeatureId:'provider-detail'.repeat(500)};
 const road={width:8,type:'residential',metersPerWorldUnit:1,pts:[{x:-45,z:0},{x:0,z:0},{x:45,z:0}],structureSemantics:{terrainMode:'at_grade',gradeSeparated:false,rampCandidate:false,verticalGroup:'unused'.repeat(100)},transportRecord:{sourceTags:tags,crossSection:{widthMeters:8,lanes:2,placement:{centerlineOffsetMeters:1},widthSource:'mapped'}},resolvedCrossSection:{sourceWidthMeters:8,segmentWidthsMeters:new Float32Array([4,8]),segmentProfiles:[[],[]]}};
 const input={metersPerWorldUnit:1,METERS_PER_WORLD_UNIT:1,roads:[road,{...road,isStructureConnector:true},{...road,structureSemantics:{terrainMode:'elevated',gradeSeparated:true}}],buildings:[{pts:ring(4,8,12,12)}],landuses:[{pts:ring(-30,20,20,20),holes:[ring(-25,25,5,5)],tags:{'area:highway':'pedestrian',indoor:'',bridge:''}}],linearFeatures:[{kind:'footway',subtype:'sidewalk',width:2,pts:[{x:-40,z:6},{x:40,z:6}],sourceTags:{surface:'paved',_sourceFeatureId:'metadata'}},{kind:'footway',subtype:'crossing',width:3,pts:[{x:20,z:-10},{x:20,z:10}],sourceTags:{crossing:'',kerb:'lowered'},crossingNodes:[{tags:{'crossing:markings':'zebra'}}]}]};
 const original=structuredClone(input),compact=streetSourceInput(input),a=prepareStreetPavement(input),b=prepareStreetPavement(compact);
 assert.deepEqual(b.tiles.map(t=>t.key),a.tiles.map(t=>t.key));for(let i=0;i<a.tiles.length;i++)assert.deepEqual(compilePavementTile(b.tiles[i],1),compilePavementTile(a.tiles[i],1));
 for(const segment of [0,1])for(const t of [0,.1,.5,.9,1])assert.equal(roadWidthAtSegment(compact.roads[0],segment,t),roadWidthAtSegment(road,segment,t));
 assert.equal(roadWidthAtSegment(compact.roads[0],0,.5),4);assert.deepEqual(input,original);assert.ok(JSON.stringify(compact).length<JSON.stringify(input).length/2);
});

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
