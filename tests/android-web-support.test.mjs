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

const installCode=await fs.readFile(new URL('../js/app-install.js',import.meta.url),'utf8');
function installPage({secure=true,installed=false,ios=false,play=false}={}) {
  const listeners=new Map(),clicks=new Map(),media={matches:installed,addEventListener(){}};
  const instructions={open:false,addEventListener(){}},button={hidden:true,disabled:false,setAttribute(){}},
    status={},steps={focused:false,querySelector:()=>instructions,focus(){this.focused=true;}};
  const window={isSecureContext:secure,matchMedia:()=>media,WorldExplorerDistribution:{isGooglePlay:play},
    addEventListener:(name,listener)=>listeners.set(name,listener)};
  button.addEventListener=(name,listener)=>clicks.set(name,listener);
  vm.runInNewContext(installCode,{window,navigator:{userAgent:ios?'iPhone':'Linux',platform:'',maxTouchPoints:0},
    document:{getElementById:id=>({installAppBtn:button,installStatus:status,installSteps:steps})[id]}});
  return {button,status,steps,instructions,fire:(type,event={})=>listeners.get(type)?.(event),click:()=>clicks.get('click')()};
}
test('install help stays usable without a browser install API; insecure origins cannot offer installation',async()=>{
  const ui=installPage();await ui.click();assert.equal(ui.instructions.open,true);assert.equal(ui.steps.focused,true);
  assert.equal(installPage({secure:false}).button.hidden,true);
  for(const options of [{installed:true},{play:true}])assert.equal(installPage(options).button.hidden,true);
});
test('each install event is prompted only on a click and consumed once; cancellation remains recoverable',async()=>{
  const ui=installPage();let calls=0,prevented=false;
  ui.fire('beforeinstallprompt',{preventDefault(){prevented=true;},prompt:async()=>{calls++;return{outcome:'dismissed'};}});
  assert.equal(prevented,true);assert.equal(calls,0);assert.equal(ui.button.textContent,'Install World Explorer 3D');
  await ui.click();assert.equal(calls,1);assert.match(ui.status.textContent,/cancelled/);
  await ui.click();assert.equal(calls,1);assert.equal(ui.instructions.open,true);
});
test('prompt acceptance is not completion; browser appinstalled is authoritative even during a pending prompt',async()=>{
  const ui=installPage();ui.fire('beforeinstallprompt',{preventDefault(){},prompt:async()=>({outcome:'accepted'})});
  await ui.click();assert.match(ui.status.textContent,/requested/);assert.equal(ui.button.hidden,false);
  let resolve;ui.fire('beforeinstallprompt',{preventDefault(){},prompt:()=>new Promise(r=>{resolve=r;})});
  const pending=ui.click();assert.equal(ui.button.disabled,true);await ui.click();
  ui.fire('appinstalled');resolve({outcome:'accepted'});await pending;
  assert.equal(ui.button.hidden,true);assert.match(ui.status.textContent,/Installation complete/);
});
test('failed single-use prompt restores manual steps and supports a later browser event',async()=>{
  const ui=installPage();let calls=0;
  ui.fire('beforeinstallprompt',{preventDefault(){},prompt:()=>{throw Error('expired');}});
  await ui.click();assert.equal(ui.button.disabled,false);assert.equal(ui.instructions.open,true);assert.match(ui.status.textContent,/could not open/);
  ui.fire('beforeinstallprompt',{preventDefault(){},prompt:async()=>{calls++;return{outcome:'accepted'};}});
  await ui.click();assert.equal(calls,1);
});
test('landing and game advertise one stable app identity; installation keeps the private pages outside worker scope',async()=>{
  const landing=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),game=await fs.readFile(new URL('../app/index.html',import.meta.url),'utf8');
  assert.match(landing,/rel="manifest" href="\.\/app\/manifest\.webmanifest"/);
  for(const html of [landing,game])assert.match(html,/rel="apple-touch-icon"/);
  const manifest=JSON.parse(await fs.readFile(new URL('../app/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.id,'/app/');assert.equal(manifest.display,'standalone');
  assert.equal(manifest.scope,'/app/');assert.equal(manifest.start_url,'/app/');
});
