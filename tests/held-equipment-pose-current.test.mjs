import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacterAnimationController} from '../app/js/character/animation/controller.js';
import {placeHand} from '../app/js/walking/held-equipment-pose.js';
import {createEquipmentVisuals} from '../app/js/urban-sandbox/equipment-visuals.js';
import {createPlayerCharacterHost} from '../app/js/walking/player-character-host.js';
import {updateCuratedCharacterAnimation} from '../app/js/walking/curated-explorer-character.js';

test('two-bone hand placement reaches its target under a rotated parent without changing arm length',()=>{
  const parent=new THREE.Group(),upper=new THREE.Bone(),lower=new THREE.Bone(),wrist=new THREE.Bone();
  parent.position.set(3,2,1);parent.rotation.y=.7;parent.add(upper);upper.add(lower);lower.add(wrist);lower.position.y=.24;wrist.position.y=.28;
  parent.updateMatrixWorld(true);
  const target=parent.localToWorld(new THREE.Vector3(.15,.25,.24)),pole=parent.localToWorld(new THREE.Vector3(-1,0,0));
  assert.equal(placeHand(THREE,upper,lower,wrist,target,pole),true);
  assert.ok(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-5);
  assert.equal(lower.position.y,.24);assert.equal(wrist.position.y,.28);
  placeHand(THREE,upper,lower,wrist,new THREE.Vector3(500,500,500),pole);
  assert.ok(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(upper.getWorldPosition(new THREE.Vector3()))<.521);
});

test('equipping a firearm selects armed animation and hands restores ordinary locomotion',async()=>{
  // No loader in this small unit test: verify the controller-animation contract,
  // while the real GLBs and attachment are covered by the browser scene.
  const character=createPlayerCharacterHost(THREE),scene=new THREE.Scene();scene.add(character);
  const hips=new THREE.Bone(),torso=new THREE.Bone();hips.name='Hips';torso.name='Torso';hips.add(torso);character.add(hips);
  const clips=['Idle','Walk','Idle_Gun_Pointing','Gun_Shoot','Punch_Right'].map(name=>new THREE.AnimationClip(name,1,[
    new THREE.NumberKeyframeTrack('Hips.position[x]',[0,1],[0,1]),
    new THREE.NumberKeyframeTrack('Torso.position[x]',[0,1],[0,1])
  ]));
  const controller=createCharacterAnimationController(THREE,character,clips);
  character.userData.characterAnimation=controller;
  const settle=moving=>{for(let i=0;i<60;i++)updateCuratedCharacterAnimation(character,moving,.016);};
  const oldWarn=console.warn;console.warn=()=>{};
  try {
    const equipment=createEquipmentVisuals(THREE,character);
    equipment.setEquipped('laser-gun');settle(false);assert.equal(controller.snapshot().weights['Idle_Gun_Pointing:aim'],1);
    settle(true);assert.equal(controller.snapshot().weights['Walk:walk:lower'],1);assert.equal(controller.snapshot().weights['Idle_Gun_Pointing:aim'],1);
    equipment.playUse({id:'laser-gun',category:'sidearm'});assert.equal(controller.snapshot().action,'fire');
    equipment.setEquipped('hands');assert.equal(controller.snapshot().action,null);settle(true);assert.equal(controller.snapshot().weights['Walk:walk:upper'],1);assert.equal(controller.snapshot().weights['Idle_Gun_Pointing:aim'],undefined);
    equipment.playUse({id:'hands',category:'unarmed'});assert.equal(controller.snapshot().action,'punch');
    assert.equal(controller.playEquipmentAction({category:'explosive'}),false);
    equipment.dispose();controller.dispose();await new Promise(resolve=>setTimeout(resolve,0));
  } finally {console.warn=oldWarn;}
});
