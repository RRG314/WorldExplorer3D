import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/firebase-init.js',import.meta.url),'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g,'').replace(/export /g,'');
function initialize(hostname, emulator) {
 const calls=[];
 const config={apiKey:'fixture',projectId:'fixture',appId:'fixture',appCheckSiteKey:'fixture'};
 const context=vm.createContext({location:{hostname,protocol:'https:'},WORLD_EXPLORER_FIREBASE:config,WORLD_EXPLORER_FIREBASE_EMULATORS:emulator,
  assertFirebaseEnvironment:x=>x,getApps:()=>[],initializeApp:options=>({options}),getAuth:()=>({}),getFirestore:()=>({}),getStorage:()=>({}),
  initializeAppCheck:()=>{calls.push('attestation');return {};},ReCaptchaEnterpriseProvider:class {},
  connectAuthEmulator:()=>calls.push('auth'),connectFirestoreEmulator:()=>calls.push('firestore'),connectStorageEmulator:()=>calls.push('storage')});
 vm.runInContext(source,context);vm.runInContext('initFirebase()',context);return calls;
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
