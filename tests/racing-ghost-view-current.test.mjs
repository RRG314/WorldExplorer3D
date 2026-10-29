import test from 'node:test';import assert from 'node:assert/strict';
import {raceGhostVisible} from '../app/js/racing/presentation.js';
const variant={width:2,length:5,height:1.5},rival={pose:{x:10,y:3,z:20,yaw:.7},progress:{finished:false}};
test('a finished or retired practice rival cannot surround the result camera',()=>{
 for(const patch of [{progress:{finished:true}},{dnf:true}])assert.equal(raceGhostVisible({...rival,...patch},variant),false);
 assert.equal(raceGhostVisible(rival,variant),true,'ordinary chase keeps an active ghost visible');
});
test('only an immersive eye inside the passing ghost hides it; other road levels and nearby lanes remain visible',()=>{
 const view={immersive:true,eye:{x:10,y:4,z:20}};assert.equal(raceGhostVisible(rival,variant,view),false);
 for(const eye of [{x:10,y:7,z:20},{x:18,y:4,z:20},{x:10,y:4,z:28}])assert.equal(raceGhostVisible(rival,variant,{...view,eye}),true);
 assert.equal(raceGhostVisible(rival,variant,{...view,immersive:false}),true);
 const before=structuredClone(rival);raceGhostVisible(rival,variant,view);assert.deepEqual(rival,before,'visibility never changes the authoritative actor or timing');
});
