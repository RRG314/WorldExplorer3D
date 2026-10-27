import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {runtimeGeneration, generationModulePath, snapshotRootModules, pinHtmlRootModules, retainRuntimeGenerations} from '../lib/hosting-runtime-generation.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

// Small real ESM graphs exercise deployment skew without a city, account,
// remote service or second game renderer. This is packaging integration.
const out = process.env.WE3D_VERIFY_OUTPUT_DIR || 'output/research/runtime-update-current';
await fs.mkdir(out,{recursive:true});
const temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'we3d-update-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex'), json = value => `${JSON.stringify(value,null,2)}\n`;
const report = {passed:false,scope:'Controlled actual esbuild module graph, delayed import across an HTTP deployment; no gameplay, backend or physical-device claim',checks:[],errors:[],requests:[]};
let owned,server,page,activeRoot;
async function generation(number) {
  const source = path.join(temporary,number,'source'), output=path.join(temporary,number,'output');
  await fs.mkdir(source,{recursive:true}); await fs.mkdir(path.join(output,'js'),{recursive:true});
  await fs.mkdir(path.join(output,'app/js'),{recursive:true});
  const g = runtimeGeneration(number.repeat(64),'staging');
  await fs.writeFile(path.join(output,'js/shared.js'),`globalThis.authorityStarts=(globalThis.authorityStarts||0)+1; export const authority={generation:'${number}',value:0};`);
  await fs.writeFile(path.join(output,'app/js/shared-context.js'),'export const ctx={};');
  await fs.writeFile(path.join(source,'feature.js'),`import {authority} from '/js/shared.js';export const read=()=>({generation:authority.generation,value:++authority.value,starts:globalThis.authorityStarts});`);
  await fs.writeFile(path.join(source,'entry.js'),`import {authority} from '/js/shared.js'; globalThis.initialAuthority=authority; document.querySelector('button').onclick=async()=>{const feature=await import('./feature.js');globalThis.updateResult=feature.read();document.querySelector('output').textContent=JSON.stringify(updateResult);};`);
  const result=await build({entryPoints:{entry:path.join(source,'entry.js')},outdir:path.join(output,'app/js/bundles'),bundle:true,splitting:true,format:'esm',entryNames:'[name]-[hash]',chunkNames:'chunk-[hash]',metafile:true,plugins:[{name:'pin-real-shared-module',setup(builder){builder.onResolve({filter:/^\/js\//},args=>({path:generationModulePath(g,args.path),external:true}));}}]});
  const bundles=Object.keys(result.metafile.outputs).map(p=>path.relative(output,path.resolve(p))), entry=bundles.find(p=>p.includes('/entry-'));
  const snapshot=await snapshotRootModules(output,['js/shared.js'],g,'unused');
  const html=`<!doctype html><meta charset="utf-8"><title>Runtime update integration fixture</title><style>body{background:#15251e;color:#fff4df;font:18px system-ui;padding:24px}button{padding:16px}output{display:block;margin:24px}canvas{display:block}</style><h1>Controlled update integration</h1><p>Packaging fixture. This is not World Explorer gameplay.</p><button>Load delayed feature</button><output>Waiting</output><canvas width="20" height="20"></canvas><script type="module" src="/${entry}"></script>`;
  await fs.writeFile(path.join(output,'index.html'),pinHtmlRootModules(html,'index.html',g,new Set(['js/shared.js'])));
  const files={};
  for(const file of [...bundles,...Object.keys(snapshot.files),'js/shared.js','app/js/shared-context.js','index.html'])files[file]=digest(await fs.readFile(path.join(output,file)));
  const assets={schemaVersion:1,files}, contentHash=digest(json(files));
  const manifest={version:'1.0',commit:number.repeat(40),sourceDirty:false,firebaseEnvironment:'staging',firebaseProjectId:'fixture-staging',contentHash,assetManifestSha256:digest(json(assets)),fileCount:Object.keys(files).length,
    buildId:`1.0+${number.repeat(12)}.${contentHash.slice(0,16)}.staging`,runtimePackaging:{entries:{'app-entry':entry.slice(4)},generation:snapshot,bundlePaths:bundles,fileCount:bundles.length}};
  await fs.writeFile(path.join(output,'build-manifest.json'),json(manifest)); await fs.writeFile(path.join(output,'asset-manifest.json'),json(assets));
  return output;
}
try {
  const previous=await generation('1'), next=await generation('2');
  await retainRuntimeGenerations({output:next,predecessors:[previous],environment:'staging',projectId:'fixture-staging'});
  activeRoot=previous;
  server=createServer(async(request,response)=>{
    try {
      const pathname=new URL(request.url,'http://fixture.invalid').pathname, relative=pathname==='/'?'index.html':pathname.slice(1);
      if(relative.split('/').includes('..'))throw Error('Invalid path');
      const bytes=await fs.readFile(path.join(activeRoot,relative));
      response.writeHead(200,{'Content-Type':relative.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(bytes);
    }catch {response.writeHead(404,{'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'}).end('Missing fixture file');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  owned=await chromium.launchServer({headless:true,args:['--js-flags=--max-old-space-size=512']});
  const browser=await chromium.connect(owned.wsEndpoint()); page=await browser.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('.js'))report.requests.push({path:new URL(response.url()).pathname,status:response.status()});});
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url);await page.waitForFunction(()=>globalThis.initialAuthority?.generation==='1');
  assert.ok(!report.requests.some(r=>r.path.includes('chunk-')),'Feature remains lazy before deployment');
  activeRoot=next;
  await page.getByRole('button',{name:'Load delayed feature'}).focus();
  await runPrescribedGameActions(page,out,[{buttons:['enter'],frames:1}],'canvas');
  await page.waitForFunction(()=>globalThis.updateResult?.generation==='1');
  assert.deepEqual(await page.evaluate(()=>globalThis.updateResult),{generation:'1',value:1,starts:1});
  report.checks.push('Already-open generation loads its delayed feature after the new deployment, retaining one original shared authority');
  await page.reload(); await page.waitForFunction(()=>globalThis.initialAuthority?.generation==='2');
  await page.getByRole('button',{name:'Load delayed feature'}).click();await page.waitForFunction(()=>globalThis.updateResult?.generation==='2');
  assert.deepEqual(await page.evaluate(()=>globalThis.updateResult),{generation:'2',value:1,starts:1});
  report.checks.push('Fresh navigation uses only the new generation and a single shared authority');
  assert.deepEqual(report.errors,[]);assert.ok(report.requests.every(r=>r.status===200));
  await page.screenshot({path:path.join(out,'update-integration.png')});report.passed=true;
} catch(error) { report.failure=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); }
finally {
  if(owned)await closeOwnedBrowser(owned);
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.rm(temporary,{recursive:true,force:true});report.ownedBrowserClosed=true;
  await fs.writeFile(path.join(out,'report.json'),json(report));
}
console.log(JSON.stringify(report));
