import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {detachSceneObject} from '../app/js/engine/scene-object-lifecycle.js';

const context=vm.createContext({console});
vm.runInContext(readFileSync('app/vendor/three/build/three.min.js','utf8'),context);
const T=context.THREE;
test('actual bundled Three renderer releases reused objects without relying on a newer API',()=>{
  assert.equal(T.REVISION,'128');assert.equal(typeof T.Object3D.prototype.removeFromParent,'undefined');
  const root=new T.Scene();
  for(let i=0;i<200;i++){
    const group=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());group.add(mesh);root.add(group);
    assert.equal(detachSceneObject(mesh),true);assert.equal(group.children.length,0);assert.equal(mesh.parent,null);
    mesh.geometry.dispose();mesh.material.dispose();assert.equal(detachSceneObject(group),true);assert.equal(root.children.length,0);
    assert.equal(detachSceneObject(group),false);
  }
});
test('detachment supports modern adapters and never removes unrelated scene children',()=>{
  const parent=new T.Group(),keep=new T.Object3D(),remove=new T.Object3D();parent.add(keep,remove);
  detachSceneObject(remove);assert.deepEqual([...parent.children],[keep]);assert.equal(detachSceneObject(null),false);
  let calls=0;assert.equal(detachSceneObject({removeFromParent(){calls++;}}),true);assert.equal(calls,1);
});

async function carFixture(parent){
  let released=0;const root=new T.Group(),instance={root,record:{label:'Fixture car'},dispose(){released++;}};
  const realm=vm.createContext({console:{warn(){}}});
  const loader=new vm.SyntheticModule(['loadModelAsset'],function(){this.setExport('loadModelAsset',async()=>instance);},{context:realm});
  const module=new vm.SourceTextModule(readFileSync('app/js/engine/curated-player-car.js','utf8'),{context:realm});
  const finish=new vm.SourceTextModule(readFileSync('app/js/engine/player-car-finish.js','utf8'),{context:realm});
  await module.link(specifier=>specifier.includes('player-car-finish')?finish:loader);await module.evaluate();
  const carMesh={parent,userData:{}};const result=await module.namespace.attachCuratedPlayerCar(T,{carMesh});
  return {result,released,state:carMesh.userData};
}
test('an unloaded car and a rejected model each release their asset lease exactly once',async()=>{
  const cancelled=await carFixture(null);assert.equal(cancelled.result,false);assert.equal(cancelled.released,1);assert.equal(cancelled.state.curatedVehicleLoading,false);
  const invalid=await carFixture({});assert.equal(invalid.result,false);assert.equal(invalid.released,1);assert.equal(invalid.state.curatedVehicleLoadFailed,true);
});
