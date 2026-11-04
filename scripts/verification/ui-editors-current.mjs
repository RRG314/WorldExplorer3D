import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';

const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/editors-${Date.now()}`);
const backup=JSON.parse(await fs.readFile('output/verification/companion-handling-20261103/handoff-1793751709613/qa-fieldwork-backup.json','utf8'));
const photo=backup.albums[0].photos[0];
const selected=new Set((process.env.WE3D_UI_CASES||'home,facade,room').split(','));
const report={scope:'Original native capture editors; controlled initial capture metadata and an unchanged genuine gameplay JPEG. No account, save, upload, reconstruction or publication commands. Existing backend/geometry acceptance is retained separately.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:5*60*1000});const{page}=qa;
 for(const kind of selected){
  await page.setViewportSize({width:1440,height:960});await page.goto(base+'/tests/fixtures/ui-client.html');
  await page.evaluate(async({kind,photo})=>{
   await document.fonts.load('16px "World Explorer Trail"');
   const building={sourceAuthority:'osm',sourceBuildingId:'osm:way:ui-fixture',lat:39.29,lon:-76.61,spatialContext:{footprint:[{x:0,z:0},{x:12,z:0},{x:12,z:10},{x:0,z:10}],height:{meters:6,evidence:'inferred'}}};
   const capture={captureId:'ui-'+kind,ownerUid:'disposable-ui-fixture',captureKind:kind==='facade'?'exterior':'interior_room',building,footprintSignature:'ui-fixture',room:{widthMeters:4,lengthMeters:6,heightMeters:2.7},consent:{propertyPermissionConfirmed:true}};
   const options={capture,photos:[{id:'a'.repeat(32)}],signal:new AbortController().signal,loadPhoto:async()=>await(await fetch(photo.dataUrl)).blob(),save:async()=>{throw Error('UI verifier cannot save');},submit:async()=>{throw Error('UI verifier cannot publish');}};
   const module=await import(kind==='home'?'/app/js/reality-capture/home-layout-editor.js':'/app/js/reality-capture/hybrid-editor.js');
   globalThis.editorProbe=await(kind==='home'?module.openHomeLayoutEditor(options):module.openHybridEditor(options));
  },{kind,photo});
  const root=page.locator(kind==='home'?'.homeLayoutEditor':'.captureHybridEditor');await root.waitFor({state:'visible'});
  const views=[];
  for(const[width,height,scale]of [[1440,960,'100'],[390,844,'100'],[844,390,'100'],[390,844,'200']]){
   if(process.env.WE3D_UI_VIEW&&process.env.WE3D_UI_VIEW!==width+'-'+scale)continue;
   report.failureCase={kind,width,height,scale};await page.setViewportSize({width,height});await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);
   const layout=await root.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,background:getComputedStyle(e).backgroundColor,controls:[...e.querySelectorAll('button,input,select,textarea,summary')].filter(n=>n.getBoundingClientRect().width>0).map(n=>({tag:n.tagName,label:(n.getAttribute('aria-label')||n.textContent||[...(n.labels||[])].map(l=>l.textContent).join(' ')).trim().replace(/\s+/g,' ').slice(0,140),height:n.getBoundingClientRect().height}))}));
   report.failureLayout=layout;
   if(layout.scroll>layout.width+1)report.overflow=await root.evaluate(e=>{const bounds=e.getBoundingClientRect();return [...e.querySelectorAll('*')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.right>bounds.right+1||r.left<bounds.left-1);}).map(n=>({tag:n.tagName,attrs:[...n.attributes].filter(a=>a.name!=='style').map(a=>[a.name,a.value]).slice(0,3),width:n.getBoundingClientRect().width,display:getComputedStyle(n).display,min:getComputedStyle(n).minWidth,white:getComputedStyle(n).whiteSpace})).slice(0,25);});
   assert.ok(layout.scroll<=layout.width+1,kind+' reflows '+width+'/'+scale);assert.equal(layout.background,'rgb(24, 26, 30)');
   for(const control of layout.controls)if(control.tag==='BUTTON')assert.ok(control.height>=44,kind+' action target');
   await root.locator('[data-close]').scrollIntoViewIfNeeded();await root.locator('[data-close]').click({trial:true});
   const image=kind+'-'+width+'-'+scale+'.png';await page.screenshot({path:path.join(output,image)});views.push({width,height,scale,image,...layout});
  }
  await root.locator('[data-close]').click();assert.equal(await root.count(),0,'original close disposes editor');report.cases.push({kind,views,ok:true});delete report.failureCase;delete report.failureLayout;console.log(kind);
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.map(c=>c.kind),failure:report.failure}));if(!report.ok)process.exitCode=1;
