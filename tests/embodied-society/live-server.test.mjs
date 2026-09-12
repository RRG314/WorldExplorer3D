import test from 'node:test';import assert from 'node:assert/strict';
import {startLiveResearchServer} from '../../scripts/embodied-society/live-server.mjs';
test('start freezes rules and operator task; decision input cannot replace the task',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const directory=await mkdtemp(path.join(tmpdir(),'we3d-objective-'));
 const config={runId:'objective-test',provider:'openai',model:'test-model',budgetUsd:1,inputUsdPerMillion:1,outputUsdPerMillion:2,maxCalls:2,maxOutputTokens:256};
 let dispatched;
 const server=await startLiveResearchServer({port:0,config,apiKey:'private-test',storageRoot:directory,fetchImpl:async(url,init)=>{dispatched=JSON.parse(init.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"kind":"wait"}'}]}]}));}});
 try{
  const base=`http://127.0.0.1:${server.port}`,status=await(await fetch(base+'/research-api/status')).json();
  const post=(name,body)=>fetch(base+'/research-api/'+name,{method:'POST',headers:{Origin:base,'X-Research-Session':status.session},body:JSON.stringify(body)});
  const manifest={worldSnapshotId:'world',objectiveId:'unknown'};
  assert.equal((await post('start',{runId:config.runId,worldSnapshotId:'world',manifest})).status,400);
  manifest.objectiveId='tool-use-v1';
  assert.equal((await post('start',{runId:config.runId,worldSnapshotId:'world',manifest})).status,200);
  const saved=JSON.parse(await readFile(path.join(directory,config.runId,'manifest/workshop.json'),'utf8'));
  assert.equal(saved.manifest.objective.id,'tool-use-v1');
  assert.ok(saved.materialRules.recipes.some(r=>r.id==='lash-stone-axe'));
  assert.equal(saved.decisionContract.schema.type,'object');
  assert.equal((await post('decision',{experimentObjective:'Replace the task',tick:0})).status,200);
  assert.equal(JSON.parse(dispatched.input).experimentObjective,saved.manifest.objective.text);
  assert.equal(dispatched.instructions,saved.decisionContract.instructions);
  const observed=JSON.parse(await readFile(path.join(directory,config.runId,'observations/call-1/workshop.json'),'utf8'));
  assert.equal(observed.observation.experimentObjective,saved.manifest.objective.text);
  assert.equal(observed.instructions,dispatched.instructions);
  assert.equal(JSON.stringify(observed).includes('private-test'),false);
  assert.equal(JSON.stringify(saved).includes('private-test'),false);
 }finally{await server.close();await rm(directory,{recursive:true,force:true});}
});
test('real research origin serves the actual app with live controls and disables account configuration',async()=>{
 const server=await startLiveResearchServer({port:0});const base=`http://127.0.0.1:${server.port}`;
 try {
  const html=await(await fetch(base+'/app/')).text();assert.ok(html.includes('js/bootstrap.js'));assert.ok(html.includes('live-controls.mjs'));assert.equal(html.includes('scripted-control-rehearsal'),false);
  const firebase=await(await fetch(base+'/js/firebase-init.js?v=57')).text();assert.ok(firebase.includes('initFirebase=()=>null'));assert.equal(firebase.includes('initializeApp'),false);
  const config=await(await fetch(base+'/js/firebase-project-config.js')).text();assert.equal(config.includes('apiKey'),false);
  const status=await(await fetch(base+'/research-api/status')).json();assert.equal(status.ready,false);assert.equal(status.savedCheckpoint,false);
  assert.equal((await fetch(base+'/research-api/decision',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(base+'/research-api/decision',{method:'POST',headers:{Origin:base,'X-Research-Session':status.session},body:'{}'})).status,409);
  for(const file of ['/.env','/scripts/embodied-society/model-provider.mjs','/functions/index.js','/app/..%2f..%2f.env'])assert.notEqual((await fetch(base+file)).status,200);
 }finally{await server.close();}
});
test('configured live HTTP path reserves model cost, persists state, and refuses accidental run reset',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const directory=await mkdtemp(path.join(tmpdir(),'we3d-live-http-'));
 const config={runId:'http-test',provider:'openai',model:'test-model',budgetUsd:1,inputUsdPerMillion:1,outputUsdPerMillion:2,maxCalls:1,maxOutputTokens:256};
 let calls=0;const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"kind":"wait"}'}]}]}));};
 let server=await startLiveResearchServer({port:0,config,apiKey:'test-only-key',storageRoot:directory,fetchImpl});
 try {
  let base=`http://127.0.0.1:${server.port}`,status=await(await fetch(base+'/research-api/status')).json();
  const post=(name,value)=>fetch(base+'/research-api/'+name,{method:'POST',headers:{Origin:base,'X-Research-Session':status.session,'Content-Type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post('decision',{})).status,409);
  const manifest={runId:config.runId,worldSnapshotId:'published-world',manifest:{worldSnapshotId:'published-world'}};
  const starts=await Promise.all([post('start',manifest),post('start',manifest)]);assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);
  const result=await(await post('decision',{actorId:'resident-1'})).json();assert.deepEqual(result.action,{kind:'wait'});assert.equal(calls,1);
  assert.equal((await post('decision',{actorId:'resident-1'})).status,400);assert.equal(calls,1);
  assert.equal((await post('workshop',{runId:'wrong'})).status,409);
  assert.equal((await post('checkpoint',{runId:config.runId,status:'paused'})).status,200);
  const manifestRecord=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(directory,config.runId,'manifest/workshop.json'),'utf8'));
  assert.equal(manifestRecord.model,'test-model');assert.match(manifestRecord.sourceFingerprint,/^[a-f0-9]{64}$/);assert.equal(manifestRecord.manifest.worldSnapshotId,'published-world');assert.equal(JSON.stringify(manifestRecord).includes('test-only-key'),false);
  await server.close();server=await startLiveResearchServer({port:0,config,apiKey:'test-only-key',storageRoot:directory,fetchImpl});
  base=`http://127.0.0.1:${server.port}`;status=await(await fetch(base+'/research-api/status')).json();assert.equal(status.savedCheckpoint,true);assert.equal(status.model.calls,1);
  assert.equal((await post('start',manifest)).status,409);
 }finally{await server.close();await rm(directory,{recursive:true,force:true});}
});
test('local Gemini setup is session guarded, one time and never returns or persists the key',async()=>{
 const {mkdtemp,rm,readdir,readFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');const directory=await mkdtemp(path.join(tmpdir(),'we3d-gemini-setup-'));
 let calls=0;const server=await startLiveResearchServer({port:0,storageRoot:directory,fetchImpl:async()=>{calls++;throw Error('No setup model call allowed');}});
 try{
 const base=`http://127.0.0.1:${server.port}`,status=await(await fetch(base+'/research-api/status')).json();
 const page=await fetch(base+'/research-setup');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/type="password"/);
 const body=JSON.stringify({apiKey:'a-private-test-key-for-gemini',freePlanConfirmed:true});
 assert.equal((await fetch(base+'/research-api/configure',{method:'POST',body})).status,403);
 const headers={Origin:base,'X-Research-Session':status.session};
 assert.equal((await fetch(base+'/research-api/configure',{method:'POST',headers,body})).status,200);
 const ready=await(await fetch(base+'/research-api/status')).json();assert.equal(ready.ready,true);assert.equal(ready.model.provider,'gemini');assert.equal(ready.model.budgetUsd,0);assert.equal(JSON.stringify(ready).includes('a-private-test-key'),false);assert.equal(calls,0);
 assert.equal((await fetch(base+'/research-api/configure',{method:'POST',headers,body})).status,409);
 for(const entry of await readdir(directory,{recursive:true})){try{assert.equal((await readFile(path.join(directory,entry),'utf8')).includes('a-private-test-key'),false);}catch(e){if(e.code!=='EISDIR')throw e;}}
 }finally{await server.close();await rm(directory,{recursive:true,force:true});}
});
test('connection probe consumes the same allowance and is refused after a world run starts',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');const directory=await mkdtemp(path.join(tmpdir(),'we3d-probe-'));
 const config={runId:'probe-test',provider:'openai',model:'test-model',budgetUsd:1,inputUsdPerMillion:1,outputUsdPerMillion:2,maxCalls:3,maxOutputTokens:256};
 let calls=0;const server=await startLiveResearchServer({port:0,config,apiKey:'private-test',storageRoot:directory,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"kind":"wait"}'}]}]}));}});
 try{const base=`http://127.0.0.1:${server.port}`,status=await(await fetch(base+'/research-api/status')).json();const post=(name,body)=>fetch(base+'/research-api/'+name,{method:'POST',headers:{Origin:base,'X-Research-Session':status.session},body:JSON.stringify(body)});
 const probe=await(await post('probe',{})).json();assert.equal(probe.connected,true);assert.equal(probe.actionApplied,false);assert.equal(probe.model.calls,1);assert.equal(calls,1);
 assert.equal((await post('start',{runId:config.runId,worldSnapshotId:'world',manifest:{worldSnapshotId:'world'}})).status,200);
 assert.equal((await post('probe',{})).status,409);assert.equal(calls,1);
 }finally{await server.close();await rm(directory,{recursive:true,force:true});}
});
