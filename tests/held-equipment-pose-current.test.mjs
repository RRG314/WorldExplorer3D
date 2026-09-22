import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {placeHand} from '../app/js/walking/held-equipment-pose.js';
import {createEquipmentVisuals} from '../app/js/urban-sandbox/equipment-visuals.js';
import {createFieldNavigatorMesh} from '../app/js/walking/field-navigator-mesh.js';
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
  const character=createFieldNavigatorMesh(THREE),scene=new THREE.Scene();scene.add(character);
  const actions=Object.fromEntries(['idle','walk','armedIdle','armedRun'].map(k=>[k,{setEffectiveWeight(w){this.weight=w;}}]));
  character.userData.characterMixer={update(){}};character.userData.characterActions=actions;
  const oldWarn=console.warn;console.warn=()=>{};
  try {
    const equipment=createEquipmentVisuals(THREE,character);
    equipment.setEquipped('laser-gun');updateCuratedCharacterAnimation(character,false,.016);assert.equal(actions.armedIdle.weight,1);
    updateCuratedCharacterAnimation(character,true,.016);assert.equal(actions.armedRun.weight,1);
    equipment.setEquipped('hands');updateCuratedCharacterAnimation(character,true,.016);assert.equal(actions.walk.weight,1);assert.equal(actions.armedRun.weight,0);
    equipment.dispose();await Promise.resolve();await Promise.resolve();
  } finally {console.warn=oldWarn;}
});
