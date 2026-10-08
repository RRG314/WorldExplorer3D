'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {activeExpeditionPresence,requireExpeditionMembership}=require('../functions/expedition-room-access');
const timestamp=n=>({toMillis:()=>n});
const player=(extra={})=>({uid:'crew',lastSeenAt:timestamp(1000),expiresAt:timestamp(91000),...extra});
test('expedition admission requires a live issued seat, not just recent presence or ownership',()=>{
 assert.equal(activeExpeditionPresence(player(),'crew',2000),true);
 for(const p of [null,player({uid:'someone-else'}),player({expiresAt:null}),player({expiresAt:timestamp(2000)}),player({lastSeenAt:timestamp(99999)}),player({lastSeenAt:timestamp(-200000)})]){
  assert.equal(activeExpeditionPresence(p,'crew',2000),false);assert.throws(()=>requireExpeditionMembership({ownerUid:'crew'},p,'crew',2000));
 }
});
test('removed membership and deleted room remain denied, and a normal renewed seat succeeds',()=>{
 assert.throws(()=>requireExpeditionMembership(null,player(),'crew',2000),{status:404});
 assert.throws(()=>requireExpeditionMembership({},null,'crew',2000),{status:403});
 assert.doesNotThrow(()=>requireExpeditionMembership({},player(),'crew',2000));
 assert.throws(()=>requireExpeditionMembership({},player(),'crew',91000),{status:409});
 assert.doesNotThrow(()=>requireExpeditionMembership({},player({lastSeenAt:timestamp(92000),expiresAt:timestamp(182000)}),'crew',92000));
});
