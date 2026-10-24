import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {closeOwnedBrowser} from '../owned-browser.mjs';
import {runPrescribedGameActions} from '../prescribed-game-actions.mjs';

export const base=process.env.WE3D_QA_BASE||'https://we3d-staging-20260712.web.app';
export const out=process.env.WE3D_QA_OUTPUT||'output/research/gameplay-qa-2026-10-23/manual';
const wanted=new Set(JSON.parse(process.env.WE3D_QA_CHECKS||'[]'));
export async function createSession({mobile=false}={}){
 await fs.mkdir(out,{recursive:true});
 const manifest=await fetch(base+'/build-manifest.json').then(r=>{assert.equal(r.status,200);return r.json();});
 assert.equal(manifest.firebaseProjectId,'we3d-staging-20260712','Gameplay writes must stay in staging');
 const owned=await chromium.launchServer({channel:'chrome',headless:true,args:['--js-flags=--max-old-space-size=2048']});
 const browser=await chromium.connect(owned.wsEndpoint()),context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1}),page=await context.newPage();
 page.setDefaultTimeout(12000);
 const report={manifest,scope:mobile?'Chrome touch emulation on desktop; not a physical phone':'Installed desktop Chrome; ordinary staging, no debug App Check',checks:[],pageErrors:[],consoleErrors:[],failedResources:[],ownedBrowserClosed:false};let stage='startup';
 page.on('pageerror',e=>report.pageErrors.push({stage,message:e.message}));
 page.on('console',m=>{if(m.type()==='error'&&report.consoleErrors.length<80)report.consoleErrors.push({stage,message:m.text().slice(0,500)});});
 page.on('response',r=>{if(r.status()>=400&&report.failedResources.length<100){const u=new URL(r.url());report.failedResources.push({stage,origin:u.origin,path:u.pathname,status:r.status()});}});
 const read=()=>page.evaluate(()=>{const c=globalThis.qaContext;if(!c)return {};const a=c.activeTransportActor?.();return {gameStarted:c.gameStarted,paused:c.paused,loading:c.worldLoading,ready:c.worldLoadRuntimeState?.status,world:c._worldLoadSequence,mode:c.getCurrentTravelMode?.(),frame:a?.frame,position:a?.position?{x:a.position.x,y:a.position.y,z:a.position.z}:null,environment:c.getEnv?.(),buildings:c.buildings?.length,roads:c.roads?.length,ship:c.activeShipInterior===true,space:c.spaceFlight?.active===true,moon:c.onMoon===true,gpu:c.renderer?{...c.renderer.info.memory}:null};});
 const check=async(id,fn)=>{
  if(wanted.size&&!wanted.has(id))return;
  stage=id;const started=Date.now(),errors=report.pageErrors.length;console.log(JSON.stringify({check:id,status:'running'}));
  const record={id,observedAt:new Date().toISOString(),status:'failed'};
  try{record.details=await fn();assert.equal(report.pageErrors.length,errors,'New JavaScript error during '+id);record.status='passed';}
  catch(e){record.failure={name:e.name,message:e.message};process.exitCode=1;await page.screenshot({path:out+'/'+id+'-failed.png'}).catch(()=>{});}
  record.durationMs=Date.now()-started;record.state=await read().catch(()=>null);report.checks.push(record);await fs.writeFile(out+'/'+id+'.json',JSON.stringify(record,null,2));await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({check:id,status:record.status,durationMs:record.durationMs,failure:record.failure}));return record;
 };
 const boot=async(query='')=>{await page.goto(base+'/app/'+query,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__===true,null,{polling:500,timeout:90000});await page.evaluate(async()=>{globalThis.qaContext=(await import('/app/js/shared-context.js?v=55')).ctx;qaContext.renderer?.domElement.setAttribute('data-gameplay-qa-canvas','main');});if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();};
 const earthReady=()=>page.waitForFunction(()=>{const c=qaContext;return c.gameStarted&&!c.worldLoading&&!c.titleLaunchPending&&!c.earthResumePending&&!c.spaceFlight?.active&&!c.activeShipInterior&&!c.onMoon&&!c.onMars&&c.worldLoadRuntimeState?.status==='ready'&&c.worldLoadRuntimeState?.gameplayRuntimesReady;},null,{timeout:240000,polling:1000});
 const travel=async(selector,mode)=>{await page.locator('#travelBtn').click();await page.locator(selector).click();if(mode)await page.waitForFunction(mode=>qaContext.getCurrentTravelMode()===mode,mode,{timeout:30000,polling:250});};
 const actions=steps=>runPrescribedGameActions(page,out,steps,'canvas[data-gameplay-qa-canvas="main"]');
 const capture=name=>page.screenshot({path:out+'/'+name+'.png'});
 const close=async()=>{try{await closeOwnedBrowser(owned);report.ownedBrowserClosed=true;}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));}};
 return {page,context,report,manifest,read,check,boot,earthReady,travel,actions,capture,close};
}
export const distance=(a,b)=>Math.hypot(b.position.x-a.position.x,b.position.z-a.position.z);
export async function frameWindow(page,milliseconds=20000){
 return page.evaluate(ms=>new Promise(resolve=>{const frames=[];let previous,start,lastRender;const step=now=>{const c=globalThis.qaContext,renderer=c.oceanMode?.active?c.oceanMode.renderer:c.spaceFlight?.active?c.spaceFlight.renderer:c.renderer;const rendered=renderer?.info?.render?.frame;if(start===undefined){start=now;previous=now;lastRender=rendered;requestAnimationFrame(step);return;}if(rendered!==lastRender){frames.push(now-previous);previous=now;lastRender=rendered;}if(now-start<ms){requestAnimationFrame(step);return;}const sorted=[...frames].sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);resolve({durationMs:now-start,count:frames.length,averageFps:frames.length*1000/(now-start),protocol:'native-published-render-frame-changes-v1',p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],maximumMs:sorted.at(-1),over100:frames.filter(x=>x>100).length,over250:frames.filter(x=>x>250).length});};requestAnimationFrame(step);}),milliseconds);
}
export function requirePlayableFrames(value,{mobile=false}={}){
 assert.ok(value.averageFps>=30,'Average FPS below30: '+JSON.stringify(value));assert.ok(value.p95Ms<=(mobile?50:35),'p95 frame pacing outside existing budget: '+JSON.stringify(value));assert.ok(value.p99Ms<=(mobile?100:50),'p99 frame pacing outside existing budget: '+JSON.stringify(value));assert.ok(value.maximumMs<=250,'Visible stall above250ms: '+JSON.stringify(value));
}
