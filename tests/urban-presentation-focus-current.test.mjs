import test from 'node:test';
import assert from 'node:assert/strict';
import {urbanPresentationFocus,urbanPresentationDistance} from '../app/js/urban-sandbox/presentation-focus.js';
test('flight detail follows the aircraft in three dimensions, not the parked car',()=>{
 const car={x:0,y:5,z:0},plane={x:500,y:305,z:600,source:'plane'};
 assert.equal(urbanPresentationFocus(plane,car),plane);
 assert.equal(urbanPresentationDistance(plane,{x:500,y:5,z:600}),300);
 assert.ok(urbanPresentationDistance(plane,car)>174);
 const landed={...plane,y:5};assert.equal(urbanPresentationDistance(landed,{x:500,y:5,z:600}),0);
 assert.deepEqual(car,{x:0,y:5,z:0});
});
test('visual detail follows direct walking/driving modes instead of a stale body; civic state stays unchanged',()=>{
 const body={x:2,y:3,z:4};
 for(const source of ['walk','drive']){const active={x:99,y:0,z:99,source};assert.equal(urbanPresentationFocus(active,body),active);}
 const drone={x:2,y:203,z:4,source:'drone'};
 assert.equal(urbanPresentationFocus(drone,body),drone);assert.equal(urbanPresentationDistance(drone,body),200);
 assert.equal(urbanPresentationFocus(null,body),body);
 assert.equal(urbanPresentationDistance({...drone,source:'boat'},body),0);
 assert.deepEqual(body,{x:2,y:3,z:4});
});
