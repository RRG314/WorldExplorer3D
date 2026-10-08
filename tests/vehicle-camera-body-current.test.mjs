import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBodySafeCamera, vehicleCameraProbeRadius, vehicleRoofOrbitPoint, vehicleClearanceLookTarget } from '../app/js/hud/vehicle-camera-body.js';
import {setCabinNearClip} from '../app/js/hud/driving-cabin-camera.js';

test('cabin near plane is scoped and restored without per-frame projection churn',()=>{
 const camera={near:.5,userData:{},updates:0,updateProjectionMatrix(){this.updates++;}};
 setCabinNearClip(camera,true);setCabinNearClip(camera,true);
 assert.equal(camera.near,.04);assert.equal(camera.updates,1);
 setCabinNearClip(camera,false);setCabinNearClip(camera,false);
 assert.equal(camera.near,.5);assert.equal(camera.updates,2);
});
test('returning from cabin prefers safe chase destination over roof fallback',()=>{
 const target={x:0,y:5,z:-10},roof={x:0,y:2.1,z:0};
 assert.equal(selectBodySafeCamera({x:0,y:1,z:0},[target,roof],body,()=>true).point,target);
});

const body = { contains: p => Math.abs(p.x) < 1.4 && p.y < 2 && Math.abs(p.z) < 2.8 };
test('camera clearance includes near-plane corners and follows viewport aspect', () => {
  const wide = vehicleCameraProbeRadius({near:.5,fov:70,aspect:16/9});
  const phone = vehicleCameraProbeRadius({near:.5,fov:70,aspect:390/844});
  assert.ok(wide > .85 && phone > .6 && wide > phone);
});
test('automatic cabin clipping never changes the following chase clearance decision', () => {
  const camera={near:.5,fov:70,aspect:16/9,userData:{},updateProjectionMatrix(){}};
  const radius=vehicleCameraProbeRadius(camera);
  for(let frame=0;frame<20;frame++) {
    setCabinNearClip(camera,true);
    assert.equal(vehicleCameraProbeRadius(camera),radius);
    setCabinNearClip(camera,false);
    assert.equal(vehicleCameraProbeRadius(camera),radius);
  }
});
test('roof clearance view looks along the requested heading, including reverse, beyond the car', () => {
  const anchor={x:12,y:3,z:-4};
  for(const angle of [-2.4,0,1.2,Math.PI]) {
    const point=vehicleClearanceLookTarget(anchor,angle);
    assert.ok(Math.abs(Math.hypot(point.x-anchor.x,point.z-anchor.z)-8)<1e-9);
    assert.ok(Math.abs(Math.atan2(point.x-anchor.x,point.z-anchor.z)-angle)<1e-9);
    assert.equal(point.y,3.8);
  }
  assert.ok(vehicleClearanceLookTarget(anchor,0,.5).y>3.8);
});
test('a shortened boom inside the BMW chooses a clear external pose', () => {
  const roof = { x: 0, y: 2.1, z: 0 };
  assert.deepEqual(selectBodySafeCamera({ x: 0, y: 1, z: -1 }, [roof], body, () => true),
    { point: roof, mode: 'clearance-chase' });
});
test('a low roof cannot push the exterior camera back into the vehicle', () => {
  const result = selectBodySafeCamera({ x: 0, y: 1, z: -1 }, [{ x: 0, y: 2.1, z: 0 }], body, () => false);
  assert.equal(result.point, null);
  assert.equal(result.mode, 'clearance-first-person');
});
test('a normal rear view is preserved and resumes after the obstruction', () => {
  const desired = { x: 0, y: 2, z: -6 };
  assert.deepEqual(selectBodySafeCamera(desired, [], body, () => false), { point: desired, mode: 'chase' });
});

test('roof clearance preserves requested orbit heading and avoids a vertical chase view', () => {
  const roof={x:12,y:3,z:-4};
  for(const angle of [-2.4,-1.2,0,1.2,2.4]) {
    const point=vehicleRoofOrbitPoint(roof,angle);
    assert.ok(Math.abs(Math.hypot(point.x-roof.x,point.z-roof.z)-2)<1e-9);
    assert.ok(Math.abs(Math.atan2(roof.x-point.x,roof.z-point.z)-angle)<1e-9);
    assert.equal(point.y,roof.y);
  }
});
