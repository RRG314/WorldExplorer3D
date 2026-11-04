import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const selected=new Set((process.env.WE3D_UI_CASES||'').split(',').filter(Boolean));
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/account-layout-${Date.now()}`),report={scope:'Static original account DOM/styles without account controllers or backend. Retained authorization/action acceptance stays separate. Private section layout only.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:4*60*1000});const {page}=qa;await page.goto('http://127.0.0.1:4192/tests/fixtures/ui-account-layout.html');await page.waitForFunction(()=>window.accountLayout);await page.evaluate(()=>document.fonts.ready);
 for(const view of await page.evaluate(()=>accountLayout.targets))for(const[width,height,scale]of [[1440,960,'100'],[390,844,'100'],[844,390,'100'],[390,844,'200']]){
  if(selected.size&&!selected.has(`${view}-${width}-${scale}`))continue;
  report.failureCase={view,width,height,scale};await page.setViewportSize({width,height});await page.evaluate(({view,scale})=>{document.documentElement.dataset.we3dTextScale=scale;accountLayout.show(view);scrollTo(0,0);},{view,scale});
  const controls=await page.locator(`[data-account-view="${view}"]`).evaluate(e=>[...e.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect();return{id:n.id,tag:n.tagName,label:(n.getAttribute('aria-label')||[...(n.labels||[])].map(l=>l.textContent).join(' ')||n.textContent||n.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,160),width:r.width,height:r.height};}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' width');
  await page.screenshot({path:path.join(output,`${view}-${width}-${scale}.png`)});report.cases.push({view,width,height,scale,controls,ok:true});delete report.failureCase;
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.length,failure:report.failure}));if(!report.ok)process.exitCode=1;
