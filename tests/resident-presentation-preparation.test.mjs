import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareResidentPresentation} from '../app/js/runtime/resident-presentation-preparation.js';
import {createCoreRenderSystem} from '../app/js/runtime/core-frame-systems.js';
import {residentPopulationRoots} from '../app/js/living-world/runtime.js';

function fixture() {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),shown=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  const hidden=shown.clone(),car=shown.clone(),otherLayer=shown.clone();
  hidden.visible=false;car.visible=false;otherLayer.layers.set(1);
  scene.add(shown,hidden,car,otherLayer);
  const beforeTarget={},target={},viewport=new THREE.Vector4(2,3,800,600),scissor=new THREE.Vector4(4,5,700,500);
  const state={target:beforeTarget,viewport:viewport.clone(),scissor:scissor.clone(),scissorTest:false};
  const renderer={shadowMap:{autoUpdate:true,needsUpdate:true},info:{memory:{geometries:7,textures:3}},
    getRenderTarget:()=>state.target,setRenderTarget:value=>{state.target=value;},
    getViewport:out=>out.copy(state.viewport),setViewport:(x,...v)=>{state.viewport=x?.isVector4?x.clone():new THREE.Vector4(x,...v);},
    getScissor:out=>out.copy(state.scissor),setScissor:(x,...v)=>{state.scissor=x?.isVector4?x.clone():new THREE.Vector4(x,...v);},
    getScissorTest:()=>state.scissorTest,setScissorTest:value=>{state.scissorTest=value;},render(){}};
  return {ctx:{scene,camera,renderer},state,shown,hidden,car,otherLayer,target,beforeTarget,viewport,scissor};
}

for(const fail of [false,true])test(`GPU preparation restores the real scene and renderer after ${fail?'failure':'success'}`,()=>{
  const f=fixture(),{ctx}=f,pose=ctx.camera.matrix.clone();let renders=0;
  ctx.renderer.render=(scene,camera)=>{
    renders++;assert.equal(scene,ctx.scene);assert.equal(camera,ctx.camera);
    assert.deepEqual(f.state.viewport.toArray(),[0,0,1,1]);assert.equal(f.state.scissorTest,true);assert.equal(f.state.target,f.target);
    assert.equal(f.shown.frustumCulled,false);assert.equal(f.car.visible,true);assert.equal(f.car.frustumCulled,false);
    assert.equal(f.hidden.visible,false);assert.equal(f.hidden.frustumCulled,true);assert.equal(f.otherLayer.frustumCulled,true);
    assert.deepEqual(ctx.renderer.shadowMap,{autoUpdate:false,needsUpdate:false});
    if(fail)throw Error('GPU failed');
  };
  const run=()=>prepareResidentPresentation(ctx,THREE,{target:f.target,visibleRoots:[f.car]});
  if(fail)assert.throws(run,/GPU failed/);else assert.equal(run().meshes,2);
  assert.equal(renders,1);assert.equal(f.state.target,f.beforeTarget);
  assert.deepEqual(f.state.viewport,f.viewport);assert.deepEqual(f.state.scissor,f.scissor);assert.equal(f.state.scissorTest,false);
  assert.equal(f.shown.frustumCulled,true);assert.equal(f.car.visible,false);assert.equal(f.car.frustumCulled,true);
  assert.deepEqual(ctx.camera.matrix,pose);assert.deepEqual(ctx.renderer.shadowMap,{autoUpdate:true,needsUpdate:true});
});

test('a gallery preparation changes culling only within the admitted gallery',()=>{
  const f=fixture(),gallery=new THREE.Group(),display=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  gallery.add(display);f.ctx.scene.add(gallery);
  f.ctx.renderer.render=()=>{assert.equal(display.frustumCulled,false);assert.equal(f.shown.frustumCulled,true);assert.equal(f.car.visible,false);};
  assert.equal(prepareResidentPresentation(f.ctx,THREE,{root:gallery}).meshes,1);
  assert.equal(display.frustumCulled,true);
});

for(const fail of [false,true])test(`detached resident rigs are prepared and returned to their owner after ${fail?'GPU failure':'success'}`,()=>{
  const f=fixture(),host=new THREE.Group(),mesh=f.shown.clone(),retired=mesh.clone();
  host.visible=false;host.position.set(20,3,-7);host.rotation.y=.4;host.add(mesh,retired);retired.visible=false;
  const position=host.position.clone(),rotation=host.quaternion.clone(),children=[...f.ctx.scene.children];
  let disposals=0;mesh.geometry.addEventListener('dispose',()=>disposals++);
  f.ctx.renderer.render=()=>{
    assert.equal(host.parent,f.ctx.scene);assert.equal(host.visible,true);assert.equal(mesh.frustumCulled,false);
    assert.equal(retired.visible,false,'Preparation must not reveal retired or authored-hidden submeshes');
    assert.deepEqual(host.position,position);assert.equal(host.quaternion.equals(rotation),true);
    if(fail)throw Error('GPU failed');
  };
  const run=()=>prepareResidentPresentation(f.ctx,THREE,{residentRoots:[host,host]});
  if(fail)assert.throws(run,/GPU failed/);else assert.equal(run().borrowedRoots,1);
  assert.equal(host.parent,null);assert.equal(host.visible,false);assert.equal(mesh.frustumCulled,true);
  assert.deepEqual(f.ctx.scene.children,children);assert.deepEqual(host.children,[mesh,retired]);
  assert.deepEqual(host.position,position);assert.equal(host.quaternion.equals(rotation),true);assert.equal(disposals,0);
});

test('another scene cannot lend a resident rig to the current renderer',()=>{
  const f=fixture(),other=new THREE.Scene(),host=f.shown.clone();other.add(host);
  f.ctx.renderer.render=()=>assert.fail('Foreign scenes must not render');
  assert.throws(()=>prepareResidentPresentation(f.ctx,THREE,{residentRoots:[host]}),/current scene/);
  assert.equal(host.parent,other);assert.equal(host.visible,true);assert.equal(f.state.target,f.beforeTarget);
});

test('retired, replaced and retained Earth populations cannot enter another presentation',()=>{
  const root=new THREE.Group(),publication={type:'LivingWorldPublication',requestId:'world-1',sequence:1};
  let reads=0;
  const state={publication,disposed:false,population:{residentPresentationRoots(){reads++;return [root];}}};
  const ctx={getEnv:()=> 'EARTH',worldPublication:{requestId:'world-1',sequence:1},livingWorldRuntime:state};
  assert.deepEqual(residentPopulationRoots(ctx),[root]);assert.equal(reads,1);
  for(const changed of [
    {...ctx,getEnv:()=> 'MOON'}, {...ctx,getEnv:()=> 'OCEAN'}, {...ctx,onMoon:true},
    {...ctx,worldPublication:{requestId:'world-2',sequence:2}},
    {...ctx,livingWorldRuntime:{...state,disposed:true}}
  ])assert.deepEqual(residentPopulationRoots(changed),[]);
  assert.equal(reads,1,'Rejected ownership must not even read the retired hosts');
});

test('first-world preparation reaches the r128 renderer without a later-version brand marker',t=>{
  const previous=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=previous;});
  const f=fixture();f.ctx.gameStarted=true;let renders=0;
  const resident=new THREE.Group();resident.visible=false;resident.add(f.shown.clone());
  f.ctx.livingWorldRuntime={residentPresentationRoots:()=>[resident]};
  f.ctx.renderer.render=()=>renders++;
  assert.equal(f.ctx.renderer.isWebGLRenderer,undefined);
  createCoreRenderSystem(f.ctx,()=>false);
  const result=f.ctx.prepareFirstWorldRender();
  assert.equal(result.residentPreparation.meshes,2);assert.equal(result.residentPreparation.borrowedRoots,1);
  assert.equal(resident.parent,null);assert.equal(resident.visible,false);
  assert.equal(renders,2,'prepare then render the normal playable frame');
});
