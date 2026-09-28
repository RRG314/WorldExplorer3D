import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformServiceRegistry} from '../app/js/platform/service-registry.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
test('reset invalidates pending publication and disposes the late resource', async()=>{
  const load=deferred(), events=[]; let disposals=0;
  const registry=createPlatformServiceRegistry({onEvent:e=>events.push(e.type)});
  registry.register({id:'test',load:()=>load.promise});
  const pending=registry.ensure('test'); await Promise.resolve();
  registry.reset('test'); load.resolve({dispose(){disposals++;}});
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(registry.peek('test'),null); assert.equal(registry.isReady('test'),false);
  assert.equal(disposals,1); assert.equal(events.filter(e=>e==='ready').length,0);
});
test('late completion cannot replace a newer generation', async()=>{
  const old=deferred(); let calls=0,disposals=0; const current={id:'new'};
  const registry=createPlatformServiceRegistry();
  registry.register({id:'test',load:()=>++calls===1?old.promise:current});
  const pending=registry.ensure('test'); await Promise.resolve(); registry.reset('test');
  await registry.ensure('test'); old.resolve({dispose(){disposals++;}});
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(registry.peek('test'),current); assert.equal(disposals,1);
});
test('late failure cannot mark a replacement failed', async()=>{
  const old=deferred(); let calls=0;
  const registry=createPlatformServiceRegistry();
  registry.register({id:'test',load:()=>++calls===1?old.promise:{id:'new'}});
  const pending=registry.ensure('test'); await Promise.resolve(); registry.reset('test');
  await registry.ensure('test'); old.reject(new Error('old failure'));
  await assert.rejects(pending,/old failure/); assert.equal(registry.isReady('test'),true);
});
test('unregistered pending service cannot publish; custom disposer receives result', async()=>{
  const old=deferred(), disposed=[]; const registry=createPlatformServiceRegistry();
  const unregister=registry.register({id:'test',load:()=>old.promise,dispose:(v)=>{if(v)disposed.push(v);}});
  const pending=registry.ensure('test'); await Promise.resolve(); unregister(); const value={id:'old'}; old.resolve(value);
  await assert.rejects(pending,{name:'AbortError'}); assert.deepEqual(disposed,[value]);
  assert.equal(registry.snapshot().registered,0);
});
test('normal concurrent requests load once; failures can retry', async()=>{
  let calls=0; const registry=createPlatformServiceRegistry();
  registry.register({id:'test',load:()=>{if(++calls===1)throw Error('retry');return {id:'ready'};}});
  await assert.rejects(registry.ensure('test'),/retry/);
  const [a,b]=await Promise.all([registry.ensure('test'),registry.ensure('test')]);
  assert.equal(a,b);assert.equal(calls,2);assert.equal(registry.isReady('test'),true);
});
