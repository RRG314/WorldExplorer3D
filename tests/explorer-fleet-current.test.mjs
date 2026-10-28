import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EXPLORER_FLEET_ASSETS} from '../app/js/assets/explorer-fleet-assets.js';
import {PARKED_VEHICLE_CATALOG,vehicleDefinitionById,vehicleHandlingProfile} from '../app/js/engine/vehicle-catalog.js';
import {hashText,stableVehicleDefinition} from '../app/js/urban-sandbox/vehicle-model.js';
import {publishedRoomVehicleDefinition,reconcilePublishedRoomVehicles} from '../app/js/urban-sandbox/room-vehicle-reconciliation.js';
import {updateVehicleWheels} from '../app/js/transport/vehicle-wheel-motion.js';

test('derived fleet preserves source rights, binary identity, bounded local textures and moving parts',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../app/assets/models/vehicles/explorer-fleet/asset-manifest.json',import.meta.url)));
  assert.equal(EXPLORER_FLEET_ASSETS.length,7);
  for(const asset of EXPLORER_FLEET_ASSETS){
    const source=manifest.assets.find(a=>a.id===asset.id),bytes=await readFile(new URL(`..${asset.url}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
    assert.match(source.sourceArchiveSha256,/^[a-f0-9]{64}$/);
    assert.equal(asset.license,'CC-BY-4.0');assert.ok(source.sourceCredit);assert.equal(bytes.length,asset.budgets.bytes);
    assert.ok(asset.budgets.triangles<=110000);assert.ok(bytes.length<7000000);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok((json.buffers||[]).every(b=>!b.uri));assert.ok((json.images||[]).every(i=>!i.uri));
    const parts=(json.nodes||[]).filter(n=>n.extras?.transportPart==='wheel-spin');
    if(asset.roles.includes('road-vehicle-presentation')){
      assert.equal(parts.length,4,asset.id);assert.equal(asset.rigPolicy,'preserve-parts');
      for(const wheel of asset.wheelLayout){assert.ok(Math.abs(wheel.position[0])>asset.dimensionsMeters.width*.25);assert.ok(wheel.radius>.18&&wheel.radius<.55);}
    }
    if(asset.id==='aircraft-cessna-172')assert.equal(json.nodes.filter(n=>n.extras?.aircraftRotor==='propeller').length,1);
  }
});

test('new cars use distinct existing handling profiles and both Cadillac labels reconcile in rooms',()=>{
  const ids=['delorean','cadillac_coupe','cadillac_fleetwood','golf_ii','datsun_280z'];
  for(const id of ids){
    const car=vehicleDefinitionById(id),handling=vehicleHandlingProfile(id);
    assert.equal(car.id,id);assert.equal(car.playable,true);assert.ok(handling.wheelBase>2&&handling.wheelBase<3.6);
    assert.ok(handling.halfTrack>.5&&handling.halfTrack<1.1);
    const entity={entityId:'room:'+id,kind:'vehicle',style:car.bodyStyle,label:car.label,pose:{x:1,y:2,z:3,yaw:0}};
    assert.equal(publishedRoomVehicleDefinition(entity).variant.id,id);
  }
  assert.ok(vehicleHandlingProfile('golf_ii').steeringScale>vehicleHandlingProfile('cadillac_fleetwood').steeringScale);
  assert.ok(vehicleHandlingProfile('datsun_280z').accelerationScale>vehicleHandlingProfile('cadillac_coupe').accelerationScale);
});

test('adding real cars never reuses a legacy parked-car identity for a different model',()=>{
  const legacy=PARKED_VEHICLE_CATALOG.filter(v=>!v.assetId),seen=new Set();
  for(let i=0;i<300;i++){
    const key='edge:'+i,seed=hashText(`city:${key}:0`),oldId=`urban-vehicle:${hashText(`city:${key}:0:vehicle`).toString(16)}`;
    const car=stableVehicleDefinition('city',key);
    if(car.variant.assetId){assert.notEqual(car.id,oldId);seen.add(car.variant.id);}
    else {assert.equal(car.id,oldId);assert.equal(car.variant.id,legacy[seed%legacy.length].id);}
  }
  assert.equal(seen.size,5);
});

test('wheel presentation follows distance/radius, reverses and steers only front pivots',()=>{
  const make=front=>({rotation:{x:0},userData:{radiusMeters:.3},parent:{rotation:{y:0},userData:{front}}});
  const front=make(true),rear=make(false),wheels=[front,rear];
  updateVehicleWheels(wheels,.3,.4);assert.equal(front.rotation.x,1);assert.equal(front.parent.rotation.y,.4);assert.equal(rear.parent.rotation.y,0);
  updateVehicleWheels(wheels,-.3,0);assert.equal(front.rotation.x,0);assert.equal(front.parent.rotation.y,0);
  updateVehicleWheels(wheels,NaN,1);assert.equal(front.rotation.x,0);
  for(let i=0;i<10000;i++)updateVehicleWheels(wheels,1,.2);
  assert.ok(Math.abs(front.rotation.x)<Math.PI*2);
});

test('room publication keeps its car when a new fleet changes this client traffic seed',()=>{
  const car=vehicleDefinitionById('cadillac_fleetwood');
  const entity={entityId:'shared-car',kind:'vehicle',style:car.bodyStyle,label:car.label,pose:{x:10,y:2,z:3,yaw:0}};
  const obsolete={id:entity.entityId,variant:vehicleDefinitionById('sedan'),ambientTraffic:true};
  const state={vehicles:[obsolete],remoteEntities:new Map([[entity.entityId,entity]]),budget:5},disposed=[];
  reconcilePublishedRoomVehicles(state,{reference:{x:0,z:0},disposeVehicle:v=>disposed.push(v.id),createVehicle:d=>d});
  assert.deepEqual(disposed,['shared-car']);assert.equal(state.vehicles.length,1);assert.equal(state.vehicles[0].variant.id,'cadillac_fleetwood');
});
