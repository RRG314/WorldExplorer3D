import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createXrWorldViews} from '../app/js/vr/xr-world-views.js';
const context=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),context);const T=context.THREE;
const units=1/1.11;
function fixture(cant=0){
  const projection=new T.Matrix4().makePerspective(-.05,.06,.055,-.045,.05,50);
  const views=[-1,1].map(sign=>({transform:{matrix:new T.Matrix4().compose(new T.Vector3(sign*.032,1.6,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),sign*cant),new T.Vector3(1,1,1)).toArray()},projectionMatrix:projection.toArray()}));
  const pose={transform:{matrix:new T.Matrix4().makeTranslation(0,1.6,0).toArray()},views};
  const mountMatrix=new T.Matrix4().compose(new T.Vector3(50,2,-80),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/3),new T.Vector3(1,1,1));
  const arrayCamera=new T.ArrayCamera([new T.PerspectiveCamera(),new T.PerspectiveCamera()]);
  return {pose,mountMatrix,arrayCamera};
}
test('physical headset translations and projection depth convert once into world units',()=>{
  const f=fixture(),adapter=createXrWorldViews({THREE:T,worldUnitsPerMeter:units});adapter.update(f);
  const [left,right]=f.arrayCamera.cameras;assert.ok(Math.abs(left.position.distanceTo(right.position)-.064*units)<1e-10);assert.ok(Math.abs(left.near-.05*units)<1e-10);
  const matrix=left.projectionMatrix.toArray();adapter.update(f);assert.deepEqual(left.projectionMatrix.toArray(),matrix,'repeated same-frame reads cannot multiply the scale again');assert.equal(left.scale.x,1);
});
for(const cant of [0,.2,1.2])test(`conservative culling contains every corner for eye cant ${cant}`,()=>{
  const f=fixture(cant);createXrWorldViews({THREE:T,worldUnitsPerMeter:units}).update(f);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(f.arrayCamera.projectionMatrix,f.arrayCamera.matrixWorldInverse));
  for(const eye of f.arrayCamera.cameras)for(const z of [-1,1])for(const y of [-1,1])for(const x of [-1,1]){
    const point=new T.Vector3(x,y,z).applyMatrix4(eye.projectionMatrixInverse).applyMatrix4(eye.matrixWorld);assert.equal(frustum.containsPoint(point),true);
  }
});
test('missing/stale view shapes, non-finite transforms and scaled mounts are rejected',()=>{
  const adapter=createXrWorldViews({THREE:T,worldUnitsPerMeter:units});assert.throws(()=>adapter.update({}));
  const f=fixture();f.pose.views[0].projectionMatrix[0]=NaN;assert.throws(()=>adapter.update(f));
  const scaled=fixture();scaled.mountMatrix.scale(new T.Vector3(units,units,units));assert.throws(()=>adapter.update(scaled),/without scene scaling/);
});
