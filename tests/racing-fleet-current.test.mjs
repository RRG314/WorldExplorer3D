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

test('the real M3 derivative keeps its licensed identity, matching geometry, wheel pivots and cabin envelope',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const {RACING_FLEET_ASSETS}=await import('../app/js/assets/racing-fleet-assets.js');
 const {vehicleDefinitionById,PARKED_VEHICLE_CATALOG}=await import('../app/js/engine/vehicle-catalog.js');
 const {vehicleDriverCamera}=await import('../app/js/transport/vehicle-camera-mount.js');
 const asset=RACING_FLEET_ASSETS.find(a=>a.id==='road-bmw-m3-e46'),car=vehicleDefinitionById('bmw_m3_e46');
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/racing-fleet/asset-manifest.json',import.meta.url))),record=manifest.assets.find(a=>a.id===asset.id);
 const bytes=await readFile(new URL('..'+asset.url,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);assert.equal(bytes.length,asset.budgets.bytes);
 assert.equal(record.license,'CC-BY-4.0');assert.match(record.sourceArchiveSha256,/^[a-f0-9]{64}$/);
 assert.match(record.sourceUrl,/f1b00ff37d504629b10031da32bc7497$/);assert.match(record.sourceCredit,/Márcio Meireles/);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.equal(json.animations?.length||0,0);assert.equal(json.skins?.length||0,0);
 const spin=json.nodes.filter(n=>n.extras?.transportPart==='wheel-spin'),steering=json.nodes.filter(n=>n.extras?.transportPart==='wheel-steering');
 assert.equal(spin.length,4);assert.equal(steering.filter(n=>n.extras.front).length,2);
 assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-caliper').length,4);
 for(const n of steering)assert.ok(n.children.some(i=>json.nodes[i].extras?.transportPart==='wheel-spin'));
 assert.ok(!json.buffers.some(b=>b.uri));assert.ok(!(json.images||[]).some(i=>i.uri));
 assert.ok(record.triangles<=110000&&bytes.length<=7000000);assert.equal(car.length,4.493);
 assert.ok(asset.wheelLayout.every(w=>Math.abs(w.position[1]-w.radius)<.003));
 assert.equal(car.assetId,asset.id);assert.ok(!PARKED_VEHICLE_CATALOG.includes(car));assert.equal(vehicleDriverCamera(car).kind,'cabin');
});

test('real M3 purchase, selection and race admission share the canonical asset and debit exactly once',async()=>{
 const rows=new Map([['wallet',{credits:100000,currencyVersion:2}]]),runTransaction=fn=>fn({get:async key=>({exists:rows.has(key),data:()=>rows.get(key)}),set:(key,value)=>rows.set(key,structuredClone(value))});
 const input={action:'buy',vehicleId:'bmw_m3_e46',expectedRevision:0,requestId:'m3:buy',price:1};
 const args={runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt',uid:'driver',timestampFromMs:n=>n,nowMs:1000,input};
 const bought=await settleVehicleGarageAction(args);assert.equal(bought.credits,46000);assert.ok(bought.garage.vehicles.bmw_m3_e46);
 assert.equal((await settleVehicleGarageAction(args)).duplicate,true);assert.equal(rows.get('wallet').credits,46000);
 const {prepareVehicleGarageChange}=await import('../app/js/transport/vehicle-garage-rules.js');
 const selected=prepareVehicleGarageChange(bought.garage,{action:'select',vehicleId:'bmw_m3_e46',expectedRevision:bought.garage.revision}).garage;
 assert.equal(selected.selectedId,'bmw_m3_e46');assert.equal(require('../functions/generated/racing-engine.cjs').createRaceVehicleProfile('bmw_m3_e46').handling.assetId,'road-bmw-m3-e46');
});
