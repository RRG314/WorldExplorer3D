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
const dir=process.env.WE3D_MARINE_REPORT_DIR||'output/verification/product-plan/shared-marine';await mkdir(dir,{recursive:true});
const report={scope:'Two actual selected-build Ocean clients and actual authenticated Functions/Firestore/Auth emulators; room fixture is provisioned and clients use actual room admission, subscription delivery uses the actual authenticated browser SDK, and entry-depth provider is controlled. Not production, room-admission UI or physical-device acceptance.',cases:[],errors:[]};
const users=[];let browser,server,renewal;
for(const name of ['captain','pilot']){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${name}-${Date.now()}@example.test`,password:'Local-test-only-934!',returnSecureToken:true})});assert.equal(r.ok,true);const v=await r.json();users.push({uid:v.localId,token:v.idToken,name,email:v.email,renew:true});}
const seat=async(user,expired=false)=>{const now=Date.now();await room.collection('players').doc(user.uid).set({uid:user.uid,displayName:user.name,lastSeenAt:Timestamp.fromMillis(now),expiresAt:Timestamp.fromMillis(expired?now-1:now+90000)},{merge:true});};
const post=async(user,command)=>{const r=await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/mutateSharedExpedition`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify({roomCode,domain:'marine',command})});const body=await r.json();return {status:r.status,...body};};
const command=(type,revision=0,extra={})=>({type,revision,requestId:crypto.randomUUID(),...extra});
async function openClient(user){
 const context=await browser.newContext({viewport:{width:1280,height:800}});user.context=context;
 await context.addInitScript(({projectId})=>{globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS={enabled:true,host:'127.0.0.1',authPort:9099,firestorePort:8080,storagePort:9199};globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN=`http://127.0.0.1:5001/${projectId}/us-central1`;},{projectId});
 await context.route('**/api/geospatial/reverse?**',r=>r.fulfill({status:503,json:{error:'Controlled naming outage'}}));
 await context.route('https://wms.gebco.net/**',r=>r.fulfill({status:200,contentType:'text/plain',body:"value_list = '-30'"}));
 const page=await context.newPage();user.page=page;
 page.on('pageerror',e=>report.errors.push({client:user.name,message:e.message}));
 await page.goto(`http://127.0.0.1:${server.port}/app/?diagnostics=1`,{waitUntil:'domcontentloaded'});
 if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx});
 await page.locator('#coralResearchStart').click();try{await page.waitForFunction(()=>marineCtx.boatDeck?.active,null,{timeout:45000});}catch(error){await page.screenshot({path:`${dir}/${user.name}-entry-failure.png`});report.entryFailure=await page.evaluate(()=>({status:document.querySelector('#globeLocationSearchStatus')?.textContent,boat:marineCtx.boatMode?.active,ocean:marineCtx.oceanMode?.active,deck:marineCtx.boatDeck?.snapshot(),environment:marineCtx.getEnv?.(),text:document.body.innerText.slice(-5000)}));throw error;}
 user.personal=await page.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v1'));
 await page.evaluate(async({email,roomCode})=>{
  const {signInWithEmailAndPassword}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
  const services=globalThis.WorldExplorerFirebase.initFirebase();
  const credential=await signInWithEmailAndPassword(services.auth,email,'Local-test-only-934!');
  const {getCurrentUser}=await import('/js/auth-ui.js?v=56');
  const until=Date.now()+15000;while(getCurrentUser()?.uid!==credential.user.uid&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
  if(getCurrentUser()?.uid!==credential.user.uid)throw Error('Application sign-in did not settle');
  const manifest=await fetch('/build-manifest.json').then(r=>r.json());
  await import(manifest.runtimePackaging?.entries?.['multiplayer-rooms']?'/app/'+manifest.runtimePackaging.entries['multiplayer-rooms']:'/app/js/multiplayer/rooms.js?v=67');
  await globalThis.__WE3D_ROOM_SUPPORT__.join(roomCode);
 },{email:user.email,roomCode});
 await page.getByText('Vessel options',{exact:true}).click();
 await page.locator('#researchSharedCrew').click();
 await page.waitForSelector('#sharedMarineControls');

 return page;
}
const waitStage=async(page,stage)=>page.waitForFunction(stage=>marineCtx.sharedMarine?.snapshot().state?.stage===stage&&!marineCtx.sharedMarine.snapshot().transition&&(stage==='underwater'?marineCtx.oceanMode?.active:marineCtx.boatMode?.active&&!marineCtx.oceanMode?.active),stage,{timeout:90000});
try{
 const save=async(user,body)=>{const response=await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/saveExplorerPlayerCondition`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const health={condition:.9,reason:'controlled-retry',mutationId:crypto.randomUUID(),expectedRevision:0};
 assert.equal((await save(null,health)).status,401);
 const first=await save(users[0],health);assert.equal(first.status,200);assert.equal(first.body.revision,1);
 const newer=await save(users[0],{...health,condition:.4,mutationId:crypto.randomUUID(),expectedRevision:1});assert.equal(newer.status,200);assert.equal(newer.body.revision,2);
 const replay=await save(users[0],health);assert.equal(replay.status,200);assert.equal(replay.body.condition,.4);assert.equal(replay.body.revision,2);
 const stale=await save(users[0],{...health,mutationId:crypto.randomUUID()});assert.equal(stale.status,409);assert.equal(stale.body.state.revision,2);
 const separate=await save(users[1],health);assert.equal(separate.status,200);assert.equal(separate.body.revision,1);
 report.cases.push('authenticated condition transaction is revision-checked, retry-safe and account-isolated');
 await room.set({ownerUid:users[0].uid,world:{kind:'earth',lat:-18.2861,lon:147.7},maxPlayers:6});await Promise.all(users.map(u=>seat(u)));
 assert.equal((await post(null,command('create'))).status,401);
 await seat(users[0],true);assert.equal((await post(users[0],command('create'))).status,409);assert.equal((await marine.get()).exists,false);await seat(users[0]);report.cases.push('unsigned and expired-seat create rejected without writes');
 renewal=setInterval(()=>{for(const u of users)if(u.renew)void seat(u)},20000);
 server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4396]});browser=await chromium.launch({channel:'chrome',headless:true});
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
 // Exercise a lost/delayed response through the real SDK/HTTP transport. The
 // Function commits normally; only acknowledgment delivery is fault-injected.
 let delayed=false;
 const endpoint='**/us-central1/mutateSharedExpedition';
 await pilot.route(endpoint,async route=>{
  if(!delayed&&route.request().postDataJSON()?.command?.type==='pose'){
   delayed=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,3500));await route.fulfill({response});
  }else await route.continue();
 });
 await pilot.keyboard.down('w');
 await pilot.waitForFunction(()=>marineCtx.sharedMarine.snapshot().connection?.blocked,null,{timeout:12000});
 assert.equal(await pilot.evaluate(()=>marineCtx.sharedMarine.canPilot),false);
 assert.equal(await pilot.evaluate(()=>marineCtx.sharedMarine.snapshot().connection.pending),1);
 await pilot.keyboard.up('w');
 await pilot.waitForFunction(()=>marineCtx.sharedMarine.canPilot&&!marineCtx.sharedMarine.snapshot().connection.pending,null,{timeout:15000});
 await pilot.unroute(endpoint);
 assert.equal(delayed,true);assert.equal(await pilot.evaluate(()=>marineCtx.sharedMarine.snapshot().error),'');
 report.cases.push('delayed committed pose pauses prediction, bounds pending work and reconciles without travel-envelope failure');
 let lost=false;
 await pilot.route(endpoint,async route=>{
  if(!lost&&route.request().postDataJSON()?.command?.type==='pose'){lost=true;await route.fetch();await route.abort('failed');}
  else await route.continue();
 });
 await pilot.waitForFunction(()=>marineCtx.sharedMarine.snapshot().connection?.recovering,null,{timeout:15000});
 await pilot.waitForFunction(()=>marineCtx.sharedMarine.canPilot&&!marineCtx.sharedMarine.snapshot().connection.recovering,null,{timeout:15000});
 await pilot.unroute(endpoint);assert.equal(lost,true);
 report.cases.push('lost acknowledgment reconnects automatically to the committed submarine pose');
 // Drive the actual submarine controller between study markers. Never seed a
 // server pose or manifest; the authority checks every normal 2.5 s update.
 for(const targetId of ['table-garden','branch-ridge','seagrass-edge']){
  await pilot.bringToFront();
  const reached=await pilot.evaluate(async id=>{
   const c=marineCtx,t=c.oceanMode.habitat.plan.landmarks.find(t=>t.id===id),read=c.readControlActions;let input={},pauseStarted=null,pauseCount=0,pausedMs=0;c.readControlActions=()=>input;
   const pilotUid=c.sharedMarine.snapshot().state.seats.pilot?.uid,until=performance.now()+85000;
   try{while(performance.now()<until){
    if(!c.sharedMarine.canPilot){
     // Real clients stop prediction while an acknowledgment is delayed. Keep
     // controls neutral during that bounded recovery, without extending the
     // overall approach deadline or masking a lost seat/stage/connection.
     input={};const state=c.sharedMarine.snapshot(),now=performance.now();
     if(!pilotUid||!state.active||state.state?.stage!=='underwater'||state.state.seats.pilot?.uid!==pilotUid||state.transition||!state.connection?.blocked)
      return {ok:false,error:state.error||'Pilot authority lost',state};
     if(pauseStarted===null){pauseStarted=now;pauseCount++;}
     if(now-pauseStarted>15000)return {ok:false,error:'Pilot recovery timed out',state};
     await new Promise(requestAnimationFrame);continue;
    }
    if(pauseStarted!==null){pausedMs+=performance.now()-pauseStarted;pauseStarted=null;}
    const sub=c.oceanMode.submarine,dx=t.x-sub.position.x,dz=t.z-sub.position.z,d=Math.hypot(dx,dz),dy=-12-sub.position.y,e=Math.atan2(Math.sin(Math.atan2(dx,dz)-sub.yaw),Math.cos(Math.atan2(dx,dz)-sub.yaw));
    if(d<7&&Math.abs(sub.speed)<.2)return {ok:true,distance:d,pauseCount,pausedMs};
    input={turn:d>6?Math.max(-1,Math.min(1,e*2)):0,move:d>6&&Math.abs(e)<.22?Math.min(1,d/24):0,vertical:Math.max(-1,Math.min(1,dy*.5))};await new Promise(requestAnimationFrame);
   }return {ok:false,error:'approach timed out',position:{...c.oceanMode.submarine.position},target:t,state:c.sharedMarine.snapshot()};
   }finally{c.readControlActions=read;}
  },targetId);assert.equal(reached.ok,true,JSON.stringify(reached));
  (report.approaches||=[]).push({targetId,...reached});
  // A fixed sleep races the authoritative stop publication under real latency.
  // Wait for a fresh, stationary server pose at the marker, then check the
  // actual scan response so a rejected command cannot be hidden by heartbeats.
  await captain.waitForFunction(({id,after})=>{
   const s=marineCtx.sharedMarine.snapshot().state,t=marineCtx.oceanMode.habitat.plan.landmarks.find(t=>t.id===id),p=s.submarine.pose;
   return s.submarine.poseAtMs>after&&s.submarine.speed<=.6&&Math.hypot(p.x-t.x,p.z-t.z)*(marineCtx.METERS_PER_WORLD_UNIT||1)<18;
  },{id:targetId,after:Date.now()},{timeout:15000});
  const scanResponse=captain.waitForResponse(response=>response.url().endsWith('/mutateSharedExpedition')&&response.request().method()==='POST'&&response.request().postDataJSON()?.command?.type==='scan',{timeout:15000});
  await captain.locator('#sharedMarineScan').click();const response=await scanResponse;
  assert.equal(response.status(),200,`Study scan rejected: ${await response.text()}`);
  await captain.waitForFunction(id=>marineCtx.sharedMarine.snapshot().state.manifest.some(r=>r.id===id),targetId);
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
 if(renewal)clearInterval(renewal);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();await db.recursiveDelete(room);
}
await import('./shared-marine-rules.mjs');
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,errors:report.errors}));
