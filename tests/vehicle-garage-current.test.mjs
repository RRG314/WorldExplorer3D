import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {normalizeVehicleGarage,prepareVehicleGarageChange,PERSONAL_VEHICLES} from '../app/js/transport/vehicle-garage-rules.js';
import {createLocalCommerceModel} from '../app/js/urban-sandbox/commerce-model.js';
const require=createRequire(import.meta.url),{settleVehicleGarageAction,settleCommerceOutcome}=require('../functions/economy-authority.js');
function storage(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};}
function server(){const rows=new Map(),walletRef='wallet',progressRef='progress';
 const runTransaction=async fn=>{const changes=new Map(),result=await fn({get:async key=>({exists:rows.has(key),data:()=>structuredClone(rows.get(key))}),set:(k,v)=>changes.set(k,structuredClone(v))});for(const [k,v]of changes)rows.set(k,v);return result;};
 return {rows,walletRef,progressRef,runTransaction,uid:'me',timestampFromMs:n=>n,nowMs:1000};}
const buy={action:'buy',vehicleId:'delorean',expectedRevision:0};
test('the garage starts with BMW only and offers everyday, utility, transit and classic choices',()=>{
 const garage=normalizeVehicleGarage();assert.deepEqual(Object.keys(garage.vehicles),['bmw_e34']);
 for(const category of ['compact','sedan','suv','pickup','van','bus','box-truck'])assert.ok(PERSONAL_VEHICLES.some(v=>v.category===category));
 assert.throws(()=>prepareVehicleGarageChange(garage,{...buy,action:'select'}),/not_owned/);
 assert.throws(()=>normalizeVehicleGarage({schemaVersion:9}),/Unsupported/);
});
test('local vehicle purchase and wallet debit persist atomically through the existing Backpack store',()=>{
 const saved=storage(),commerce=createLocalCommerceModel({storage:saved});const before=commerce.wallet().credits;
 const result=commerce.changeVehicleGarage(buy);assert.equal(result.ok,true);assert.equal(commerce.wallet().credits,before-55000);
 const reload=createLocalCommerceModel({storage:saved});assert.ok(reload.vehicleGarage().vehicles.delorean);assert.equal(reload.wallet().credits,before-55000);
 assert.equal(reload.changeVehicleGarage({...buy,expectedRevision:1}).ok,false);
 assert.equal(reload.wallet().credits,before-55000);
});
test('a failed save cannot grant a car or debit the wallet',()=>{
 const saved=storage(),commerce=createLocalCommerceModel({storage:saved});saved.setItem=()=>{throw Error('disk full');};
 const result=commerce.changeVehicleGarage(buy);assert.equal(result.ok,false);assert.equal(commerce.wallet().credits,1000000);assert.equal(commerce.vehicleGarage().vehicles.delorean,undefined);
});
test('vehicle selection, home custody and condition retain stable records and reject stale/foreign changes',()=>{
 let garage=prepareVehicleGarageChange(null,buy).garage;
 assert.throws(()=>prepareVehicleGarageChange(garage,{...buy,action:'select'}),/changed/);
 assert.throws(()=>prepareVehicleGarageChange(garage,{action:'home',vehicleId:'delorean',expectedRevision:1,homeId:'other'}),/not_owned/);
 garage=prepareVehicleGarageChange(garage,{action:'home',vehicleId:'delorean',expectedRevision:1,homeId:'mine'},{ownsHome:id=>id==='mine'}).garage;
 garage=prepareVehicleGarageChange(garage,{action:'park',vehicleId:'delorean',expectedRevision:2,condition:.6}).garage;
 garage=prepareVehicleGarageChange(garage,{action:'park',vehicleId:'delorean',expectedRevision:3,condition:1}).garage;
 assert.equal(garage.vehicles.delorean.condition,.6);assert.equal(garage.vehicles.delorean.homeId,'mine');
});
test('server purchase is receipt-idempotent, uses canonical price and preserves old upgrades',async()=>{
 const s=server();s.rows.set('progress',{vehicles:{'legacy-car':{'engine-tune':2}}});
 const input={...buy,requestId:'garage:one',price:1,credits:999999};
 const a=await settleVehicleGarageAction({...s,receiptRef:'receipt:one',input});
 const b=await settleVehicleGarageAction({...s,receiptRef:'receipt:one',input});
 assert.equal(a.credits,945000);assert.equal(b.duplicate,true);assert.equal(s.rows.get('wallet').credits,945000);
 assert.equal(s.rows.get('progress').vehicles['legacy-car']['engine-tune'],2);
 await assert.rejects(settleVehicleGarageAction({...s,receiptRef:'receipt:one',input:{...input,vehicleId:'golf_ii'}}),/conflict/);
 await assert.rejects(settleVehicleGarageAction({...s,receiptRef:'receipt:two',input:{...input,expectedRevision:1}}),/already_owned/);
});
test('the server rejects unowned homes and insufficient funds without partial writes',async()=>{
 const s=server();s.rows.set('wallet',{currencyVersion:2,credits:1});
 await assert.rejects(settleVehicleGarageAction({...s,receiptRef:'receipt',input:{...buy,requestId:'garage:low'}}),/not_enough/);assert.equal(s.rows.has('progress'),false);
 s.rows.set('progress',{garage:prepareVehicleGarageChange(null,buy).garage});s.rows.set('home',{ownerUid:'other'});
 await assert.rejects(settleVehicleGarageAction({...s,receiptRef:'receipt',propertyRef:'home',input:{action:'home',vehicleId:'delorean',homeId:'home',expectedRevision:1,requestId:'garage:home'}}),/not_owned/);
});
test('settled upgrades preserve the garage and paid repairs update the owned condition once',async()=>{
 const s=server(),garage=prepareVehicleGarageChange(null,buy).garage;garage.vehicles.delorean.condition=.4;
 s.rows.set('progress',{garage,vehicles:{}});
 const invoke=(receiptRef,input)=>settleCommerceOutcome({...s,playerProgressRef:s.progressRef,receiptRef,input});
 s.rows.set('upgrade',{requestId:'upgrade',action:'service',accepted:true,settlementStatus:'effect_pending',catalogId:'vehicle-upgrade:engine-tune:1',targetId:'personal-vehicle:delorean'});
 await invoke('upgrade',{requestId:'upgrade',outcome:'applied'});assert.ok(s.rows.get('progress').garage.vehicles.delorean);
 s.rows.set('repair',{requestId:'repair',action:'service',accepted:true,settlementStatus:'effect_pending',catalogId:'vehicle-full-repair',targetId:'personal-vehicle:delorean'});
 await invoke('repair',{requestId:'repair',outcome:'applied'});assert.equal(s.rows.get('progress').garage.vehicles.delorean.condition,1);
 assert.equal((await invoke('repair',{requestId:'repair',outcome:'applied'})).duplicate,true);
 assert.equal(s.rows.get('progress').vehicles['personal-vehicle:delorean']['engine-tune'],1);
});

test('per-frame upgrade readers retain the current account projection; explicit auth changes replace it',async()=>{
 const {ensureVehicleUpgradeStore}=await import('../app/js/transport/vehicle-upgrades.js');
 const context={},saved=storage(),account=ensureVehicleUpgradeStore(context,{ownerUid:'one',storage:saved});
 account.hydrateGarage({schemaVersion:1,revision:3,vehicles:{delorean:{condition:.7}}});
 assert.equal(ensureVehicleUpgradeStore(context),account);assert.ok(context.vehicleUpgradeStore.garageSnapshot().vehicles.delorean);
 const guest=ensureVehicleUpgradeStore(context,{ownerUid:'',storage:saved});assert.notEqual(guest,account);assert.equal(guest.ownerUid,'');
 assert.equal(guest.garageSnapshot().vehicles.delorean,undefined);
});
