import test from 'node:test';
import assert from 'node:assert/strict';
import {createXrActionInput,mergeXrActions} from '../app/js/vr/xr-input.js';
const source=(handedness,axes=[0,0,0,0],trigger=0)=>({handedness,gamepad:{mapping:'xr-standard',connected:true,axes,buttons:[{value:trigger},{value:0},{value:0,touched:false}]}});
test('XR input must return to neutral after entry, pause and source replacement',()=>{
  const input=createXrActionInput(),held=[source('right',undefined,1)];
  input.update(held,true);assert.equal(input.read('drive'),null);
  input.update([source('left'),source('right')],true);input.update(held,true);assert.equal(input.read('drive').throttle,1);
  input.update(held,false);input.update(held,true);assert.equal(input.read('drive'),null);
  input.reset();assert.equal(input.snapshot().armed,false);
});
test('standard controller slots produce distinct car, aircraft and walking actions',()=>{
  const input=createXrActionInput();input.update([],true);
  input.update([source('left',[0,0,-1,0],.4),source('right',[0,0,0,-1],.8)],true);
  assert.deepEqual(input.read('drive'),{turn:1,steer:1,move:-0,throttle:.8,reverse:0,serviceBrake:.4});
  const plane=input.read('plane');assert.equal(plane.roll,1);assert.equal(plane.pitch,-1);assert.equal(plane.throttleAdjust,.4);
  assert.deepEqual(input.read('walk'),{move:-0,strafe:-1,sprint:0});assert.equal(input.read('ocean'),null);
});
test('unknown mappings, absent sources, invalid values and untouched pads cannot create movement',()=>{
  const input=createXrActionInput();input.update([],true);
  const unknown=source('left',[0,0,1,1],1);unknown.gamepad.mapping='';input.update([unknown],true);assert.equal(input.read('drive').turn,-0);
  const touch=source('left',[1,-1]);input.update([touch],true);assert.equal(input.read('drive').turn,-0);touch.gamepad.buttons[2].touched=true;input.update([touch],true);assert.equal(input.read('drive').turn,-1);
  input.update([source('left',[0,0,NaN,Infinity])],true);assert.equal(input.read('drive').turn,-0);
});
test('the action reader merge preserves stronger existing controls and rejects non-finite producer values',()=>{
  const actions={mode:'drive',turn:1,steer:1,throttle:.8,reverse:0};
  assert.equal(mergeXrActions(actions,{turn:-.5,steer:-.5,throttle:.3,serviceBrake:.7,move:NaN}),actions);
  assert.equal(actions.turn,1);assert.equal(actions.throttle,.8);assert.equal(actions.serviceBrake,.7);assert.equal(actions.move,undefined);
});
