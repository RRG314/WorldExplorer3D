import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const projectId='we3d-staging-20260712';
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
initializeApp({projectId});const db=getFirestore(),roomCode=`M${Date.now().toString(36).slice(-5)}`.toUpperCase(),room=db.collection('rooms').doc(roomCode),marine=room.collection('expeditions').doc('marine');
const dir='output/verification/product-plan/shared-marine';await mkdir(dir,{recursive:true});
const report={scope:'Two actual source-app Ocean clients and actual authenticated Functions/Firestore/Auth emulators; room membership is provisioned, subscription delivery uses an admin listener adapter, and entry-depth provider is controlled. Not production, room-admission UI or physical-device acceptance.',cases:[],errors:[]};
const users=[];let browser,server,renewal;const subscriptions=[];
for(const name of ['captain','pilot']){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${name}-${Date.now()}@example.test`,password:'Local-test-only-934!',returnSecureToken:true})});assert.equal(r.ok,true);const v=await r.json();users.push({uid:v.localId,token:v.idToken,name,renew:true});}
const seat=async(user,expired=false)=>{const now=Date.now();await room.collection('players').doc(user.uid).set({uid:user.uid,displayName:user.name,lastSeenAt:Timestamp.fromMillis(now),expiresAt:Timestamp.fromMillis(expired?now-1:now+90000)});};
const post=async(user,command)=>{const r=await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/mutateSharedExpedition`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify({roomCode,domain:'marine',command})});const body=await r.json();return {status:r.status,...body};};
const command=(type,revision=0,extra={})=>({type,revision,requestId:crypto.randomUUID(),...extra});
async function openClient(user){
 const context=await browser.newContext({viewport:{width:1280,height:800}});user.context=context;
 await context.route('https://wms.gebco.net/**',r=>r.fulfill({status:200,contentType:'text/plain',body:"value_list = '-30'"}));
 const page=await context.newPage();user.page=page;
 page.on('pageerror',e=>report.errors.push({client:user.name,message:e.message}));
 await page.exposeFunction('sendMarine',async cmd=>{const r=await post(user,cmd);if(r.status!==200)throw Error(r.error);return {state:r.state};});
 await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'load'});
 if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx});
 await page.locator('#coralResearchStart').click();await page.waitForFunction(()=>marineCtx.boatDeck?.active,null,{timeout:90000});
 user.personal=await page.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v1'));
 await page.evaluate(async({uid,roomCode})=>{
  const module=await import('/app/js/ocean/shared-marine-runtime.js');
  await module.openSharedMarine(marineCtx,{transport:{uid,roomCode,isCurrent:()=>true,send:command=>window.sendMarine(command),subscribe:(next,error)=>{window.marineReceive=next;window.marineConnectionError=error;return()=>{window.marineReceive=null}}}});
 },{uid:user.uid,roomCode});
 const unsub=marine.onSnapshot(snapshot=>{void page.evaluate(state=>window.marineReceive?.(state),snapshot.exists?snapshot.data():null).catch(()=>{})});subscriptions.push(unsub);
 return page;
}
const waitStage=async(page,stage)=>page.waitForFunction(stage=>marineCtx.sharedMarine?.snapshot().state?.stage===stage&&!marineCtx.sharedMarine.snapshot().transition&&(stage==='underwater'?marineCtx.oceanMode?.active:marineCtx.boatMode?.active&&!marineCtx.oceanMode?.active),stage,{timeout:90000});
try{
 await room.set({ownerUid:users[0].uid,world:{kind:'earth',lat:-18.2861,lon:147.7},maxPlayers:6});await Promise.all(users.map(u=>seat(u)));
 assert.equal((await post(null,command('create'))).status,401);
 await seat(users[0],true);assert.equal((await post(users[0],command('create'))).status,409);assert.equal((await marine.get()).exists,false);await seat(users[0]);report.cases.push('unsigned and expired-seat create rejected without writes');
 renewal=setInterval(()=>{for(const u of users)if(u.renew)void seat(u)},20000);
 server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});browser=await chromium.launch({channel:'chrome',headless:true});
 const captain=await openClient(users[0]);await captain.locator('#sharedMarineCreate').click();await waitStage(captain,'aboard');
 const pilot=await openClient(users[1]);await pilot.waitForSelector('#sharedMarineJoin:visible');await pilot.locator('#sharedMarineJoin').click();await waitStage(pilot,'aboard');
 await pilot.locator('#sharedMarinePilot').click();await pilot.waitForFunction(()=>marineCtx.sharedMarine.snapshot().state.seats.pilot);
 const state=(await marine.get()).data();assert.equal((await post(users[0],command('claim',state.controlRevision,{seat:'pilot'}))).status,409);assert.equal((await post(users[0],command('deploy',0))).status,409);report.cases.push('exclusive pilot and stale revision rejected by actual endpoint');
 await captain.locator('#sharedMarineDeploy').click();await waitStage(captain,'underwater');await waitStage(pilot,'underwater');
 await pilot.waitForFunction(()=>marineCtx.oceanMode.habitat?.group.userData.habitat.assetState==='ready',null,{timeout:45000});
 assert.equal(await pilot.evaluate(()=>marineCtx.sharedMarine.snapshot().error),'');assert.equal(await captain.evaluate(()=>marineCtx.sharedMarine.snapshot().error),'');
 await pilot.screenshot({path:`${dir}/pilot-deployed.png`});
 const before=await pilot.evaluate(()=>({...marineCtx.oceanMode.submarine.position}));await pilot.keyboard.down('w');await pilot.waitForTimeout(1800);await pilot.keyboard.up('w');await pilot.waitForTimeout(4000);
 const positions=await Promise.all([captain,pilot].map(p=>p.evaluate(()=>({...marineCtx.oceanMode.submarine.position}))));report.motion={before,positions,clients:await Promise.all([captain,pilot].map(p=>p.evaluate(()=>({error:marineCtx.sharedMarine.snapshot().error,canPilot:marineCtx.sharedMarine.canPilot,revision:marineCtx.sharedMarine.snapshot().state.revision}))))};assert.ok(Math.hypot(positions[1].x-before.x,positions[1].z-before.z)>1);assert.ok(Math.hypot(positions[0].x-positions[1].x,positions[0].z-positions[1].z)<10,JSON.stringify(positions));
 assert.equal(await captain.evaluate(()=>marineCtx.sharedMarine.canPilot),false);assert.equal(await pilot.evaluate(()=>marineCtx.oceanMode.diver.start()),false);assert.equal(await pilot.evaluate(()=>marineCtx.transferSubmarineToBoat({source:'voyage-recovery'})),false);
 report.cases.push('keyboard pilot movement reaches crew camera; passenger, solo recovery and scuba cannot bypass shared control');
 // Drive the actual submarine controller between study markers. Never seed a
 // server pose or manifest; the authority checks every normal 2.5 s update.
 for(const targetId of ['table-garden','branch-ridge','seagrass-edge']){
  await pilot.bringToFront();
  const reached=await pilot.evaluate(async id=>{
   const c=marineCtx,t=c.oceanMode.habitat.plan.landmarks.find(t=>t.id===id),read=c.readControlActions;let input={};c.readControlActions=()=>input;
   const until=performance.now()+85000;
   try{while(performance.now()<until){
    if(!c.sharedMarine.canPilot)return {ok:false,error:c.sharedMarine.snapshot().error};
    const sub=c.oceanMode.submarine,dx=t.x-sub.position.x,dz=t.z-sub.position.z,d=Math.hypot(dx,dz),dy=-12-sub.position.y,e=Math.atan2(Math.sin(Math.atan2(dx,dz)-sub.yaw),Math.cos(Math.atan2(dx,dz)-sub.yaw));
    if(d<7&&Math.abs(sub.speed)<.2)return {ok:true,distance:d};
    input={turn:d>6?Math.max(-1,Math.min(1,e*2)):0,move:d>6&&Math.abs(e)<.22?Math.min(1,d/24):0,vertical:Math.max(-1,Math.min(1,dy*.5))};await new Promise(requestAnimationFrame);
   }return {ok:false,error:'approach timed out',position:{...c.oceanMode.submarine.position},target:t,state:c.sharedMarine.snapshot()};
   }finally{c.readControlActions=read;}
  },targetId);assert.equal(reached.ok,true,JSON.stringify(reached));
  await pilot.waitForTimeout(6000);await captain.locator('#sharedMarineScan').click();await captain.waitForFunction(id=>marineCtx.sharedMarine.snapshot().state.manifest.some(r=>r.id===id),targetId);
 }
 report.cases.push('three actual-controller approaches produce shared server observations');await captain.screenshot({path:`${dir}/crew-three-observations.png`});
 const savedId=(await marine.get()).data().id;
 await users[0].context.close();users[0].renew=false;await room.collection('players').doc(users[0].uid).delete();await pilot.waitForTimeout(16000);
 await pilot.locator('#sharedMarineHelm').click();await pilot.waitForFunction(uid=>marineCtx.sharedMarine.snapshot().state.seats.helm?.uid===uid,users[1].uid);report.cases.push('host loss retains voyage and permits helm takeover after lease expiry');
 // Reconnect the departed client underwater to the same retained craft/cargo.
 users[0].renew=true;await seat(users[0]);const reconnect=await openClient(users[0]);await reconnect.locator('#sharedMarineJoin').click();await waitStage(reconnect,'underwater');assert.equal(await reconnect.evaluate(()=>marineCtx.sharedMarine.snapshot().state.id),savedId);assert.equal(await reconnect.evaluate(()=>marineCtx.sharedMarine.snapshot().state.manifest.length),3);report.cases.push('underwater reconnect retains one vessel identity and three observations');
 await users[1].context.close();users[1].renew=false;await room.collection('players').doc(users[1].uid).delete();await reconnect.waitForTimeout(16000);await reconnect.locator('#sharedMarineRecover').click();await waitStage(reconnect,'aboard');assert.equal((await marine.get()).data().rescues.length,1);
 await reconnect.locator('#sharedMarineHelm').click();await reconnect.locator('#sharedMarineReport').click();await waitStage(reconnect,'complete');assert.equal((await marine.get()).data().report.observations,3);report.cases.push('lost pilot rescue returns shared cargo aboard and report completes');
 await reconnect.setViewportSize({width:390,height:844});await reconnect.screenshot({path:`${dir}/phone-report.png`});
 assert.equal(await reconnect.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v1')),users[0].personal);report.cases.push('shared voyage never overwrites the personal local voyage');
 await reconnect.locator('#sharedMarineLeave').click();await reconnect.waitForFunction(()=>!marineCtx.sharedMarine&&marineCtx.boatMode.active&&!marineCtx.oceanMode.active,null,{timeout:45000});assert.equal(await reconnect.evaluate(()=>marineCtx.boatMode.transportEntityId),JSON.parse(users[0].personal).ship.transportEntityId);report.cases.push('leaving restores the original personal vessel and clears shared controls');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.failure=e.stack;report.clients=await Promise.all(users.filter(u=>u.page&&!u.page.isClosed()).map(u=>u.page.evaluate(()=>({error:marineCtx.sharedMarine?.snapshot().error,state:marineCtx.sharedMarine?.snapshot().state?.stage,revision:marineCtx.sharedMarine?.snapshot().state?.revision,controlRevision:marineCtx.sharedMarine?.snapshot().state?.controlRevision})).catch(()=>null)));throw e;}finally{
 if(renewal)clearInterval(renewal);subscriptions.forEach(f=>f());await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();await db.recursiveDelete(room);
}
await import('./shared-marine-rules.mjs');
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors}));
