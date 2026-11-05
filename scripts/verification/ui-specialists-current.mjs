import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192',output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/specialists-${Date.now()}`),selected=new Set((process.env.WE3D_UI_CASES||'').split(',').filter(Boolean));
const cases=[['geology','geology-station.html','#open'],['archaeology','archaeology-station.html?open=1'],['palaeontology','palaeontology-station.html?open=1'],['wildlife','wildlife-station.html?open=1'],['botany','botany-station.html?preview=1'],['hydrology','hydrology-station.html'],['meteorology','meteorology-station.html'],['astronomy','astronomy-station.html'],['oceanography','oceanography-station.html',null,'.oceanography-career'],['marine-biology','marine-biology-station.html',null,'.marine-biology'],...['cartography','mining','accelerator'].map(id=>[id,'ui-specialist-station.html?career='+id])];
const report={scope:'Original native specialist views and controlled initial models. Presentation/control inventory only; no repeated scientific procedure, physical observation or career completion. All product entry styles are loaded.',cases:[],screens:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:8*60*1000});const {page}=qa;
 const entry=await fetch(base+'/app/').then(r=>r.text());const styles=[...entry.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>new URL(m[1],base+'/app/').href).filter(u=>u.startsWith(base));
 for(const [id,file,trigger,selector='dialog.research-station']of cases){if(selected.size&&!selected.has(id))continue;report.failureCase={id,file};
  await page.setViewportSize({width:1440,height:960});await page.goto(base+'/tests/fixtures/'+file,{waitUntil:'domcontentloaded'});
  for(const url of styles)await page.addStyleTag({url});
  await page.evaluate(()=>document.fonts.load('16px "World Explorer Trail"'));await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('16px "World Explorer Trail"')),true,'bundled font loaded');
  if(trigger)await page.locator(trigger).click();const root=page.locator(selector).first();await root.waitFor({state:'visible'});
  const views=[];
  for(const [width,height,scale]of [[1440,960,'100'],[390,844,'100'],[844,390,'100'],[390,844,'200']]){
   if(process.env.WE3D_UI_VIEW&&process.env.WE3D_UI_VIEW!==width+'-'+scale)continue;
   report.failureCase={id,file,width,height,scale};await page.setViewportSize({width,height});await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);
   const controls=await root.locator('button,input,select,textarea,summary,a[href]').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,type:e.type,label:(e.getAttribute('aria-label')||e.getAttribute('title')||[...(e.labels||[])].map(l=>l.textContent).join(' ')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,180),disabled:!!e.disabled,width:r.width,height:r.height};}));
   assert.ok(controls.length>0,id+' native controls');assert.ok(controls.every(c=>c.label),id+' controls labelled');
   assert.ok(controls.filter(c=>c.tag==='BUTTON').every(c=>c.height>=44),id+' buttons retain target height');
   const bounds=await root.boundingBox();if(selector.startsWith('dialog'))assert.ok(bounds.x>=-.5&&bounds.y>=-.5&&bounds.x+bounds.width<=width+.5&&bounds.y+bounds.height<=height+.5,id+' dialog fits');
   const close=root.locator('[data-research-close]');if(await close.count()){await close.scrollIntoViewIfNeeded();assert.ok(await close.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),id+' close exposed');}
   if(selector.startsWith('dialog'))assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollLeft===0),id+' reading origin stays visible after focus');
   const image=id+'-'+width+'-'+scale+'.png';await page.screenshot({path:path.join(output,image)});report.screens.push(image);views.push({width,height,scale,controls});
  }
  if(selector.startsWith('dialog')){await page.keyboard.press('Escape');assert.equal(await root.isVisible(),false,id+' closes through original owner');}
  report.cases.push({id,views,ok:true});delete report.failureCase;await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(id);
 }
 assert.deepEqual(qa.report.errors,[]);report.providerErrors=qa.report.providerErrors;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.map(c=>c.id),failure:report.failure}));if(!report.ok)process.exitCode=1;
