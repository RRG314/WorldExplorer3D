import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/document-export-${Date.now()}`),base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const data=JSON.parse(await fs.readFile('output/verification/companion-handling-20261103/handoff-1793751709613/qa-fieldwork-backup.json','utf8'));
const report={scope:'Two actual HTML export functions with genuine accepted three-photo album. Offline document layout only; no capture, fieldwork, publication or durable history replay.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:3*60*1000});const {page}=qa;
 await page.goto(base+'/tests/fixtures/ui-client.html');await page.evaluate(()=>document.fonts.ready);
 const exports=await page.evaluate(async data=>{const {photoAlbumHtml}=await import('/app/js/campaign/three-views-capture.js'),{documentaryStoryHtml}=await import('/app/js/campaign/documentary-ui.js');return [['album',photoAlbumHtml(data.profile.threeViews,data.albums[0])],['story',documentaryStoryHtml(data.profile.threeViews,data.albums[0])]];},data);
 await page.goto('about:blank');await page.route('**/*',route=>route.abort());
 for(const [name,html]of exports){await page.setContent(html);await page.waitForFunction(()=>[...document.images].length===3&&[...document.images].every(i=>i.complete&&i.naturalWidth>100));assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(24, 26, 30)');
  for(const [width,height]of [[1440,960],[390,844]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,name+'-'+width+'.png')});}
  assert.equal((html.match(/src="data:image\/jpeg;base64,/g)||[]).length,3);assert.doesNotMatch(html,/<link[^>]+stylesheet|@import|url\(https?:/i);report.cases.push({name,originalPhotos:3,selfContained:true,ok:true});
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases,failure:report.failure}));if(!report.ok)process.exitCode=1;
