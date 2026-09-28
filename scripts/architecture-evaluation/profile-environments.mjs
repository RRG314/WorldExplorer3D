import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {requireHardwareGraphics,readPerformanceHost} from '../verification/performance-host.mjs';
const out='output/architecture-evaluation/environment-profiles';await mkdir(out,{recursive:true});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtimeDiffSha256:createHash('sha256').update(execFileSync('git',['diff','HEAD','--','app'])).digest('hex'),host:readPerformanceHost(),quality:'med fixed',viewport:{width:1280,height:800},clock:'normal RAF',entry:'existing title button handlers; no accelerated simulation',scenarios:[],errors:[],complete:false};
const save=()=>writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const server=await startStaticServer({rootDir:process.cwd(),ports:[4501,4502]});let browser;
let deadline;
try{
 browser=await chromium.launch({headless:false,channel:'chrome'});deadline=setTimeout(()=>browser.close().catch(()=>{}),600000);
 for(const environment of ['space','moon','mars']){
  console.log(`environment profile: ${environment}`);
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});
  try{
   const page=await context.newPage();await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
   page.on('pageerror',e=>report.errors.push({environment,message:e.message}));
   await page.addInitScript(()=>{localStorage.setItem('worldExplorerRenderQualityLevel','med');localStorage.setItem('worldExplorerPerfAutoQuality','0');});
   await page.goto(`http://127.0.0.1:${server.port}/app/?launch=${environment}`,{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
   if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
   const start=Date.now();
   await page.evaluate(mode=>{document.getElementById(`${mode}LaunchToggle`).click();document.getElementById('startBtn').click();},environment);
   await page.waitForFunction(mode=>{const s=JSON.parse(globalThis.render_game_to_text?.()||'{}');return !s.worldLoading&&!document.querySelector('#loading.show')&&(mode==='space'?s.modes?.space:s.environment===mode.toUpperCase());},environment,{timeout:180000});
   const launchMs=Date.now()-start;await page.waitForTimeout(3000);
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
   const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
   const before=await metrics();
   const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let previous,start;const tick=now=>{if(start===undefined)start=now;if(previous!==undefined)values.push(now-previous);previous=now;if(now-start<15000)requestAnimationFrame(tick);else resolve({elapsedMs:now-start,deltas:values});};requestAnimationFrame(tick);}));
   const after=await metrics();
   const renderers=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');const result={};for(const [owner,renderer] of Object.entries({earth:ctx.renderer,space:ctx.spaceFlight?.renderer,ocean:ctx.oceanMode?.renderer})){if(!renderer)continue;const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');result[owner]={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,graphics:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};}return result;});
   const owner=environment==='space'?'space':'earth';requireHardwareGraphics(renderers[owner].graphics);
   const sorted=[...frames.deltas].sort((a,b)=>a-b);
   const item={environment,owner,launchMs,frames:sorted.length,elapsedMs:frames.elapsedMs,fps:sorted.length*1000/frames.elapsedMs,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],p99Ms:sorted[Math.ceil(sorted.length*.99)-1],maxMs:sorted.at(-1),scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,taskMs:(after.TaskDuration-before.TaskDuration)*1000,rawJsHeapBytes:after.JSHeapUsedSize,renderers,dom:await cdp.send('Memory.getDOMCounters')};
   report.scenarios.push(item);await save();
   await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.waitForTimeout(10000);const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/${environment}.cpuprofile`,JSON.stringify(profile));
   await page.screenshot({path:`${out}/${environment}.png`});
   await page.locator('#mainMenuBtn').click();await page.waitForTimeout(5000);
   // Separate retention observation; forced GC is outside timed frame/profile windows.
   await cdp.send('HeapProfiler.collectGarbage');item.menuPostGcMetrics=await metrics();await save();
  }finally{await context.close();}
 }
 report.complete=true;
}catch(error){report.failure=error.message;console.log('environment profile failed:',error.message);process.exitCode=1;}
finally{clearTimeout(deadline);await save();await browser?.close().catch(()=>{});await server.close();}
