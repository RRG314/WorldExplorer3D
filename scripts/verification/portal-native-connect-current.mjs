import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {portalPairingFixture} from '../../tests/fixtures/portal-pairing.mjs';
import {emptyPortalTrailState,applyPortalAction} from '../../app/js/portal/trail-model.js';
const engine=process.env.WE3D_PORTAL_ENGINE||'chromium';assert.ok(['chromium','webkit'].includes(engine));
const out=path.resolve(process.env.WE3D_NATIVE_CONNECT_OUTPUT||`output/research/vr-portal-product-2026-10-25/native-connect-${engine}`);await fs.mkdir(out,{recursive:true});
const fixture=portalPairingFixture(),at=Date.now();fixture.setTime(at);fixture.setAuth({uid:'owner',auth_time:at/1000,firebase:{sign_in_provider:'google.com'}});
const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const started=await fixture.call('startPortalPairing',{challenge});assert.equal(started.code,200);const requestId=started.body.requestId;
const trail=new Map(),requests=[];
const server=await startStaticServer({rootDir:process.cwd(),ports:[4581],handleRequest:async(req,res,url)=>{
  const name=url.pathname.slice(1);if(!['inspectPortalPairing','approvePortalPairing','cancelPortalApproval','mutatePortalTrail','listPortalTrail'].includes(name))return false;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));requests.push({name,body});
  let reply;
  if(name==='listPortalTrail')reply={code:200,body:{ownerScope:'account:owner',items:[...trail.values()],nextCursor:null}};
  else if(name==='mutatePortalTrail'){const state=applyPortalAction(trail.get(body.action.destinationId)||emptyPortalTrailState(body.action.destinationId),body.action);state.revision++;trail.set(body.action.destinationId,state);reply={code:200,body:{ownerScope:'account:owner',state,operationId:body.action.operationId}};}
  else reply=await fixture.call(name,body,req.method);
  res.writeHead(reply.code,{'Content-Type':'application/json','Cache-Control':'private, no-store'}).end(JSON.stringify(reply.body));return true;
}});
const base=`http://127.0.0.1:${server.port}`,report={passed:false,engine,scope:'Actual responsive Portal UI, WebCrypto and actual pairing service handlers with controlled Auth/App Check/signing/storage boundaries. No live account service, native SDK adoption, real Google/email authentication or physical-device acceptance.',checks:[],pageErrors:[],consoleErrors:[]};
let owned,page;
try{
  const driver=engine==='chromium'?chromium:webkit;owned=await driver.launchServer({headless:true,...(engine==='chromium'?{channel:'chrome',args:['--js-flags=--max-old-space-size=1536']}:{})});
  const browser=await driver.connect(owned.wsEndpoint()),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  // These replacements are confined to this owned browser. The actual Portal
  // controller and HTTP service handlers remain under test. No app bypass.
  await page.route('**/js/auth-ui.js?*',route=>route.fulfill({contentType:'text/javascript',body:`let user=null,observer; export const getCurrentUser=()=>user; export function observeAuth(fn){observer=fn;queueMicrotask(()=>fn(user));return()=>observer=null;} export async function signInWithGoogle(){user={uid:'owner',email:'controlled-explorer@example.invalid',isAnonymous:false};observer?.(user);} export const signInWithEmailPassword=signInWithGoogle; export async function signOutUser(){user=null;observer?.(user);}`}));
  await page.route('**/js/function-api.js?*',route=>route.fulfill({contentType:'text/javascript',body:`export async function postProtectedFunction(name,body,options={}){const response=await fetch('/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:options.signal});const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error),{status:response.status});return value;}`}));
  await page.route('**/js/firebase-init.js?*',route=>route.fulfill({contentType:'text/javascript',body:`export const readFirebaseConfig=()=>({projectId:'we3d-staging-20260712'});`}));
  await page.goto(`${base}/portal/?connect=${requestId}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Sign in to connect',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Sign in with Google',exact:true}).click();
  await page.locator('#nativeConnectionCode').waitFor();assert.equal((await page.locator('#nativeConnectionCode').textContent()).replaceAll(' ',''),started.body.verificationCode);
  assert.equal(await page.getByRole('button',{name:'Approve this device',exact:true}).isDisabled(),true);
  assert.equal(fixture.records.get(`portalPairings/${requestId}`).status,'pending');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'portrait-review.png'),fullPage:true});
  await page.locator('#nativeConfirmCode').check();await page.getByRole('button',{name:'Approve this device',exact:true}).click();
  await page.getByRole('button',{name:'Return to World Explorer 3D',exact:true}).waitFor();assert.equal(fixture.records.get(`portalPairings/${requestId}`).status,'approved');
  const body=requests.find(row=>row.name==='approvePortalPairing').body;assert.match(body.codeHash,/^[A-Za-z0-9_-]{43}$/);assert.equal(Object.hasOwn(body,'code'),false);assert.equal(Object.hasOwn(body,'customToken'),false);assert.equal(JSON.stringify(requests).includes(verifier),false);
  assert.equal(await page.locator('#nativeReturn').getAttribute('href'),null,'A callback credential must not be exposed as a tracked outbound link.');
  report.checks.push('Sign-in, matching visible code and explicit checkbox precede actual approval; posted proof is hashed and bound to the initiating account. No native verifier or SDK token reaches browser requests/UI.');
  await page.setViewportSize({width:844,height:390});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#nativeConnection').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'landscape-approved.png')});
  await runPrescribedGameActions(page,out,[{buttons:[],frames:2}],'#nativeConnection');
  await page.getByRole('button',{name:'Cancel connection',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Return to World Explorer 3D',exact:true}).isVisible(),false);
  await page.getByText('Connection cancelled. Return to your app when you are ready.',{exact:true}).waitFor();assert.equal(fixture.records.get(`portalPairings/${requestId}`).status,'cancelled');
  await page.goto(`${base}/portal/?connect=invalid`,{waitUntil:'networkidle'});await page.getByText('This connection link is invalid. Start a new connection from the app.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve this device',exact:true}).isVisible(),false);
  report.checks.push('Portrait and landscape fit the viewport, Cancel revokes the server approval and retires its pending callback, and invalid links cannot approve a device.');
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack||String(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
