import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,Timestamp,serverTimestamp,onSnapshot} from 'firebase/firestore';
import assert from 'node:assert/strict';
const [host,port]=String(process.env.FIRESTORE_EMULATOR_HOST||'').split(':');assert.ok(['127.0.0.1','localhost'].includes(host));
const env=await initializeTestEnvironment({projectId:`marine-rules-${Date.now()}`,firestore:{host,port:Number(port),rules:await readFile('firestore.rules','utf8')}});
const room='MARIN1',uid='crew',now=Date.now(),path=['rooms',room,'expeditions','marine'];let unsubscribe;
const player={uid,displayName:'Crew',joinedAt:Timestamp.fromMillis(now-60000),lastSeenAt:Timestamp.fromMillis(now-10000),expiresAt:Timestamp.fromMillis(now+90000),role:'member',mode:'walk',frame:{kind:'earth',locLat:-18.2861,locLon:147.7},pose:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vy:0,vz:0},joinCode:room};
const cases=[];
try{
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'rooms',room),{code:room,ownerUid:'captain',visibility:'private'});await setDoc(doc(c.firestore(),'rooms',room,'players',uid),player);await setDoc(doc(c.firestore(),...path),{revision:1,type:'SharedMarineExpedition'});});
 const member=env.authenticatedContext(uid).firestore(),outsider=env.authenticatedContext('outsider').firestore();
 await assertSucceeds(setDoc(doc(member,'rooms',room,'players',uid),{...player,mode:'ocean',frame:{kind:'ocean',locLat:-18.2861,locLon:147.7,interiorKey:'marine:server-voyage:underwater',interiorFloorId:'',interiorFloorLevel:0},pose:{...player.pose,y:-12,z:-65},lastSeenAt:serverTimestamp()}));cases.push('admitted player can publish actual Ocean frame and pose');
 await assertFails(setDoc(doc(member,...path),{revision:999,manifest:[{id:'forged'}]}));await assertFails(getDoc(doc(outsider,...path)));await assertSucceeds(getDoc(doc(member,...path)));cases.push('shared marine is member-readable, client-write-denied and outsider-private');
 const received=[];let resolve;
 const updated=new Promise(r=>resolve=r);unsubscribe=onSnapshot(doc(member,...path),s=>{received.push(s.data().revision);if(s.data().revision===2)resolve()},e=>{throw e});
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),...path),{revision:2,type:'SharedMarineExpedition'}));await Promise.race([updated,new Promise((_,reject)=>setTimeout(()=>reject(Error('listener update timed out')),10000))]);assert.ok(received.includes(2));cases.push('authenticated Firestore SDK listener receives server-published marine revisions');unsubscribe();unsubscribe=null;
 await mkdir('output/verification/product-plan/shared-marine',{recursive:true});await writeFile('output/verification/product-plan/shared-marine/rules.json',JSON.stringify({passed:true,cases},null,2));console.log(JSON.stringify({passed:true,rulesCases:cases.length}));
}finally{unsubscribe?.();await env.cleanup();}
