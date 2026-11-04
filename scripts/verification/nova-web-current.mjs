import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_NOVA_OUTPUT||`output/verification/nova-ui-20261104/web-${Date.now()}`);
const paths=['index.html','portal/index.html','account/index.html','account/admin.html','account/moderation.html','account/tester.html','account/testers.html','app/capture.html','app/survey.html','about.html','about/index.html','legal/privacy.html','legal/privacy/index.html','legal/terms.html','legal/terms/index.html','legal/delete-account.html'];
const selected=new Set((process.env.WE3D_NOVA_PAGES||'').split(',').filter(Boolean));
const report={scope:'Actual public source pages and signed-out authorization boundaries; no sign-in, purchases, uploads, moderation or destructive submissions. Native platform/hardware and authenticated backend acceptance retained separately.',pages:[],links:[],errors:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:8*60*1000});const {page}=qa;const links=new Set();
 for(const file of paths){if(selected.size&&!selected.has(file))continue;
  await page.setViewportSize({width:1440,height:960});await page.goto(base+'/'+file,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.readyState==='complete');await page.waitForTimeout(600);
  const record={file,url:page.url(),views:[]};report.pages.push(record);
  for(const [width,height] of [[1440,960],[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:getComputedStyle(document.documentElement).getPropertyValue('--wx-action').trim(),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),controls:[...document.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return {id:e.id,tag:e.tagName,label:(e.getAttribute('aria-label')||e.getAttribute('title')||[...(e.labels||[])].map(l=>l.textContent).join(' ')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,180),href:e.getAttribute('href'),disabled:!!e.disabled,width:r.width,height:r.height};})}));
   assert.ok(layout.scrollWidth<=width+1,file+' fits '+width);assert.equal(layout.theme,'#d1b6ff');assert.deepEqual(layout.broken,[],file+' images load');
   for(const control of layout.controls){if(control.href){const url=new URL(control.href,page.url());if(url.origin===new URL(base).origin)links.add(url.pathname);}}
   const image=file.replaceAll('/','-').replace('.html','')+'-'+width+'.png';await page.screenshot({path:path.join(output,image)});record.views.push({width,height,image,...layout});
  }
  if(file==='portal/index.html'){
   await page.locator('#accountBtn').click();await page.locator('#account').waitFor({state:'visible'});assert.equal(await page.locator('#signInForm input[required]').count(),2);await page.screenshot({path:path.join(output,'portal-sign-in.png')});await page.locator('#account .close').click();assert.equal(await page.locator('#account').isVisible(),false);record.signInDialog=true;
   for(const mode of await page.locator('.modes button').all()){await mode.click();await page.waitForTimeout(100);assert.equal(await mode.getAttribute('aria-pressed'),'true');}record.modeControls=true;
  }
  await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(file);
 }
 for(const pathname of links){if(/\.(apk|aab|dmg|zip|glb|png|webp|jpg)$/i.test(pathname))continue;const response=await fetch(base+pathname,{method:'HEAD'});report.links.push({pathname,status:response.status});assert.ok(response.ok,'local link resolves '+pathname);}
 report.errors=qa.report.errors;assert.deepEqual(report.errors,[]);report.providerErrors=qa.report.providerErrors;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,pages:report.pages.map(p=>p.file),failure:report.failure}));if(!report.ok)process.exitCode=1;
