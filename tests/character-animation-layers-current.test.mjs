import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacterAnimationController} from '../app/js/character/animation/controller.js';
function fixture(){
 const visual=new THREE.Group(),hips=new THREE.Bone(),torso=new THREE.Bone();hips.name='Hips';torso.name='Torso';visual.add(hips);hips.add(torso);
 const clip=(name,n)=>new THREE.AnimationClip(name,1,[new THREE.NumberKeyframeTrack('Hips.position[x]',[0,1],[0,n]),new THREE.NumberKeyframeTrack('Torso.position[x]',[0,1],[0,n])]);
 const clips=[clip('Idle',0),clip('Walk',1),clip('Run',2),clip('Wave',4),clip('Idle_Gun_Pointing',3),clip('HitRecieve',5)];
 return {visual,hips,torso,controller:createCharacterAnimationController(THREE,visual,clips)};
}
test('locomotion transitions blend smoothly and upper-body clip does not replace legs',()=>{
 const {controller}=fixture();controller.update({},.016);controller.update({moving:true},.016);
 const weights=controller.snapshot().weights;
 assert.ok(weights['Walk:walk:lower']>0&&weights['Walk:walk:lower']<1);
 assert.equal(controller.play('wave',1),true);
 for(let i=0;i<10;i++)controller.update({moving:true},.016);
 assert.equal(controller.snapshot().action,'wave');
 assert.ok(controller.snapshot().weights['Walk:walk:lower']>.5);
 assert.equal(controller.play('wave',1),false);
 for(let i=0;i<80;i++)controller.update({moving:true},.016);
 assert.equal(controller.snapshot().action,null);
});
test('instances have independent mixers and disposed controllers cannot animate',()=>{
 const a=fixture(),b=fixture();a.controller.play('wave',1);a.controller.update({moving:true},.1);b.controller.update({},.1);
 assert.equal(b.controller.snapshot().action,null);assert.notEqual(a.controller.mixer,b.controller.mixer);
 a.controller.dispose();assert.equal(a.controller.update({},.1),false);assert.equal(a.controller.play('wave',2),false);
 assert.equal(b.controller.update({},.1),true);
});
test('invalid frame deltas and unavailable clips do not poison the mixer',()=>{
 const {controller}=fixture();assert.equal(controller.play('throw',1),false);
 controller.update({moving:true,aiming:true,direction:'left'},NaN);
 assert.ok(Object.values(controller.snapshot().weights).every(Number.isFinite));
});
test('sanitized explorer bone names receive swim motion and release back to walking',()=>{
 const visual=new THREE.Group(),hips=new THREE.Bone(),chest=new THREE.Bone(),arm=new THREE.Bone();hips.name='Hips';chest.name='Chest';arm.name='UpperArmL';visual.add(hips);hips.add(chest);chest.add(arm);
 const idle=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack(arm.uuid+'.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
 const controller=createCharacterAnimationController(THREE,visual,[idle],{}, {swimming:true});
 for(let i=0;i<20;i++)controller.update({swimming:true,moving:true},.05);
 assert.ok(controller.snapshot().weights['Explorer_Swim:swim:upper']>.99);assert.ok(Math.abs(arm.quaternion.z)>.01);
 for(let i=0;i<30;i++)controller.update({swimming:false},.05);
 assert.equal(controller.snapshot().weights['Explorer_Swim:swim:upper'],undefined);assert.ok(Math.abs(arm.quaternion.z)<.01);
 controller.dispose();
});
