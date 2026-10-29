import test from 'node:test';import assert from 'node:assert/strict';
import {raceGhostVisible} from '../app/js/racing/presentation.js';
import * as THREE from 'three';
import {createGhostManager} from '../app/js/multiplayer/ghosts.js';
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
test('room presence yields matching cars to the admitted race and restores them on release',()=>{
 const oldThree=globalThis.THREE,oldDocument=globalThis.document;globalThis.THREE=THREE;globalThis.document={createElement:()=>({getContext:()=>null})};
 const scene=new THREE.Scene();let current=true,run={isNetworkRace:true,isCurrent:()=>current,snapshot:()=>({players:[{uid:'racing-driver'}]})};
 const manager=createGhostManager(scene,{getSelfUid:()=>'',getRoadRaceController:()=>run});
 try{
  manager.updateGhosts(['racing-driver','ordinary-explorer'].map(uid=>({uid,mode:'drive',displayName:uid,pose:{x:0,y:0,z:0,yaw:0}})));
  manager.tick(100);const [racing,ordinary]=scene.children[0].children;assert.equal(racing.visible,false);assert.equal(ordinary.visible,true);
  current=false;manager.tick(140);assert.equal(racing.visible,true,'an obsolete race cannot hide replacement-world presentation');
  current=true;manager.tick(180);assert.equal(racing.visible,false);run=null;manager.tick(220);assert.equal(racing.visible,true);
 }finally{manager.destroy();globalThis.THREE=oldThree;globalThis.document=oldDocument;}
 assert.equal(scene.children.length,0);
});
