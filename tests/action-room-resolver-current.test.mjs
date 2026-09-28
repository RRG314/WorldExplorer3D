import test from 'node:test';
import {createInputSequenceLedger} from '../app/js/actions/input-sequence.js';
import assert from 'node:assert/strict';
import {createRoomActionResolver} from '../app/js/actions/room-action-resolver.js';
import {createEquipmentInventory} from '../app/js/urban-sandbox/equipment-model.js';
import {createPlayerConditionModel} from '../app/js/player/condition-model.js';
function fixture(obstacle = () => Infinity) {
 let time=1000;
 const actors=['a','b'].map((uid,i)=>({uid,epoch:'room-epoch-1',connected:true,worldId:'baltimore:1',poseAuthority:'room-simulation-v1',pose:{x:0,y:0,z:i*8},inventory:createEquipmentInventory(),condition:createPlayerConditionModel({storage:{}})}));
 actors[0].inventory.equip('pulse-sidearm');
 const resolver=createRoomActionResolver({worldId:'baltimore:1',getActors:()=>actors,firstObstacleDistance:obstacle,isWorldReady:()=>true,now:()=>time});
 const command=sequence=>({epoch:'room-epoch-1',sequence,direction:{x:0,y:0,z:1}});
 return {actors,resolver,command,setTime:t=>time=t};
}
test('attempt resolves server-owned victims and existing Backpack consumption exactly once',()=>{
 const {actors,resolver,command}=fixture();
 const first=resolver.attempt('a',command(1));assert.equal(first.targetUid,'b');
 assert.equal(actors[1].condition.snapshot().condition,.6599999999999999);
 const rounds=actors[0].inventory.snapshot().items.find(i=>i.id==='pulse-sidearm').magazine;
 assert.equal(rounds,11);assert.equal(resolver.attempt('a',command(1)),first);
 assert.equal(actors[0].inventory.snapshot().items.find(i=>i.id==='pulse-sidearm').magazine,11);
 assert.equal(resolver.drainEvents().filter(e=>e.type==='impact').length,1);
});
test('server geometry blocks hits and missing authority cannot be replaced with client poses',()=>{
 const {actors,resolver,command}=fixture(()=>2);
 assert.equal(resolver.attempt('a',command(1)).targetUid,null);assert.equal(actors[1].condition.snapshot().condition,1);
 actors[0].poseAuthority='client-presence';assert.equal(resolver.attempt('a',command(2)).reason,'not_admitted');
});
test('reject forged victims, NaN, old epochs, nonmembers and impossible action rates',()=>{
 const {resolver,command,setTime}=fixture();
 assert.equal(resolver.attempt('intruder',command(1)).reason,'not_admitted');
 assert.equal(resolver.attempt('a',{...command(1),targetUid:'b'}).reason,'invalid_attempt');
 assert.equal(resolver.attempt('a',{...command(1),direction:{x:NaN,y:0,z:1}}).reason,'invalid_attempt');
 assert.equal(resolver.attempt('a',{...command(1),epoch:'old'}).reason,'invalid_sequence');
 assert.equal(resolver.attempt('a',command(1)).accepted,true);
 setTime(1060);assert.equal(resolver.attempt('a',command(2)).reason,'cooldown');
 setTime(1310);assert.equal(resolver.attempt('a',command(3)).accepted,true);
});
test('disconnect and return do not reset receipt or health authority',()=>{
 const {actors,resolver,command}=fixture();const first=resolver.attempt('a',command(1));
 actors[0].connected=false;assert.equal(resolver.attempt('a',command(1)).reason,'not_admitted');
 actors[0].connected=true;assert.equal(resolver.attempt('a',command(1)),first);
 assert.equal(actors[1].condition.snapshot().percent,66);
});
test('melee requires range and an unobstructed path',()=>{
 const {actors,resolver,command,setTime}=fixture();actors[0].inventory.equip('baton');
 assert.equal(resolver.attempt('a',command(1)).targetUid,null);
 actors[1].pose.z=2;setTime(1700);assert.equal(resolver.attempt('a',command(2)).targetUid,'b');
});
test('throwable consumes once, resolves after fuse, then disposes bounded state',()=>{
 const {actors,resolver,command}=fixture(()=>0);actors[0].inventory.equip('concussion-charge');actors[1].pose.z=2;
 assert.equal(resolver.attempt('a',command(1)).accepted,true);
 assert.equal(resolver.snapshot().projectiles,1);assert.equal(actors[1].condition.snapshot().percent,100);
 // The occluder also blocks the blast: a successful visual throw is not a hit.
 for(let i=0;i<45;i++)resolver.step(.05);
 assert.equal(resolver.snapshot().projectiles,0);assert.equal(actors[1].condition.snapshot().percent,100);
 assert.equal(resolver.drainEvents().filter(e=>e.type==='detonation').length,1);
 resolver.dispose();assert.equal(resolver.attempt('a',command(2)).accepted,false);
});
test('cooldown-rejected sequence cannot become a second accepted action after time passes',()=>{
 const {resolver,command,setTime}=fixture();resolver.attempt('a',command(1));
 const rejected=resolver.attempt('a',command(2));setTime(9000);
 assert.equal(resolver.attempt('a',command(2)),rejected);
});

test('replacing a pose record cannot replay a previously consumed action',()=>{
 const {actors,resolver,command,setTime}=fixture();const first=resolver.attempt('a',command(1));
 actors[0]={...actors[0],pose:{...actors[0].pose}};setTime(5000);
 assert.equal(resolver.attempt('a',command(1)),first);
 assert.equal(actors[0].inventory.snapshot().items.find(i=>i.id==='pulse-sidearm').magazine,11);
 assert.equal(resolver.attempt('a',null).reason,'invalid_attempt');
 actors[0].epoch='new';assert.equal(resolver.attempt('a',{...command(2),epoch:'new'}).reason,'session_epoch_conflict');
 assert.equal(resolver.releaseSession('a','wrong'),false);
 assert.equal(resolver.releaseSession('a','room-epoch-1'),true);
 assert.equal(resolver.attempt('a',{...command(2),epoch:'new'}).accepted,true);
});

test('receipt storage is bounded without making evicted sequences executable again',()=>{
 const ledger=createInputSequenceLedger({maxSessions:2,maxReceipts:2});
 for(let sequence=0;sequence<4;sequence++)ledger.lookup('a','epoch',sequence).commit({accepted:true});
 assert.deepEqual(ledger.snapshot(),{sessions:1,receipts:2});
 assert.equal(ledger.lookup('a','epoch',0).reason,'stale_sequence');
 ledger.lookup('b','epoch',0).commit({accepted:false});
 assert.equal(ledger.lookup('c','epoch',0).reason,'session_budget');
 assert.equal(ledger.release('a','other'),false);
 ledger.clear();assert.deepEqual(ledger.snapshot(),{sessions:0,receipts:0});
});
