import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstructionProjection} from '../../app/js/experiments/embodied-society/construction-projection.mjs';
import {createResidentMotor} from '../../app/js/experiments/embodied-society/resident-body.mjs';
// Render allocation double only; geometry/collision rules and walking are actual modules.
class Group {children=[];add(item){this.children.push(item);}remove(item){this.children=this.children.filter(v=>v!==item);}traverse(fn){fn(this);for(const child of this.children)fn(child);}}
class Disposable {disposed=false;dispose(){this.disposed=true;}}
class Mesh {constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set(){}};this.rotation={};this.userData={};}}
const THREE={Group,Mesh,BoxGeometry:Disposable,MeshStandardMaterial:Disposable};
const state={runId:'test',structures:{wall:{id:'wall',cellId:'0_0.5_2',block:{gx:0,gy:.5,gz:2,shape:'wall',rotation:0}}}};
test('committed construction blocks real walking and identical reconciliation allocates nothing',()=>{
 const scene=new Group(),view=createConstructionProjection({THREE,scene,runId:'test'});
 view.reconcile(state);const original=scene.children[0],mesh=original.children[0];
 assert.equal(view.reconcile(state).changed,false);assert.equal(scene.children[0],original);
 const body=createResidentMotor({actorId:'a',spawn:{x:0,y:1.7,z:0,yaw:0},world:{walkSurfaceAt:()=>({position:{y:0}}),checkBuildingCollision:()=>({collision:false}),...view}});
 body.command({move:1,frames:120});for(let n=0;n<120;n++)body.step();assert.ok(body.observation().position.z<2);
 assert.equal(view.getBuildCollisionAtWorldXZ(0,2,0,.65,1.7).blocked,true);
 view.dispose();assert.equal(scene.children.length,0);assert.equal(mesh.geometry.disposed,true);assert.equal(mesh.material.disposed,true);
 assert.equal(view.getBuildCollisionAtWorldXZ(0,2,0,.65,1.7).blocked,false);
});
test('invalid or foreign construction leaves prior collision and view intact',()=>{
 const scene=new Group(),view=createConstructionProjection({THREE,scene,runId:'test'});view.reconcile(state);
 const group=scene.children[0];assert.throws(()=>view.reconcile({...state,runId:'production'}),/Wrong/);
 const invalid=structuredClone(state);invalid.structures.wall.block.gx=NaN;
 assert.throws(()=>view.reconcile(invalid),/Invalid/);assert.equal(scene.children[0],group);assert.equal(view.getBuildCollisionAtWorldXZ(0,2,0,.65,1.7).blocked,true);view.dispose();
});
