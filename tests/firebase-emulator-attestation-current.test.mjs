import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const configSource=readFileSync(new URL('../js/firebase-config.js',import.meta.url),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g,'').replace(/export /g,'');
const source=readFileSync(new URL('../js/firebase-init.js',import.meta.url),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g,'').replace(/export \{[^}]+\};/g,'').replace(/export /g,'');
function initialize(hostname, emulator) {
 const calls=[];
 const config={apiKey:'fixture',projectId:'fixture',appId:'fixture',appCheckSiteKey:'fixture'};
 const context=vm.createContext({location:{hostname,protocol:'https:'},WORLD_EXPLORER_FIREBASE:config,WORLD_EXPLORER_FIREBASE_EMULATORS:emulator,
  assertFirebaseEnvironment:x=>x,getApps:()=>[],initializeApp:options=>({options}),getAuth:()=>({}),initializeAuth:()=>({}),indexedDBLocalPersistence:{},browserLocalPersistence:{},browserSessionPersistence:{},getFirestore:()=>({}),getStorage:()=>({}),
  initializeAppCheck:()=>{calls.push('attestation');return {};},ReCaptchaEnterpriseProvider:class {},
  connectAuthEmulator:()=>calls.push('auth'),connectFirestoreEmulator:()=>calls.push('firestore'),connectStorageEmulator:()=>calls.push('storage')});
 vm.runInContext(configSource+source,context);vm.runInContext('initFirebase()',context);return calls;
}
test('explicit loopback emulators connect all services without remote CAPTCHA',()=>{
 assert.deepEqual(initialize('127.0.0.1',{enabled:true,host:'127.0.0.1'}),['auth','firestore','storage']);
});
test('hosted apps and local staging without emulators retain App Check',()=>{
 assert.deepEqual(initialize('127.0.0.1',null),['attestation']);
 assert.ok(initialize('worldexplorer3d.io',{enabled:true,host:'127.0.0.1'}).includes('attestation'));
 assert.ok(initialize('localhost',{enabled:true,host:'remote.example'}).includes('attestation'));
 assert.deepEqual(initialize('localhost',{enabled:false}),['attestation']);
});

const policySource=readFileSync(new URL('../js/firebase-environment-policy.js',import.meta.url),'utf8').replace(/export /g,'');
function readConfigAt(url, windowConfig, storedConfig) {
 const context=vm.createContext({location:new URL(url),WORLD_EXPLORER_FIREBASE:windowConfig,
  localStorage:{getItem:()=>JSON.stringify(storedConfig)}});
 vm.runInContext(policySource+configSource,context);
 return vm.runInContext('readFirebaseConfig()',context);
}
test('SDK-independent configuration retains storage fallback and environment isolation',()=>{
 const staging={apiKey:'fixture',projectId:'we3d-staging-20260712',appId:'fixture'};
 const production={...staging,projectId:'worldexplorer3d-d9b83'};
 assert.equal(readConfigAt('http://localhost/',null,staging).projectId,staging.projectId);
 assert.equal(readConfigAt('http://localhost/',staging,production).projectId,staging.projectId);
 assert.throws(()=>readConfigAt('http://localhost/',null,production),/Production Firebase is blocked/);
 assert.throws(()=>readConfigAt('https://worldexplorer3d.io/',staging,null),/cannot use staging/);
 assert.equal(readConfigAt('https://worldexplorer3d.io/',production,null).projectId,production.projectId);
});

function authBootstrap({ pending = false, failure = false } = {}) {
 const calls = [], warnings = [], storage = new Map(pending ? [['world-explorer-auth-redirect-pending','1']] : []);
 const resolver = { name: 'popup-redirect' }, auth = {};
 const config = {apiKey:'fixture', projectId:'fixture', appId:'fixture'};
 const context = vm.createContext({ WORLD_EXPLORER_FIREBASE:config,
  location:{hostname:'localhost',protocol:'https:'}, assertFirebaseEnvironment:x=>x,
  getApps:()=>[], initializeApp:options=>({options}), getFirestore:()=>({}), getStorage:()=>({}),
  getAuth:()=>{calls.push({type:'proactive-iframe'});return auth;},
  initializeAuth:(app, options)=>{calls.push({type:'auth',options});return auth;},
  indexedDBLocalPersistence:'indexedDB',browserLocalPersistence:'local',browserSessionPersistence:'session',browserPopupRedirectResolver:resolver,
  getRedirectResult:async (actualAuth, actualResolver)=>{assert.equal(actualAuth,auth);assert.equal(actualResolver,resolver);calls.push({type:'redirect'});if(failure)throw new Error('offline');return null;},
  sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  console:{warn:(...args)=>warnings.push(args)}
 });
 vm.runInContext(configSource+source,context);
 return {calls,warnings,storage,initialize:()=>vm.runInContext('initFirebase()',context)};
}
test('ordinary Firebase startup preserves persistence without opening an OAuth iframe',()=>{
 const harness=authBootstrap();
 assert.equal(harness.initialize(),harness.initialize());
 assert.deepEqual(harness.calls.map(call=>call.type),['auth']);
 assert.deepEqual(Array.from(harness.calls[0].options.persistence),['indexedDB','local','session']);
 assert.equal(harness.calls[0].options.popupRedirectResolver,undefined);
});
test('an actual OAuth redirect return recovers once and consumes its marker even when offline',async()=>{
 for(const failure of [false,true]) {
  const harness=authBootstrap({pending:true,failure});
  harness.initialize();harness.initialize();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(harness.calls.map(call=>call.type),['auth','redirect']);
  assert.equal(harness.storage.size,0);
  assert.equal(harness.warnings.length,failure?1:0);
 }
});

test('Google sign-in explicitly supplies its resolver and clears a failed redirect marker',async()=>{
 const authSource=readFileSync(new URL('../js/auth-ui.js',import.meta.url),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g,'').replace(/export /g,'');
 for(const redirectFails of [false,true]) {
  const auth={currentUser:null},resolver={},calls=[];
  const context=vm.createContext({initFirebase:()=>({auth}),browserPopupRedirectResolver:resolver,
   GoogleAuthProvider:class {setCustomParameters(){}},
   setAuthRedirectPending:value=>calls.push(value),
   signInWithPopup:async(actualAuth,provider,actualResolver)=>{assert.equal(actualAuth,auth);assert.equal(actualResolver,resolver);throw {code:'auth/popup-blocked'};},
   signInWithRedirect:async(actualAuth,provider,actualResolver)=>{assert.equal(actualAuth,auth);assert.equal(actualResolver,resolver);if(redirectFails)throw {code:'auth/network-request-failed'};}
  });
  vm.runInContext(authSource,context);
  const operation=vm.runInContext('signInWithGoogle()',context);
  if(redirectFails)await assert.rejects(operation,/Network error/);else assert.equal(await operation,null);
  assert.deepEqual(calls,redirectFails?[true,false]:[true]);
 }
});
