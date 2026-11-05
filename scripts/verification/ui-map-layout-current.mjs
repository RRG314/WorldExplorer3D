import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/map-layout-${Date.now()}`),selected=new Set((process.env.WE3D_UI_LAYOUT_CASES||'').split(',').filter(Boolean));
const report={scope:'Actual extracted map DOM/styles. Geometry, text scale and target exposure only. No world map rendering, search service, filter action or navigation claim.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:4*60*1000});const {page}=qa;
 await page.goto('http://127.0.0.1:4192/tests/fixtures/ui-layout.html?context=map');await page.waitForFunction(()=>window.uiLayoutReady);
 for(const [width,height]of [[1440,960],[390,844],[844,390]])for(const scale of ['100','200']){
  if(selected.size&&!selected.has(`${width}-${scale}`))continue;
  report.failureCase={width,height,scale};await page.setViewportSize({width,height});await page.evaluate(scale=>{document.documentElement.dataset.we3dTextScale=scale;document.getElementById('largeMap').scrollTo(0,0);},scale);
  const canvas=await page.locator('#largeMapCanvas').boundingBox();assert.ok(Math.abs(canvas.width-canvas.height)<1,'map preserves square click projection');
  for(const id of ['mapClose','mapSearchBtn','mapRecenter','mapLegend','mapZoomIn','mapZoomOut','mapSatelliteToggle','mapRoadsToggle']){
   const node=page.locator('#'+id);await node.scrollIntoViewIfNeeded();assert.ok(await node.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=-.5&&r.right<=innerWidth+.5&&r.y>=-.5&&r.bottom<=innerHeight+.5&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),id+' exposed '+width+'/'+scale);
  }
  await page.locator('#largeMap').evaluate(e=>e.scrollTo(0,0));await page.screenshot({path:path.join(output,`map-${width}-${scale}.png`)});
  await page.locator('#legendPanel').evaluate(e=>e.style.display='block');
  for(const id of ['legendCloseBtn','legendShowAllBtn','legendHideAllBtn']){const node=page.locator('#'+id);await node.scrollIntoViewIfNeeded();assert.ok(await node.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),id+' exposed');}
  await page.locator('#legendPanel').evaluate(e=>e.scrollTo(0,0));await page.screenshot({path:path.join(output,`layers-${width}-${scale}.png`)});await page.locator('#legendPanel').evaluate(e=>e.style.display='none');
  report.cases.push({width,height,scale,ok:true});delete report.failureCase;
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases,failure:report.failure}));if(!report.ok)process.exitCode=1;
