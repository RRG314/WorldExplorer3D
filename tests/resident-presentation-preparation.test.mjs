import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareResidentPresentation} from '../app/js/runtime/resident-presentation-preparation.js';
import {createCoreRenderSystem} from '../app/js/runtime/core-frame-systems.js';

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

test('first-world preparation reaches the r128 renderer without a later-version brand marker',t=>{
  const previous=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=previous;});
  const f=fixture();f.ctx.gameStarted=true;let renders=0;
  f.ctx.renderer.render=()=>renders++;
  assert.equal(f.ctx.renderer.isWebGLRenderer,undefined);
  createCoreRenderSystem(f.ctx,()=>false);
  const result=f.ctx.prepareFirstWorldRender();
  assert.equal(result.residentPreparation.meshes,1);assert.equal(renders,2,'prepare then render the normal playable frame');
});
