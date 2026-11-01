import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceAuthority,readCommand} from '../services/racing/authority.mjs';
import {buildRaceRoadGraph,createRaceCourse,createRaceVehicleProfile,raceCourseKey} from '../services/racing/generated/engine.mjs';
import {createRaceConnection} from '../app/js/racing/network-client.js';
import {createRaceServer} from '../services/racing/transport.mjs';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
import {advanceRoadRaceFrame} from '../app/js/physics/road-race-delegate.js';
import {createRaceSession,racePhysicsVersion,raceRecordConfiguration,raceCompetitiveRecordConfiguration} from '../services/racing/generated/engine.mjs';
import {raceOnlineMetadata} from '../app/js/racing/driver-progress.js';
import {vrRaceStatus} from '../app/js/vr/race-status.js';
import {withinDeadline} from '../scripts/verification/owned-browser.mjs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../services/racing/package.json',import.meta.url)),WebSocket=require('ws');
const course=createRaceCourse(buildRaceRoadGraph([{sourceId:'controlled-road',a:{x:0,y:0,z:0},b:{x:0,y:0,z:250},widthMeters:8,driveable:true,supported:true}]),['controlled-road:forward'],{locationId:'controlled',locationLabel:'Controlled road',anchor:{lat:43,lon:7},participants:4});
const courseId=await raceCourseKey(course),profile=createRaceVehicleProfile('bmw_e34');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('credential acquisition keeps its deadline while frames pump and cannot open after owner replacement',async()=>{
 let clock=1700000000000,release,owner=true;const identity=new Promise(resolve=>release=resolve),errors=[],sockets=[];
 class Socket extends EventTarget{constructor(){super();this.readyState=0;sockets.push(this);}close(){this.readyState=3;}send(){}}
 const connection=createRaceConnection({uid:'driver',endpoint:'wss://example.test/race',credentials:()=>identity,join:{courseId},now:()=>clock,isCurrent:()=>owner,WebSocketClass:Socket,onError:r=>errors.push(r)});
 const pending=connection.connect();
 try{
  for(let i=0;i<20;i++){clock+=16;connection.pump();}
  assert.deepEqual(errors,[],'ordinary frames must not expire credentials before their deadline');
  release({idToken:'controlled',appCheckToken:'controlled'});await pending;assert.equal(sockets.length,1);
  owner=false;connection.pump();assert.equal(sockets[0].readyState,3);
 }finally{release({idToken:'controlled',appCheckToken:'controlled'});await pending;connection.stop();}
});
test('obsolete credential requests cannot open sockets after expiry or disposal',async()=>{
 for(const cancel of ['owner','deadline']){
  let clock=1700000000000,release,owner=true;const identity=new Promise(resolve=>release=resolve),errors=[],sockets=[];
  class Socket{constructor(){sockets.push(this);}close(){}}
  const connection=createRaceConnection({uid:'driver',endpoint:'wss://example.test/race',credentials:()=>identity,join:{courseId},now:()=>clock,isCurrent:()=>owner,WebSocketClass:Socket,onError:r=>errors.push(r)}),pending=connection.connect();
  if(cancel==='owner'){owner=false;connection.pump();}
  else{for(let i=0;i<6;i++){clock+=10001;connection.pump();}assert.deepEqual(errors,['race_reconnect_expired']);}
  release({idToken:'controlled',appCheckToken:'controlled'});await pending;await turn();assert.equal(sockets.length,0);connection.stop();
 }
});
test('shared grid-to-finish classes separate rear rows and changed grid lengths while preserving practice configuration',()=>{
 const front=raceCompetitiveRecordConfiguration(profile,{slot:0,participants:4});
 assert.deepEqual(front,raceCompetitiveRecordConfiguration(profile,{slot:1,participants:4}));
 assert.notDeepEqual(front,raceCompetitiveRecordConfiguration(profile,{slot:2,participants:4}));
 assert.notDeepEqual(front,raceCompetitiveRecordConfiguration(profile,{slot:0,participants:2}));
 assert.equal(raceRecordConfiguration(profile).gridRow,undefined);assert.throws(()=>raceCompetitiveRecordConfiguration(profile,{slot:4,participants:4}),/invalid/);
});
function fixture(overrides={}){
 let clock=0,settles=0,releases=0;
 const store={course:async id=>id===courseId?course:null,admit:async()=>({profile,label:'Explorer',leaseUntil:clock+15000}),renew:async()=>({leaseUntil:clock+15000}),
  releaseParticipant:async()=>{releases++;},release:async()=>{releases++;},standings:async()=>[],settle:async({snapshot})=>{settles++;return {id:snapshot.id};},...overrides};
 const authority=createRaceAuthority({store,now:()=>clock}),messages=new Map(),clients=new Map();
 const client=uid=>{const out=[];messages.set(uid,out);const c={uid,send:p=>out.push(p),close:()=>{},isOpen:()=>true};clients.set(uid,c);return c;};
 const command=(c,value)=>authority.command(c,JSON.stringify(value));
 const join=c=>command(c,{type:'join',roomCode:'RACE01',worldSeed:'controlled-world',courseId,vehicleId:'bmw_e34'});
 return {authority,client,messages,command,join,setClock:t=>clock=t,counts:()=>({settles,releases})};
}
test('two concurrent admissions publish one authority, finish on server controls, and acknowledge one durable result',async()=>{
 const f=fixture(),a=f.client('one'),b=f.client('two');await Promise.all([f.join(a),f.join(b)]);assert.equal(f.authority.snapshot().races,1);
 assert.equal(f.messages.get('one').at(-1).snapshot.players.length,2);
 await f.command(a,{type:'ready',ready:true});await f.command(b,{type:'ready',ready:true});await f.command(a,{type:'start'});
 let final;for(let ms=50,sequence=0;ms<30000;ms+=50,sequence++){
  f.setClock(ms);const previous=f.messages.get('one').at(-1).snapshot;
  for(const c of [a,b])if(['running','countdown'].includes(previous.phase)&&!previous.players.find(p=>p.uid===c.uid)?.progress?.finished)await f.command(c,{type:'control',sequence,actions:{throttle:c===a?1:.8}});
  f.authority.tick();await turn();final=f.messages.get('one').at(-1)?.snapshot;if(final?.settlement==='saved')break;
 }
 assert.equal(final.phase,'complete');assert.equal(final.players.length,2);assert.ok(final.players.every(p=>p.progress.finished));assert.equal(final.settlement,'saved');assert.equal(final.receipt.id,final.id);
 // Network packets already sent before a crossing can arrive before or after
 // the saved receipt. They cannot write the actor or replace result feedback.
 const saved=JSON.stringify(final);
 await f.command(a,{type:'control',sequence:10000,actions:{throttle:1}});
 f.authority.tick();await turn();assert.equal(f.counts().settles,1);assert.equal(f.authority.snapshot().races,0);
 await f.command(a,{type:'control',sequence:10001,actions:{throttle:1}});
 assert.equal(JSON.stringify(f.messages.get('one').at(-1).snapshot),saved);
 await assert.rejects(f.command(a,{type:'control',sequence:10002,actions:{throttle:2}}),/invalid_race_controls/);
 await assert.rejects(f.command(a,{type:'finish',elapsedMs:1}),/invalid_race_message/);
 await f.command(b,{type:'leave'});await f.join(b);
 assert.equal(f.messages.get('two').at(-1).snapshot.phase,'lobby');
 assert.notEqual(f.messages.get('two').at(-1).snapshot.id,final.id);
 const nextMessages=f.messages.get('two').length;
 await f.command(a,{type:'leave'});f.authority.detach(a);
 assert.equal(f.messages.get('two').length,nextMessages,'An old finish must not broadcast into a replacement lobby');
 assert.equal(f.authority.snapshot().connections,1);
 await f.authority.close();assert.equal(f.authority.snapshot().connections,0);
});
test('host departure keeps the server clock and the other driver; reconnect replaces only the old socket',async()=>{
 const f=fixture(),a=f.client('one'),b=f.client('two');await f.join(a);await f.join(b);await f.command(a,{type:'ready',ready:true});await f.command(b,{type:'ready',ready:true});await f.command(a,{type:'start'});
 f.setClock(100);f.authority.detach(b);const replacement=f.client('two');await f.join(replacement);f.authority.detach(b);
 await f.command(a,{type:'leave'});f.setClock(200);f.authority.tick();const state=f.messages.get('two').at(-1).snapshot;
 assert.equal(state.startAtMs,4000);assert.equal(state.players.find(p=>p.uid==='one').dnf,true);assert.equal(state.players.find(p=>p.uid==='two').disconnected,false);
 await f.authority.close();
});
test('exact ties share a place and a failed result acknowledgement retries the immutable crossing snapshot',async()=>{
 let first=null,calls=0;
 const f=fixture({settle:async({snapshot})=>{calls++;if(!first){first=structuredClone(snapshot);throw Error('commit_ack_lost');}assert.deepEqual(snapshot,first);return {id:snapshot.id};}}),a=f.client('one'),b=f.client('two');
 await f.join(a);await f.join(b);await f.command(a,{type:'ready',ready:true});await f.command(b,{type:'ready',ready:true});await f.command(a,{type:'start'});
 let result;for(let ms=50,sequence=0;ms<30000;ms+=50,sequence++){
  f.setClock(ms);const state=f.messages.get('one').at(-1).snapshot;
  for(const c of [a,b])if(['running','countdown'].includes(state.phase)&&!state.players.find(p=>p.uid===c.uid)?.progress?.finished)await f.command(c,{type:'control',sequence,actions:{throttle:1}});
  f.authority.tick();await turn();result=f.messages.get('one').at(-1).snapshot;if(result.settlement==='saved')break;
 }
 assert.equal(result.settlement,'saved');assert.equal(calls,2);assert.deepEqual(result.players.map(p=>p.position),[1,1]);assert.equal(result.players[0].progress.elapsedMs,result.players[1].progress.elapsedMs);await f.authority.close();
});
test('failed admission, late publication and forged pose/time messages cannot acquire a race or award',async()=>{
 for(const value of [{type:'control',sequence:1,actions:{throttle:1},pose:{z:250}},{type:'finish',elapsedMs:1},{type:'start',timeMs:2}])assert.throws(()=>readCommand(JSON.stringify(value)),/invalid/);
 const f=fixture({admit:async()=>{throw Error('race_room_presence_expired');}}),c=f.client('one');await assert.rejects(f.join(c),/presence_expired/);assert.equal(f.authority.snapshot().races,0);assert.equal(f.counts().settles,0);await f.authority.close();
 let release;const wait=new Promise(resolve=>release=resolve),g=fixture({admit:async()=>{await wait;return {profile,label:'Late',leaseUntil:15000};}}),late=g.client('late');let open=true;late.isOpen=()=>open;
 const pending=g.join(late);await turn();open=false;release();await assert.rejects(pending,/stopping/);assert.equal(g.authority.snapshot().races,0);assert.equal(g.counts().releases,1);await g.authority.close();
});
test('the actual socket rejects wrong origins/auth and carries an account-scoped browser connection',async()=>{
 const f=fixture(),store={course:async()=>course,admit:async()=>({profile,label:'Socket driver',leaseUntil:Date.now()+15000}),renew:async()=>({leaseUntil:Date.now()+15000}),release:async()=>{},releaseParticipant:async()=>{}};
 const service=createRaceServer({store,origins:['http://127.0.0.1:4000'],authenticate:async input=>{if(input.idToken!=='controlled-auth'||input.appCheckToken!=='controlled-appcheck')throw Error('bad');return {uid:'socket-driver',expiresAtMs:Date.now()+60000};}});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const endpoint=`ws://127.0.0.1:${service.server.address().port}/race`;
 let connected;const ready=new Promise(resolve=>connected=resolve),errors=[];
 class BrowserSocket extends WebSocket{constructor(url){super(url,{origin:'http://127.0.0.1:4000'});}}
 let owner=true,browserClock=Date.now();const connection=createRaceConnection({uid:'socket-driver',endpoint,physicsVersion:racePhysicsVersion(course),now:()=>browserClock,credentials:async()=>({idToken:'controlled-auth',appCheckToken:'controlled-appcheck'}),
  join:{roomCode:'RACE01',worldSeed:'controlled-world',courseId,vehicleId:'bmw_e34'},isCurrent:()=>owner,WebSocketClass:BrowserSocket,onSnapshot:connected,onError:r=>errors.push(r)});
 try{
  await connection.connect();const state=await withinDeadline(()=>ready,3000,'race socket admission');assert.equal(state.phase,'lobby');assert.equal(connection.connected(),true);assert.deepEqual(errors,[]);
  const denied=new WebSocket(endpoint,{origin:'https://unrelated.example'});denied.on('error',()=>{});assert.equal(await new Promise(resolve=>denied.once('unexpected-response',(_req,res)=>{resolve(res.statusCode);denied.terminate();})),403);
  const bad=new BrowserSocket(endpoint);await new Promise(resolve=>bad.once('open',resolve));bad.send(JSON.stringify({type:'authenticate',idToken:'wrong',appCheckToken:'wrong'}));assert.equal(await new Promise(resolve=>bad.once('close',code=>resolve(code))),1008);
  browserClock+=6000;connection.pump();assert.equal(connection.connected(),false,'a silent open socket must reconnect, not keep accepting stale controls');
  owner=false;connection.pump();assert.equal(connection.connected(),false);
 }finally{connection.stop();await service.close();await f.authority.close();}
});
test('idle sockets revalidate revocation without waiting for another driving command',async()=>{
 let clock=0,verifications=0;const service=createRaceServer({store:{},origins:['http://127.0.0.1:4000'],now:()=>clock,tickMs:5,peerTimeoutMs:60000,authenticate:async()=>{
  if(++verifications>1)throw Error('revoked');return {uid:'driver',expiresAtMs:100000};
 }});await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const socket=new WebSocket(`ws://127.0.0.1:${service.server.address().port}/race`,{origin:'http://127.0.0.1:4000'});socket.on('error',()=>{});
 try{await new Promise(resolve=>socket.once('open',resolve));socket.send(JSON.stringify({type:'authenticate',idToken:'controlled',appCheckToken:'controlled'}));await new Promise(resolve=>socket.once('message',resolve));
  clock=31000;assert.equal(await new Promise(resolve=>socket.once('close',code=>resolve(code))),1008);assert.equal(verifications,2);
 }finally{socket.close();await service.close();}
});
test('online frames use the existing road owner, wait for durable completion, and reject replacement worlds before writes',()=>{
 const session=createRaceSession({id:'network',course,creatorUid:'driver',createdAtMs:0});session.add({uid:'driver',profile});session.setReady('driver',true);session.start('driver',0);
 let state={...session.snapshot(),physicsVersion:racePhysicsVersion(course),profiles:{driver:raceRecordConfiguration(profile,{course})}};
 let controls=0,complete=0,stops=0;const c={worldPublication:{requestId:'one'},car:{x:0,y:1.12,z:10,personalVehicleId:'bmw_e34'},Walk:{state:{mode:'drive'}},activateSurfaceActivity(mode,p){assert.equal(mode,'drive');Object.assign(this.car,{x:p.x,y:p.y+1.12,z:p.z,angle:p.yaw});return true;}};
 let fresh=true;const connection={snapshot:()=>state,connected:()=>true,isFresh:()=>fresh,control:()=>controls++,stop:()=>stops++};
 const run=createNetworkRaceController({context:c,course,connection,uid:'driver',onComplete:()=>complete++});run.start();c.roadRaceController=run;
 assert.equal(advanceRoadRaceFrame(c,1/60,{throttle:1}),true);assert.equal(controls,1);
 fresh=false;advanceRoadRaceFrame(c,1/60,{throttle:1});assert.equal(controls,1);assert.equal(c.car.speed,0);assert.match(vrRaceStatus(c).message,/Reconnecting/);fresh=true;
 state={...state,phase:'complete',settlement:'pending'};advanceRoadRaceFrame(c,1/60,{throttle:1});assert.equal(c.car.speed,0);assert.equal(complete,0);
 state={...state,settlement:'saved'};advanceRoadRaceFrame(c,1/60,{});advanceRoadRaceFrame(c,1/60,{});assert.equal(complete,1);
 const before={...c.car};c.worldPublication={requestId:'replacement'};assert.equal(advanceRoadRaceFrame(c,1/60,{throttle:1}),false);assert.deepEqual(c.car,before);assert.equal(stops,1);
});
test('the Journal online adapter requires the server receipt for this exact player and time',()=>{
 const player={uid:'driver',vehicleId:'bmw_e34',position:1,barrierContacts:0,progress:{finished:true,elapsedMs:25000,penaltyMs:0,lapTimes:[25000]}};
 const result={id:'verified-run',discipline:'sprint',settlement:'saved',receipt:{id:'verified-run',players:[{uid:'driver',finished:true,timeMs:25000}]}};
 const options={courseId,recordKey:'race-online-'+'a'.repeat(32),physicsVersion:'earth-road-2026-10-28.2'};
 const metadata=raceOnlineMetadata(result,player,options);assert.equal(metadata.raceVerified,true);assert.equal(metadata.racingPracticeVersion,undefined);
 assert.throws(()=>raceOnlineMetadata({...result,settlement:'pending'},player,options),/receipt/);
 assert.throws(()=>raceOnlineMetadata(result,{...player,uid:'someone-else'},options),/receipt/);
 assert.throws(()=>raceOnlineMetadata(result,{...player,progress:{...player.progress,elapsedMs:1}},options),/receipt/);
});
