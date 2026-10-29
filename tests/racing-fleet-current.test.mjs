import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {personalVehicleById,normalizeVehicleGarage} from '../app/js/transport/vehicle-garage-rules.js';
const require=createRequire(import.meta.url),{settleVehicleGarageAction}=require('../functions/economy-authority.js');

test('withdrawn racing prototypes cannot debit a wallet or mutate the real vehicle garage through a stale client',async()=>{
 const original=normalizeVehicleGarage(null),writes=[];
 const runTransaction=fn=>fn({get:async key=>({exists:key!=='receipt',data:()=>key==='progress'?{garage:original}:key==='wallet'?{credits:100000}:null}),set:(...args)=>writes.push(args)});
 for(const vehicleId of ['meridian_gt','apex_clubsport','kestrel_rally']){
  assert.equal(personalVehicleById(vehicleId),null);
  await assert.rejects(settleVehicleGarageAction({runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,input:{action:'buy',vehicleId,expectedRevision:0,requestId:'withdrawn:'+vehicleId}}),/vehicle_not_available/);
 }
 assert.deepEqual(writes,[]);assert.deepEqual(original,normalizeVehicleGarage(null));
 assert.equal(personalVehicleById('bmw_e34').assetId,'vehicle-bmw-525i-e34');
 assert.equal(require('../functions/generated/vehicle-garage-rules.cjs').personalVehicleById('bmw_e34').price,0);
});
