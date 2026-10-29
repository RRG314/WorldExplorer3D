import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {RACING_FLEET_ASSETS} from '../app/js/assets/racing-fleet-assets.js';
import {vehicleDefinitionById,PARKED_VEHICLE_CATALOG,vehicleHandlingProfile} from '../app/js/engine/vehicle-catalog.js';
import {prepareVehicleGarageChange,personalVehicleIdentity} from '../app/js/transport/vehicle-garage-rules.js';
import {vehicleDriverCamera} from '../app/js/transport/vehicle-camera-mount.js';
const require=createRequire(import.meta.url),{settleVehicleGarageAction}=require('../functions/economy-authority.js');

test('racing fleet is self-contained, hash-pinned, within the admitted envelope and retains four working wheel groups',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/racing-fleet/asset-manifest.json',import.meta.url)));
 for(const asset of RACING_FLEET_ASSETS){
  const record=manifest.assets.find(r=>r.id===asset.id),bytes=await readFile(new URL('..'+asset.url,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);assert.equal(bytes.length,asset.budgets.bytes);
  assert.match(record.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(record.license,'CC0-1.0');assert.ok(record.sourceCredit);
  assert.ok(record.budgets.triangles<110000&&bytes.length<7000000);assert.ok(record.dimensionsMeters.width<=2.35);
  const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());
  assert.equal(json.animations?.length||0,0);assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-spin'&&n.children?.length).length,4);
  assert.equal(json.nodes.filter(n=>n.extras?.transportPart==='wheel-steering'&&n.extras.front).length,2);
  assert.ok(!json.buffers.some(b=>b.uri));assert.ok(!(json.images||[]).some(i=>i.uri));
  assert.equal(asset.wheelLayout.length,4);assert.ok(asset.wheelLayout.every(w=>w.radius>.18&&w.radius<.55));
  const car=vehicleDefinitionById(asset.vehicleVariantIds[0]);assert.equal(car.assetId,asset.id);assert.ok(!PARKED_VEHICLE_CATALOG.includes(car));
  assert.equal(vehicleDriverCamera(car).kind,'cabin');
 }
});

test('all three racing cars use canonical paid ownership and their distinct handling reaches the shared race engine',async()=>{
 const rows=new Map(),runTransaction=async fn=>{const changes=new Map(),result=await fn({get:async k=>({exists:rows.has(k),data:()=>structuredClone(rows.get(k))}),set:(k,v)=>changes.set(k,structuredClone(v))});for(const [k,v]of changes)rows.set(k,v);return result;};
 const {personalVehicleById}=require('../functions/generated/vehicle-garage-rules.cjs');
 const service=require('../functions/generated/racing-engine.cjs');
 let garage=null;
 for(const id of ['meridian_gt','apex_clubsport','kestrel_rally']){
  const definition=personalVehicleById(id);assert.ok(definition.price>0);
  const input={action:'buy',vehicleId:id,expectedRevision:garage?.revision||0,requestId:'fleet:'+id,price:1};
  const args={rows,runTransaction,walletRef:'wallet',progressRef:'progress',receiptRef:'receipt:'+id,uid:'driver',timestampFromMs:n=>n,nowMs:1000,input};
  const result=await settleVehicleGarageAction(args);garage=result.garage;
  assert.ok(garage.vehicles[id]);assert.equal((await settleVehicleGarageAction(args)).duplicate,true);
  assert.equal(service.createRaceVehicleProfile(id).handling.assetId,definition.assetId);
  const selected=prepareVehicleGarageChange(garage,{action:'select',vehicleId:id,expectedRevision:garage.revision}).garage;
  assert.equal(selected.selectedId,id);assert.match(personalVehicleIdentity(id),/^personal-vehicle:/);
 }
 assert.equal(rows.get('wallet').credits,1000000-78000-98000-44000);
 assert.ok(vehicleHandlingProfile('apex_clubsport').accelerationScale>vehicleHandlingProfile('meridian_gt').accelerationScale);
 assert.ok(vehicleHandlingProfile('meridian_gt').brakeScale>vehicleHandlingProfile('sedan').brakeScale);
});
