import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createVrGazeControls} from '../app/js/vr/gaze-controls.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
const sandbox=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),sandbox);const T=sandbox.THREE;
const draw=new Proxy({},{get:(_target,key)=>key==='canvas'?{}:()=>{}}),documentRef={createElement:()=>({getContext:()=>draw})};
test('decomposed tracked pose selects the scaled button centre across its triangle diagonal',()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount,scene=new T.Scene(),actions=[],controls=createVrGazeControls({THREE:T,scene,worldUnitsPerMeter:1/1.11,documentRef,onAction:action=>actions.push(action)});
  const camera=new T.PerspectiveCamera();camera.position.set(.35,-.030000000000000027,-.05);camera.quaternion.fromArray([0,.9846939520381225,.10810231313723852,-.13671763132062517]);camera.updateMatrixWorld(true);
  const args={mountPosition:new T.Vector3(.35,-.03,-.05),mountQuaternion:new T.Quaternion(0,1,0,0),camera,paused:true,tracking:true};
  controls.update({...args,timestamp:20});assert.equal(controls.snapshot().hover,'toggle');controls.update({...args,timestamp:1121});assert.deepEqual(actions,['toggle']);controls.update({...args,timestamp:2000});assert.deepEqual(actions,['toggle'],'one activation until the ray leaves');
  controls.dispose();assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});
test('controller and transient selection use a finite normalized ray and reject scenery',()=>{
  const scene=new T.Scene(),actions=[],controls=createVrGazeControls({THREE:T,scene,worldUnitsPerMeter:1,documentRef,onAction:action=>actions.push(action)}),camera=new T.PerspectiveCamera();
  controls.update({mountPosition:new T.Vector3(),mountQuaternion:new T.Quaternion(),camera,timestamp:0,paused:true,tracking:true});
  assert.equal(controls.selectRay(new T.Vector3(),new T.Vector3(.43,-.34,-1.5)),true);assert.deepEqual(actions,['exit']);
  assert.equal(controls.selectRay(new T.Vector3(),new T.Vector3(0,1,0)),false);assert.equal(controls.selectRay(new T.Vector3(),new T.Vector3(NaN,0,0)),false);controls.dispose();
});
