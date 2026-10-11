import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out=process.env.WE3D_STREET_PRIORITY_OUTPUT||'output/roadmap-20261011/street-priority';
await mkdir(out,{recursive:true});let server,browser,page;
const report={ok:false,scope:'Actual pavement publisher, native workers, renderer and contact on four captured street excerpts over a sloped test terrain. Controlled pending worker requests. Not a full city or performance certification.',cases:[],errors:[]};
const check=(name,pass,detail)=>{report.cases.push({name,pass:!!pass,detail});assert.ok(pass,name);};
try{
 server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});
 browser=await chromium.launch({channel:'chrome',headless:false});page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',error=>report.errors.push(error.message));collectBrowserGraphicsErrors(page,report.errors);
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;window.streetWorkerGate={hold:null,held:0,retired:0};
  window.Worker=class extends NativeWorker{
   constructor(url,options){super(url,options);this.isOverview=String(url).includes('street-overview-worker');}
   postMessage(data,...rest){if(this.isOverview&&data.type===streetWorkerGate.hold){streetWorkerGate.held++;return;}super.postMessage(data,...rest);}
   terminate(){if(this.isOverview)streetWorkerGate.retired++;super.terminate();}
  };
 });
 await page.goto(`http://127.0.0.1:${server.port}/scripts/verification/street-streaming.html`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.streetStreamingTest);
 await page.evaluate(()=>streetStreamingTest.detail(0,0));
 const before=await page.evaluate(()=>streetStreamingTest.snapshot());
 check('initial detail publishes real pavement and walk contact',before.near.triangles>0&&before.near.tiles>0,before.near);
 const contact=await page.evaluate(()=>{
  const p=streetStreamingTest.ctx.streetPavement,m=p.meshes.find(m=>m.userData.kind==='sidewalk');
  const v=m.geometry.attributes.position.array,indices=m.geometry.index.array;
  let maximumDifference=0,checked=0;
  for(let i=0;i<indices.length;i+=Math.max(3,Math.floor(indices.length/90)*3)){
   const [a,b,c]=[indices[i]*3,indices[i+1]*3,indices[i+2]*3];if(!Number.isInteger(c))continue;
   const x=(v[a]+v[b]+v[c])/3,z=(v[a+2]+v[b+2]+v[c+2])/3,y=(v[a+1]+v[b+1]+v[c+1])/3;
   const actual=p.sampleAt(x,z);if(!Number.isFinite(actual))return {checked,missing:true};
   maximumDifference=Math.max(maximumDifference,Math.abs(actual-y));checked++;
  }
  return {checked,maximumDifference};
 });
 check('walk support matches the rendered pavement triangles',!contact.missing&&contact.checked>0&&contact.maximumDifference<.002,contact);
 await page.locator('#closeStart').click();await page.screenshot({path:`${out}/initial.png`});
 await page.evaluate(()=>{streetWorkerGate.hold='prepare';streetStreamingTest.createOverview().step({x:0,z:0});});
 await page.waitForFunction(()=>streetWorkerGate.held===1);
 const first=await page.evaluate(async()=>{
  const t=streetStreamingTest,old=t.ctx.streetPavement,started=performance.now();
  await t.detail(1024,1024);
  return {durationMs:performance.now()-started,retired:streetWorkerGate.retired,oldDetached:old.meshes.length===0,state:t.snapshot()};
 });
 check('nearby district publishes while distant preparation is deliberately held',first.retired===1&&first.oldDetached&&first.state.focus.x===1024&&first.state.focus.z===1024,first);
 await page.locator('#closeFar').click();await page.screenshot({path:`${out}/far.png`});
 await page.evaluate(async()=>{streetWorkerGate.hold=null;const o=streetStreamingTest.ctx.streetOverview;o.step({x:1024,z:1024});await o.pause();});
 const accepted=await page.evaluate(()=>structuredClone(streetStreamingTest.ctx.streetOverview.stats));
 check('distant coverage restarts after nearby publication',accepted.completedCells===1&&accepted.error===null,accepted);
 await page.evaluate(()=>{streetWorkerGate.hold='next';streetStreamingTest.ctx.streetOverview.step({x:0,z:0});});
 await page.waitForFunction(()=>streetWorkerGate.held===2);
 const second=await page.evaluate(async()=>{await streetStreamingTest.detail(0,0);return {retired:streetWorkerGate.retired,state:streetStreamingTest.snapshot()};});
 check('return arrival retires unfinished distant cell without losing accepted coverage',second.retired===2&&second.state.focus.x===0&&second.state.overview.completedCells===accepted.completedCells&&second.state.overview.retainedBytes===accepted.retainedBytes,second);
 await page.evaluate(async()=>{
  streetWorkerGate.hold=null;const t=streetStreamingTest,o=t.ctx.streetOverview;
  for(let i=0;i<600;i++){o.step(t.ctx.car);await o.pause();if(['complete','failed'].includes(o.stats.status))break;}
  t.report();
 });
 const complete=await page.evaluate(()=>streetStreamingTest.snapshot());
 check('resumed native overview reaches every planned cell exactly once',complete.overview.status==='complete'&&complete.overview.completedCells===complete.overview.totalCells&&complete.overview.error===null,complete);
 await page.locator('#wide').click();await page.screenshot({path:`${out}/complete.png`});
 await runPrescribedGameActions(page,out,[{buttons:[],frames:3}],'canvas');
 check('browser and GPU remain error free',report.errors.length===0,report.errors);
 await page.locator('#reset').click();await page.waitForFunction(()=>!streetStreamingTest.ctx.streetPavement&&!streetStreamingTest.ctx.streetOverview);
 const disposed=await page.evaluate(()=>({surfaces:streetStreamingTest.ctx.urbanSurfaceMeshes.length,cache:streetStreamingTest.ctx._streetPavementCache.bytes,paths:streetStreamingTest.ctx.linearFeatureMeshes.length}));
 check('owned surfaces, mapped paths and packet cache retire together',disposed.surfaces===0&&disposed.cache===0&&disposed.paths===0,disposed);
 for(const city of ['monaco','san-francisco']){
  await page.goto(`http://127.0.0.1:${server.port}/scripts/verification/street-quality.html?city=${city}`,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#result')?.textContent.trim().startsWith('{'));
  const quality=await page.locator('#result').evaluate(node=>JSON.parse(node.textContent));
  check(`${city} captured hill scene uses the current road compiler`,quality.pass===true&&quality.rendered.drawCalls>0,quality);
  await page.locator('#street').click();await page.screenshot({path:`${out}/${city}-hill.png`});
 }
 check('all rendered scenes remain free of browser and GPU errors',report.errors.length===0,report.errors);
 report.ok=true;
}catch(error){report.failure=String(error.stack||error).split('\nBrowser logs:')[0];process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify({ok:report.ok,cases:report.cases.map(c=>({name:c.name,pass:c.pass})),failure:report.failure,errors:report.errors}));
