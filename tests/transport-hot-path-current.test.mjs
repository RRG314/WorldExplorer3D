import test from 'node:test';
import assert from 'node:assert/strict';
import {updateAlternateTravelMode,getEarthTransportControllerSnapshot} from '../app/js/physics/mode-dispatch.js';
import {createTransportControllerRegistry} from '../app/js/transport/controller-registry.js?v=2';

test('ordinary walking updates do not construct or sort diagnostic histories',()=>{
 let updates=0,auxiliaries=0,sorts=0;
 const app={Walk:{state:{mode:'walk',walker:{x:0,z:0}},update(){updates++;}},police:[],updateMode(){auxiliaries++;}};
 updateAlternateTravelMode(app,1/60);
 const original=Array.prototype.sort;
 Array.prototype.sort=function(...args){sorts++;return original.apply(this,args);};
 try{for(let i=0;i<1200;i++)assert.equal(updateAlternateTravelMode(app,1/60),true);}
 finally{Array.prototype.sort=original;}
 assert.equal(sorts,0,'per-frame dispatch must not sort controllers or 600-sample diagnostic histories');
 assert.equal(updates,1201);assert.equal(auxiliaries,1201);
 const diagnostic=getEarthTransportControllerSnapshot(app);
 assert.equal(diagnostic.activeId,'walk');assert.equal(diagnostic.controllers.find(c=>c.id==='walk').updates,1201);
 assert.ok(Number.isFinite(diagnostic.controllers.find(c=>c.id==='walk').updateDurationP95Ms));
});

test('cached priority order refreshes when controllers are registered and removed',()=>{
 const registry=createTransportControllerRegistry();let active='both';const calls=[];
 registry.registerController({id:'walk',priority:40,isActive:()=>true,update:()=>calls.push('walk')});
 registry.update(.1);
 const unregister=registry.registerController({id:'boat',priority:10,isActive:()=>active==='both',update:()=>calls.push('boat')});
 registry.update(.1);unregister();registry.update(.1);
 assert.deepEqual(calls,['walk','boat','walk']);
 assert.equal(registry.snapshot().activeId,'walk');
});
