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
  assertFirebaseEnvironment:x=>x,getApps:()=>[],initializeApp:options=>({options}),getAuth:()=>({}),getFirestore:()=>({}),getStorage:()=>({}),
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
