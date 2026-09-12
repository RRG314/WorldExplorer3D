import {memoryCondition,observedMemory} from '../../app/js/experiments/embodied-society/memory-condition.mjs';
import http from 'node:http';
import {readFile,realpath,mkdir,statfs} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {createSnapshotStore} from './snapshot-store.mjs';
import {createModelProvider,validateModelConfig,residentInstructions,ACTION_SCHEMA,GEMINI_ACTION_SCHEMA} from './model-provider.mjs';

import {MATERIALS,RECIPES,MATERIAL_RULESET} from '../../app/js/experiments/embodied-society/material-rules.mjs';
import {researchObjective} from '../../app/js/experiments/embodied-society/research-objectives.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.bin':'application/octet-stream','.wasm':'application/wasm','.woff2':'font/woff2','.hdr':'application/octet-stream'};
const disabledFirebase=`export const FIREBASE_CONFIG_STORAGE_KEY='research-disabled';export const readFirebaseConfig=()=>null;export const hasFirebaseConfig=()=>false;export const initFirebase=()=>null;export const getFirebaseAppCheckToken=async()=>null;export const initFirebaseAnalytics=async()=>null;export const setFirebaseConfig=()=>{throw Error('Accounts are disabled in the research world.');};`;
async function readJson(request,limit=1048576) {
 let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>limit)throw Error('Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const freeGeminiConfig=()=>({runId:'free-'+Date.now()+'-'+randomBytes(3).toString('hex'),provider:'gemini',model:'gemini-3.1-flash-lite',accountTier:'free',freePlanConfirmed:true,budgetUsd:0,inputUsdPerMillion:0,outputUsdPerMillion:0,maxCalls:20,maxOutputTokens:2048,minDecisionIntervalMs:60000});
const setupHtml=`<!doctype html><html><head><meta charset="utf-8"><title>Connect Gemini to World Explorer</title><style>body{max-width:620px;margin:60px auto;padding:24px;font:18px/1.6 system-ui;background:#102732;color:#eff9fc}input[type=password]{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:12px;margin-top:20px}a{color:#8be4ff}</style></head><body><h1>Connect Gemini</h1><p>Use an API key from a Google AI Studio project marked Free tier. The pilot allows up to 20 decisions, at least one minute apart.</p><form><label>Gemini API key<input name="apiKey" type="password" autocomplete="off" required></label><p><label><input name="free" type="checkbox" required> I verified this key's project is on the Free tier.</label></p><button>Connect Gemini</button></form><p role="status"></p><p>The key stays in server memory and is cleared from this form after submission. No billing is enabled. Stop the local server to discard the key.</p><script>const f=document.querySelector('form'),s=document.querySelector('[role=status]');f.onsubmit=async e=>{e.preventDefault();f.querySelector('button').disabled=true;try{const status=await(await fetch('/research-api/status')).json();const value=f.elements.apiKey.value;f.elements.apiKey.value='';const r=await fetch('/research-api/configure',{method:'POST',headers:{'Content-Type':'application/json','X-Research-Session':status.session},body:JSON.stringify({apiKey:value,freePlanConfirmed:f.elements.free.checked})});const result=await r.json();if(!r.ok)throw Error(result.error);f.remove();s.textContent='Gemini connected. Open the world to start the resident.';const a=document.createElement('a');a.href='/app/';a.textContent='Open World Explorer';s.after(a);const check=document.createElement('button');check.textContent='Test Gemini connection';check.onclick=async()=>{check.disabled=true;s.textContent='Contacting Gemini…';try{const r=await fetch('/research-api/probe',{method:'POST',headers:{'Content-Type':'application/json','X-Research-Session':status.session},body:'{}'});const result=await r.json();if(!r.ok)throw Error(result.error);s.textContent='Gemini responded successfully. No action was applied. You can now open the world.';}catch(error){s.textContent=error.message+' Wait at least 60 seconds before another connection check.';}finally{check.disabled=false;}};a.after(check);}catch(error){s.textContent=error.message;f.querySelector('button').disabled=false;}};</script></body></html>`;
export async function startLiveResearchServer({port=4498,config=null,apiKey=null,storageRoot=path.join(root,'output/embodied-society-live'),fetchImpl=fetch}={}) {
 const session=randomBytes(32).toString('hex');
 const digest=createHash('sha256');
 for(const name of ['memory-condition','observer-report','observer-panel','research-objectives','decision-cadence','acceptance-profile','material-rules','needs','resident-body','run-controller','mapped-world-host','world-authority','workshop','construction-projection','live-controls'])digest.update(name).update(await readFile(path.join(root,'app/js/experiments/embodied-society',name+'.mjs')));
 for(const name of ['model-provider','live-server'])digest.update(name).update(await readFile(path.join(root,'scripts/embodied-society',name+'.mjs')));
 const sourceFingerprint=digest.digest('hex');
 let settingsErrors=validateModelConfig(config);
 let runId=config?.runId;
 if(config&&(!/^[a-zA-Z0-9_-]{1,64}$/.test(runId||'')))throw Error('Set a unique runId containing letters, digits, hyphens or underscores.');
 let provider=null,checkpointStore=null,workshopStore=null,manifestStore=null;
 async function initializeProvider() {
  const directory=path.join(storageRoot,runId);
  const free=await statfs(root);if(Number(free.bavail)*Number(free.bsize)<10*1024**3)throw Error('Research requires at least 10 GiB free disk.');
  await mkdir(directory,{recursive:true});
  const ledgerStore=createSnapshotStore(path.join(directory,'model'));
  provider=createModelProvider({config,apiKey,fetchImpl,store:ledgerStore,initialLedger:await ledgerStore.load(),recordObservation:record=>createSnapshotStore(path.join(directory,'observations',`call-${record.call}`),{maxBytes:65536}).save(record)});
  checkpointStore=createSnapshotStore(path.join(directory,'checkpoint'),{maxBytes:2*1024**2});
  workshopStore=createSnapshotStore(path.join(directory,'workshop'),{maxBytes:2*1024**2});
  manifestStore=createSnapshotStore(path.join(directory,'manifest'),{maxBytes:2*1024**2});
 }
 if(!settingsErrors.length&&apiKey)await initializeProvider();
 const rootReal=await realpath(root);
 let activeObjective=researchObjective(),activeMemory='outcomes-only';
 let active=false,starting=false,configuring=false,probes=0,probing=false;
 const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));
  try {
   const address=`127.0.0.1:${server.address().port}`;
   if(req.headers.host!==address)return json(403,{error:'Use the loopback research URL.'});
   const url=new URL(req.url,`http://${address}`),name=decodeURIComponent(url.pathname);
   if(name.startsWith('/research-api/')) {
    if(name==='/research-api/status'&&req.method==='GET')return json(200,{session,sourceFingerprint,ready:!!provider,runId:runId||null,model:provider?.status()??null,missing:[...settingsErrors,...(!apiKey?['Set WE3D_RESEARCH_API_KEY in the server environment.']:[])],savedCheckpoint:provider?!!await checkpointStore.load():false});
    if(req.method!=='POST'||req.headers.origin!==`http://${address}`||req.headers['x-research-session']!==session)return json(403,{error:'Research session required.'});
    if(name==='/research-api/configure') {
     if(provider||configuring||config)return json(409,{error:'Server already configured. Restart to change the provider.'});
     configuring=true;
     try {
      const setup=await readJson(req,8192);
      if(setup.freePlanConfirmed!==true||typeof setup.apiKey!=='string'||setup.apiKey.length<20||setup.apiKey.length>4096)return json(400,{error:'A Gemini key and confirmed Free-tier project are required.'});
      config=freeGeminiConfig();runId=config.runId;apiKey=setup.apiKey;settingsErrors=validateModelConfig(config);
      await initializeProvider();return json(200,{configured:true});
     }finally{configuring=false;}
    }
    if(!provider)return json(409,{error:'Configure a model and explicit allowance before starting.'});
    const body=await readJson(req,name==='/research-api/decision'?65536:2*1024**2);
    if(name==='/research-api/probe') {
     if(active||starting||probing||probes>=3)return json(409,{error:'Connection checks require an idle run and are limited to three attempts.'});
     probing=true;
     try{if(provider.status().failed)provider.recover();probes++;const action=await provider.decide({purpose:'Connection check only. No world is running and no returned action will be applied.',actorId:'connection-check',availableActions:['wait']});return json(200,{connected:true,actionApplied:false,action,model:provider.status()});}finally{probing=false;}
    }
    if(name==='/research-api/start') {
     if(active||starting||probing)return json(409,{error:'Run is already starting or active.'});
     starting=true;
     try {
     if(await checkpointStore.load()||await workshopStore.load()||await manifestStore.load())return json(409,{error:'Run ID already used. Choose a new run ID; restart recovery is not enabled.'});
     if(body.runId!==runId||typeof body.worldSnapshotId!=='string'||body.manifest?.worldSnapshotId!==body.worldSnapshotId)return json(409,{error:'Mapped research manifest required.'});
     let selectedObjective,selectedMemory;try{selectedObjective=researchObjective(body.manifest.objectiveId);selectedMemory=memoryCondition(body.manifest.memoryCondition);}catch{return json(400,{error:'Unknown research objective or memory condition.'});}
     const decisionContract={instructions:residentInstructions(config.provider),schema:config.provider==='gemini'?GEMINI_ACTION_SCHEMA:ACTION_SCHEMA};
     await manifestStore.save({schemaVersion:1,runId,createdAt:new Date().toISOString(),sourceFingerprint,provider:config.provider,model:config.model,maxCalls:config.maxCalls,maxOutputTokens:config.maxOutputTokens,minDecisionIntervalMs:config.minDecisionIntervalMs??0,decisionContract,materialRules:{ruleset:MATERIAL_RULESET,materials:MATERIALS,recipes:RECIPES},manifest:{...body.manifest,objective:selectedObjective,memoryCondition:selectedMemory}});
     activeObjective=selectedObjective;activeMemory=selectedMemory;
     await checkpointStore.save({schemaVersion:1,runId,status:'starting',manifest:body.manifest});active=true;return json(200,{started:true});
     }finally{starting=false;}
    }
    if(!active)return json(409,{error:'Start a mapped research session first.'});
    if(name==='/research-api/decision') {
     const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
     return json(200,{action:await provider.decide({...body,experimentObjective:activeObjective.text,memoryCondition:activeMemory,recentMemory:observedMemory(body.recentMemory,activeMemory)},{signal:abort.signal}),decisionSummary:provider.decisionSummary(),model:provider.status()});
    }
    if(name==='/research-api/checkpoint'||name==='/research-api/workshop') {
     if(body.runId!==runId)return json(409,{error:'Run identity mismatch.'});
     await (name.endsWith('checkpoint')?checkpointStore:workshopStore).save({...body,recordedAt:new Date().toISOString()});return json(200,{saved:true});
    }
    return json(404,{error:'Unknown research operation.'});
   }
   if(name==='/research-setup'&&req.method==='GET')return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"}).end(setupHtml);
   if(req.method!=='GET')return res.writeHead(405).end();
   if(name==='/')return res.writeHead(302,{Location:'/app/'}).end();
   if(name==='/js/firebase-init.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(disabledFirebase);
   if(['/js/firebase-project-config.js','/js/site-analytics.js'].includes(name))return res.writeHead(200,{'Content-Type':'text/javascript'}).end('/* Disabled in research origin. */');
   if(name==='/build-manifest.json')return json(200,{schemaVersion:0,previewMode:'mutable-source',candidateId:null});
   const requested=name==='/app/'?'/app/index.html':name;
   const allowed=requested.startsWith('/app/')||requested.startsWith('/assets/')||requested.startsWith('/data/')||requested.startsWith('/js/')||['/favicon.svg','/functions/interior-layout.mjs','/functions/vendor/polygon-clipping/index.js'].includes(requested);
   if(!allowed||!mime[path.extname(requested)]||requested.split('/').some(part=>part.startsWith('.')))return res.writeHead(404).end();
   const file=await realpath(path.resolve(root,'.'+requested));
   const relative='/'+path.relative(rootReal,file);
   if(!file.startsWith(rootReal+path.sep)||relative!==requested)return res.writeHead(403).end();
   let content=await readFile(file);
   if(requested==='/app/index.html')content=Buffer.from(content.toString().replace('</head>',`<script>localStorage.setItem('worldExplorerRenderQualityLevel','low');localStorage.setItem('worldExplorerSsaoEnabled','false');</script></head>`).replace('</body>','<script type="module" src="/app/js/experiments/embodied-society/live-controls.mjs"></script></body>'));
   res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content);
  }catch(error){if(!res.headersSent)json(400,{error:String(error.message)});else res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {port:server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const configPath=process.argv[2];
 const free=configPath==='--free';
 if(free&&process.env.WE3D_FREE_PLAN_CONFIRMED!=='1')throw Error('Use start-free.command and confirm your account is on the Free plan.');
 const config=free?freeGeminiConfig():configPath?JSON.parse(await readFile(path.resolve(configPath),'utf8')):null;
 const host=await startLiveResearchServer({config,apiKey:process.env.WE3D_RESEARCH_API_KEY});
 console.log(`World Explorer research: http://127.0.0.1:${host.port}/app/\nAccounts are disabled. AI starts only from the research controls after configuration. Ctrl+C stops the server.`);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await host.close();process.exit(0);});
}
