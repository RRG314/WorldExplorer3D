import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBodySafeCamera, vehicleCameraProbeRadius } from '../app/js/hud/vehicle-camera-body.js';
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
