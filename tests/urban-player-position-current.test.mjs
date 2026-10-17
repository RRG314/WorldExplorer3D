import test from 'node:test';
import assert from 'node:assert/strict';
import {urbanGroundPlayerPosition} from '../app/js/urban-sandbox/player-position.js';
import {createCivicResponseModel} from '../app/js/urban-sandbox/civic-response-model.js';

test('starter-car incidents and pursuit follow the driver after leaving the inactive walker behind',()=>{
  const walking={mode:'drive',walker:{x:0,y:2,z:0}},car={x:514,y:12,z:-48};
  const position=()=>urbanGroundPlayerPosition(walking,car);
  const civic=createCivicResponseModel({now:()=>1000});
  const incident=civic.observe({kind:'collision',position:position()},[{id:'nearby-witness'}]);
  assert.deepEqual(incident.event.position,{x:514,z:-48});
  for(let i=0;i<30;i++)civic.update(.25,position());
  car.x=540;car.z=-55;
  const pursuit=civic.update(.25,position(),{detected:true});
  assert.deepEqual(pursuit.lastKnownPosition,{x:540,z:-55});
  assert.deepEqual(walking.walker,{x:0,y:2,z:0});
});

test('ground-mode handoff changes the body while a remote camera does not',()=>{
  const walking={mode:'walk',walker:{x:12,z:30}},car={x:200,z:300};
  assert.equal(urbanGroundPlayerPosition(walking,car),walking.walker);
  walking.mode='drive';
  assert.equal(urbanGroundPlayerPosition(walking,car),car);
  const occupiedVehicle={x:210,z:320};
  assert.equal(urbanGroundPlayerPosition(walking,car,occupiedVehicle),occupiedVehicle);
  walking.mode='walk';walking.walker.x=212;
  assert.equal(urbanGroundPlayerPosition(walking,car),walking.walker);
  assert.equal(urbanGroundPlayerPosition({mode:'walk'},car),car);
  assert.equal(urbanGroundPlayerPosition(undefined,null),null);
});
