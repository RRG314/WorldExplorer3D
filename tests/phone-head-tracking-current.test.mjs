import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createPhoneHeadTracking} from '../app/js/vr/phone-head-tracking.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
const context=vm.createContext({console});vm.runInContext(await readFile(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),context);const THREE=context.THREE;
function fixture(permission){
  const target=new EventTarget();target.document=new EventTarget();target.document.hidden=false;target.screen={orientation:new EventTarget()};target.screen.orientation.angle=90;target.isSecureContext=true;target.DeviceOrientationEvent=permission?{requestPermission:permission}:{};
  let at=1000,current=true;
  const tracker=createPhoneHeadTracking({THREE,target,now:()=>at,isCurrent:()=>current});
  const send=(angles={alpha:0,beta:90,gamma:0})=>{const event=new Event('deviceorientation');Object.assign(event,angles);target.dispatchEvent(event);};
  return {tracker,target,send,setTime:value=>at=value,setCurrent:value=>current=value};
}
test('permission begins in the gesture; denied and obsolete grants cannot attach tracking',async()=>{
  let grant,called=false;const promise=new Promise(resolve=>grant=resolve);const f=fixture(()=>{called=true;return promise;});const enabling=f.tracker.enable();assert.equal(called,true);f.setCurrent(false);grant('granted');assert.equal(await enabling,false);f.send();assert.equal(f.tracker.read(new THREE.Quaternion()),false);f.tracker.dispose();
  const denied=fixture(async()=>'denied');assert.equal(await denied.tracker.enable(),false);assert.equal(denied.tracker.snapshot().status,'denied');denied.tracker.dispose();
});
test('rotation-only view calibrates once, follows rotation and recenters explicitly',async()=>{
  const f=fixture();await f.tracker.enable();f.send();const output=new THREE.Quaternion();assert.equal(f.tracker.read(output),true);assert.ok(output.angleTo(new THREE.Quaternion())<1e-7);
  f.send({alpha:30,beta:90,gamma:0});f.tracker.read(output);assert.ok(Math.abs(output.angleTo(new THREE.Quaternion())-Math.PI/6)<1e-7);
  f.tracker.recenter();f.send({alpha:30,beta:90,gamma:0});f.tracker.read(output);assert.ok(output.angleTo(new THREE.Quaternion())<1e-7);assert.equal(f.tracker.snapshot().tracking,'orientation-only');f.tracker.dispose();
});
test('screen rotation and visibility revoke stale poses until a fresh sensor sample',async()=>{
  const f=fixture();await f.tracker.enable();f.send();const output=new THREE.Quaternion();f.tracker.read(output);
  f.target.screen.orientation.angle=270;f.target.screen.orientation.dispatchEvent(new Event('change'));assert.equal(f.tracker.read(output),false);f.send();assert.equal(f.tracker.read(output),true);
  f.target.document.hidden=true;f.target.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.tracker.read(output),false);
  f.target.document.hidden=false;f.target.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.tracker.read(output),false);f.send();assert.equal(f.tracker.read(output),true);f.tracker.dispose();
});
test('invalid samples, stale timestamps and disposed permission replies cannot rotate a view or leak listeners',async()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount;const f=fixture();await f.tracker.enable();f.send({alpha:null,beta:90,gamma:0});assert.equal(f.tracker.read(new THREE.Quaternion()),false);
  f.send();f.setTime(3000);assert.equal(f.tracker.read(new THREE.Quaternion()),false);assert.equal(f.tracker.snapshot().status,'stale');f.tracker.dispose();assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
  let grant;const wait=new Promise(resolve=>grant=resolve),late=fixture(()=>wait),pending=late.tracker.enable();late.tracker.dispose();grant('granted');assert.equal(await pending,false);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});
