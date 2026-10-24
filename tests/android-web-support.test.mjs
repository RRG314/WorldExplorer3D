import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const code=await fs.readFile(new URL('../app/offline-worker.js',import.meta.url),'utf8');
function worker(fetch) {
  const listeners=new Map();
  const context=vm.createContext({URL,Response,fetch,self:{location:{origin:'https://worldexplorer3d.io'},
    addEventListener:(name,fn)=>listeners.set(name,fn),skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()}}});
  vm.runInContext(code,context);
  return request => {
    let promise;
    listeners.get('fetch')({request,respondWith:value=>{promise=value;}});
    return promise;
  };
}
const navigation=(url='https://worldexplorer3d.io/app/',method='GET')=>({url,method,mode:'navigate',credentials:'include'});
test('successful navigation keeps the exact network response and request semantics',async()=>{
  const response=new Response('current game',{headers:{'X-Version':'current'}}),request=navigation();
  const dispatch=worker(async actual=>{assert.equal(actual,request);return response;});
  assert.equal(await dispatch(request),response);
});
test('network loss and server outage show non-cached recovery with an explicit retry',async()=>{
  for(const fetch of [async()=>{throw Error('offline');},async()=>new Response('unavailable',{status:503})]) {
    const response=await worker(fetch)(navigation());
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    const text=await response.text();assert.match(text,/Connect to explore/);assert.match(text,/location.reload\(\)/);
  }
});
test('auth failures and not-found responses retain their original meaning',async()=>{
  for(const status of [401,403,404]) {
    const original=new Response('original',{status});assert.equal(await worker(async()=>original)(navigation()),original);
  }
});
test('APIs, private writes, assets and other origins stay outside service-worker interception',()=>{
  const dispatch=worker(()=>{throw Error('must not fetch');});
  for(const request of [
    navigation('https://worldexplorer3d.io/manageAppTesters'),
    navigation('https://worldexplorer3d.io/account/'),
    navigation('https://other.example/app/'),
    navigation('https://worldexplorer3d.io/app/','POST'),
    {...navigation('https://worldexplorer3d.io/app/world.json'),mode:'cors'},
    {...navigation('https://worldexplorer3d.io/app/runtime.js'),mode:'same-origin'}
  ]) assert.equal(dispatch(request),undefined);
});
test('install manifest icons exist and remain bounded to the game origin',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../app/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'/app/');assert.equal(manifest.scope,'/app/');assert.equal(manifest.orientation,'any');
  for(const icon of manifest.icons) {
    assert.ok(!icon.src.includes('..'));assert.ok((await fs.stat(new URL('../app/'+icon.src,import.meta.url))).size>0);
  }
});
