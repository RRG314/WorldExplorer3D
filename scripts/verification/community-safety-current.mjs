import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {browserEmulatorSettings} from './backend-environment.mjs';

const project=process.env.GCLOUD_PROJECT;
assert.match(project||'',/^demo-we3d-community/);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
const out='output/research/location-default-play-2026-10-24';
await fs.mkdir(out,{recursive:true});
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:project},'community-browser'),db=getFirestore(app);
const cfg={...JSON.parse(await fs.readFile('config/firebase.staging.json','utf8')),projectId:project};
const server=await startStaticServer({rootDir:process.cwd(),ports:[4395]});
const origin=`http://127.0.0.1:${server.port}`;
let owned;
const runId=Date.now();
const contexts=[],report={passed:false,scope:'Controlled browser integration of actual consent, room API, social subscription owner, renderers and event handlers with isolated Auth/Firestore/Functions. No 3D world, live-service, phone or performance qualification.',checks:[],pageErrors:[],consoleErrors:[],failedResponses:[]};


try {
  await db.doc('rooms/ROOM01').set({code:'ROOM01',ownerUid:'emulator-fixture',visibility:'public',maxPlayers:10,name:'Community check',mods:{},world:{kind:'earth',lat:39.29,lon:-76.61,seed:'latlon:39.29000,-76.61000'},rules:{allowChat:true,allowGhosts:true}});
  owned=await chromium.launchServer({channel:'chrome',headless:true,args:['--js-flags=--max-old-space-size=768']});
  const browser=await chromium.connect(owned.wsEndpoint());
  async function page(mobile=false){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:760},deviceScaleFactor:1,...(mobile?{isMobile:true,hasTouch:true}:{})});contexts.push(context);
    await context.addInitScript(({cfg,emulators,project})=>{window.WORLD_EXPLORER_FIREBASE=cfg;window.WORLD_EXPLORER_FIREBASE_ENV='staging';window.WORLD_EXPLORER_FIREBASE_EMULATORS=emulators;window.WORLD_EXPLORER_FUNCTIONS_ORIGIN='http://127.0.0.1:5109/'+project+'/us-central1';},{cfg,project,emulators:browserEmulatorSettings()});
    const p=await context.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});p.on('response',r=>{if(r.status()>=400)report.failedResponses.push({status:r.status(),path:new URL(r.url()).pathname});});p.setDefaultTimeout(20000);
    await p.goto(origin+'/tests/fixtures/community-safety-browser.html');await p.waitForFunction(()=>!!window.communityCheck);return p;
  }
  async function accept(p){await p.locator('#communityTermsDialog').waitFor();assert.equal(await p.locator('#communityTermsContinue').isEnabled(),false);await p.locator('#communityTermsAgree').check();await p.locator('#communityTermsContinue').click();await p.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Joined '));}
  const receiver=await page();await receiver.locator('#join').click();await receiver.locator('#communityTermsDialog').waitFor();
  await receiver.locator('#communityTermsCancel').click();await receiver.waitForFunction(()=>document.getElementById('status').textContent.includes('Sharing cancelled'));
  const receiverUid=await receiver.evaluate(()=>communityCheck.state.authUser.uid);
  assert.equal((await db.doc('rooms/ROOM01/players/'+receiverUid).get()).exists,false);
  assert.equal((await db.doc('users/'+receiverUid+'/consents/community').get()).exists,false);
  report.checks.push('Declining the real guest dialog creates no consent or room membership');
  await receiver.locator('#join').click();await accept(receiver);
  const sender=await page(true);await sender.locator('#join').click();await sender.locator('#communityTermsDialog').waitFor();await sender.screenshot({path:out+'/community-terms-mobile.png'});await accept(sender);
  const senderUid=await sender.evaluate(()=>communityCheck.state.authUser.uid);
  await sender.locator('#message').fill('Hello from the other explorer');await sender.locator('#send').click();await receiver.getByText('Hello from the other explorer',{exact:true}).waitFor();
  report.checks.push('Both real guest dialogs persist acceptance; HTTP admission and chat delivery succeed');
  await receiver.locator('[data-block-player="'+senderUid+'"]').click();await receiver.waitForFunction(()=>communityCheck.state.blockedPlayers.length===1);
  await receiver.waitForFunction(()=>!document.getElementById('roomChatMessages').textContent.includes('Hello from the other explorer'));
  await receiver.screenshot({path:out+'/blocked-chat-desktop.png'});
  await sender.locator('#target').fill(receiverUid);await sender.locator('#invite').click();await sender.waitForFunction(()=>/permission|permissions/i.test(document.getElementById('status').textContent));
  assert.equal((await db.doc('users/'+receiverUid+'/incomingInvites/'+senderUid+'_ROOM01').get()).exists,false);
  report.checks.push('Actual Block control hides received chat and server rules reject the blocked sender’s invitation');
  await receiver.reload();await receiver.waitForFunction(uid=>window.communityCheck?.state.authUser?.uid===uid,receiverUid);await receiver.locator('#join').click();
  await receiver.waitForFunction(()=>document.getElementById('status').textContent==='Joined ROOM01'&&communityCheck.state.blockedPlayersReady);
  assert.equal(await receiver.locator('#communityTermsDialog').count(),0);assert.equal(await receiver.getByText('Hello from the other explorer',{exact:true}).count(),0);
  await receiver.getByRole('button',{name:'Unblock',exact:true}).click();await receiver.getByText('Hello from the other explorer',{exact:true}).waitFor();
  await sender.locator('#invite').click();await sender.waitForFunction(()=>document.getElementById('status').textContent==='Invite sent');await receiver.getByText('Join us',{exact:true}).waitFor();
  report.checks.push('Reload retains identity, consent and block; Unblock restores chat and a normal invitation without exposing the recipient inbox');
  await sender.locator('#weekly').click();await sender.waitForFunction(()=>communityCheck.state.currentRoom?.systemKind==='weekly');
  await receiver.locator('#weekly').click();await receiver.waitForFunction(()=>communityCheck.state.currentRoom?.systemKind==='weekly');
  const weekly=await sender.evaluate(()=>communityCheck.state.currentRoom.code);assert.equal(await receiver.evaluate(()=>communityCheck.state.currentRoom.code),weekly);
  assert.equal((await db.collection('rooms/'+weekly+'/players').get()).size,2);report.checks.push('Two guests still enter the same server-owned weekly room after consent; no 3D city load claimed');
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
} catch(error) {report.failure=error.stack;process.exitCode=1;for(const [i,context] of contexts.entries())for(const p of context.pages())await p.screenshot({path:out+'/community-failed-'+runId+'-'+i+'.png'}).catch(()=>{});}
finally {if(owned)await closeOwnedBrowser(owned);await server.close();await db.terminate();await deleteApp(app);await fs.writeFile(out+'/community-browser-'+runId+'.json',JSON.stringify(report,null,2)+'\n');await fs.writeFile(out+'/community-browser.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
