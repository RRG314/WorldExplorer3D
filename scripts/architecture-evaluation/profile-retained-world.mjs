// Retained allocation ownership diagnostic. Explicit collections occur only
// while stationary, outside every movement/performance acceptance window.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {closeOwnedBrowser} from '../verification/owned-browser.mjs';
const out=process.env.WE3D_PROBE_OUT||'output/architecture-evaluation/retained-world-1007';
await mkdir(out,{recursive:true});
const report={scope:'Sampled retained allocations during world construction; explicit stationary GC, no movement or latency acceptance.',
  source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  runtimeDiffSha256:createHash('sha256').update(execFileSync('git',['-c','core.fsmonitor=false','diff','HEAD','--','app'])).digest('hex'),errors:[],complete:false};
const server=await startStaticServer({rootDir:process.cwd(),ports:[4557]});let owned;
try{
  owned=await chromium.launchServer({channel:'chrome',headless:false});
  const browser=await chromium.connect(owned.wsEndpoint());
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.startSampling',{samplingInterval:65536});
  await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&mode=walk`);
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
  await page.evaluate(async()=>{globalThis.__retainedCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await page.waitForFunction(()=>!__retainedCtx.worldLoading&&__retainedCtx.worldLoadRuntimeState?.status==='ready',null,{timeout:300000});
  await page.evaluate(()=>__retainedCtx.setTimeOfDay('day'));
  await page.waitForTimeout(10000);
  report.beforeCollection=(await cdp.send('Performance.getMetrics')).metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents'].includes(x.name));
  await cdp.send('HeapProfiler.collectGarbage');
  report.afterCollection=(await cdp.send('Performance.getMetrics')).metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents'].includes(x.name));
  const allocation=await cdp.send('HeapProfiler.stopSampling');
  await writeFile(`${out}/retained-allocation.json`,JSON.stringify(allocation));
  report.counts=await page.evaluate(()=>({buildings:__retainedCtx.buildings.length,roads:__retainedCtx.roads.length}));
  await page.screenshot({path:`${out}/world.png`});
  report.complete=true;
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
