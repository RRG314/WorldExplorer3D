import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createShipMeshNavigation} from '../app/js/boat-mode/research/mesh-navigation.js';
import {createResearchLocomotion,researchCameraHeight} from '../app/js/boat-mode/research/locomotion.js';
function setup(ceiling=false){
 const root=new THREE.Group();
 const box=(w,h,d,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));mesh.position.set(x,y,z);root.add(mesh);};
 box(10,.2,20,0,1.9,0);box(.2,3,20,4.5,3.5,0);
 if(ceiling)box(10,.2,20,0,4.1,0);
 const nav=createShipMeshNavigation(THREE,root),motor=createResearchLocomotion(nav,{x:0,y:2,z:0,yaw:0});
 return {nav,motor};
}
test('deck jump is ballistic, lands on the deck, and holding jump does not bounce',()=>{
 const {motor}=setup();let peak=2,airborne=0;
 for(let i=0;i<240;i++){const s=motor.update(1/120,{jump:1});peak=Math.max(peak,s.pose.y);if(!s.grounded)airborne++;}
 assert.ok(peak>2.85&&peak<3.1);assert.ok(airborne>85&&airborne<120);
 assert.equal(motor.snapshot().grounded,true);assert.ok(Math.abs(motor.snapshot().pose.y-2)<1e-6);
 motor.update(.016,{});assert.equal(motor.update(.016,{jump:1}).grounded,false);
});
test('a low ceiling stops ascent without passing through the next deck',()=>{
 const {motor}=setup(true);let peak=2;
 for(let i=0;i<150;i++)peak=Math.max(peak,motor.update(1/120,{jump:1}).pose.y);
 assert.ok(peak>2.1&&peak<2.3);assert.equal(motor.snapshot().grounded,true);
});
test('running is faster than walking, diagonals normalize and walls stop airborne travel',()=>{
 const a=setup(),b=setup(),c=setup();
 for(let i=0;i<60;i++){a.motor.update(1/60,{move:1});b.motor.update(1/60,{move:1,sprint:1});c.motor.update(1/60,{move:1,strafe:1,sprint:1});}
 assert.ok(Math.abs(a.motor.snapshot().pose.z-2.2)<1e-6);assert.ok(Math.abs(b.motor.snapshot().pose.z-3.8)<1e-6);
 assert.ok(Math.abs(Math.hypot(c.motor.snapshot().pose.x,c.motor.snapshot().pose.z)-3.8)<1e-6);
 const {motor}=setup();for(let i=0;i<240;i++)motor.update(1/120,{strafe:-1,sprint:1,jump:i%120<60?1:0});
 assert.ok(motor.snapshot().pose.x<4.2);
});
test('stairs filter only the camera and are stable across frame rates; paused motion stays frozen',()=>{
 const {motor}=setup();motor.update(.016,{jump:1});const state=motor.snapshot();motor.update(0,{move:1,jump:0});assert.deepEqual(motor.snapshot(),state);
 const samples=[];for(const hz of [30,60,120]){let y=2;for(let i=0;i<hz;i++)y=researchCameraHeight(y,2.3,1/hz);samples.push(y);}
 assert.ok(Math.max(...samples)-Math.min(...samples)<1e-10);
 assert.ok(researchCameraHeight(2,2.3,1/60)-2<.07);
});
test('mouse/gamepad look rotates the heading used for movement and clamps pitch',()=>{
 const {motor}=setup();motor.look(Math.PI/2,20);assert.equal(motor.snapshot().pose.pitch,1.2);
 const before=motor.snapshot().pose;motor.update(.05,{move:1});const after=motor.snapshot().pose;
 assert.ok(after.x>before.x);assert.ok(Math.abs(after.z-before.z)<1e-8);
 motor.update(.05,{lookPitch:-1});assert.ok(motor.snapshot().pose.pitch<1.2);
});
