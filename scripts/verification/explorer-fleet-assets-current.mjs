// Component integration, not city gameplay or physical-phone acceptance.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,statfs} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const root=process.cwd(),output=path.resolve(process.env.WE3D_FLEET_EVIDENCE_DIR||`output/release-evidence/current/explorer-fleet-${Date.now()}`);
const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>200*1024*1024,'Insufficient space for bounded fleet evidence.');
await mkdir(output,{recursive:true});
let server,browserServer;const errors=[],report={scope:'Current-source model/component integration; actual gameplay is separate',checks:[]};
const idleSafe=cache=>{
  assert.ok(cache.entries.every(entry=>entry.leases===0),'Model leases must return to zero.');
  assert.ok(cache.entries.reduce((n,e)=>n+e.estimatedResourceBytes,0)<=cache.idleByteLimit,'Idle cache exceeded its existing bound.');
};
try{
  server=await startStaticServer({rootDir:root,ports:[0]});
  browserServer=await chromium.launchServer({channel:'chrome',headless:false});
  const browser=await chromium.connect(browserServer.wsEndpoint()),base=`http://127.0.0.1:${server.port}`;
  const page=await browser.newPage({viewport:{width:1500,height:1440}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/tests/fixtures/explorer-fleet-review.html');
  await page.waitForFunction(()=>window.ready,null,{timeout:60000});
  const models=await page.evaluate(()=>window.componentReport),aircraft=await page.evaluate(()=>window.checkAircraft());
  assert.equal(models.models.length,7);assert.ok(models.models.every(m=>m.wheelMotion));
  assert.equal(aircraft.results[0].propellerMoves,true);assert.ok(aircraft.results.every(r=>r.status==='ready'));
  assert.equal(aircraft.cancelledAsset,null);assert.equal(aircraft.scopes.activeScopeCount,0);idleSafe(aircraft.cache);
  await page.screenshot({path:path.join(output,'fleet.png')});
  report.checks.push({name:'models, rig motion and repeated disposal',models,aircraft});await page.close();
  for(const scenario of ['network-failure','retired-before-delivery']){
    const context=await browser.newContext(),p=await context.newPage();
    p.on('pageerror',e=>errors.push(e.message));
    let release,requested;
    const arrived=new Promise(resolve=>requested=resolve),delivery=new Promise(resolve=>release=resolve);
    await p.route('**/aircraft-cessna-172.glb?*',async route=>{
      requested();await delivery;
      if(scenario==='network-failure')await route.fulfill({status:503,body:'controlled asset failure'});
      else await route.fulfill({status:200,contentType:'model/gltf-binary',body:await readFile(path.join(root,'app/assets/models/vehicles/explorer-fleet/aircraft-cessna-172.glb'))});
    });
    await p.goto(base+'/tests/fixtures/explorer-fleet-review.html?isolated=1');await p.waitForFunction(()=>window.ready);
    await p.evaluate(()=>window.beginAircraft());await arrived;
    if(scenario==='retired-before-delivery')await p.evaluate(()=>window.cancelAircraft());
    release();const outcome=await p.evaluate(()=>window.aircraftOutcome());
    assert.equal(outcome.ready,false);assert.equal(outcome.asset,null);assert.equal(outcome.scopes.activeScopeCount,0);idleSafe(outcome.cache);
    if(scenario==='network-failure')assert.equal(outcome.status,'fallback');
    report.checks.push({name:scenario,outcome});await context.close();
  }
  assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
finally{
  if(browserServer)await closeOwnedBrowser(browserServer);await server?.close();
  report.pageErrors=errors;await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(c=>c.name),output,error:report.error}));
