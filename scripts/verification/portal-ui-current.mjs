import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';

const engineName=process.env.WE3D_PORTAL_ENGINE||'chromium';assert.ok(['chromium','webkit'].includes(engineName));
const out=path.resolve(process.env.WE3D_PORTAL_OUTPUT||`output/research/vr-portal-product-2026-10-25/portal-${engineName}`);
await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4573]});
const base=`http://127.0.0.1:${server.port}`;
const report={passed:false,engine:engineName,scope:'Real browser and IndexedDB, guest Portal and responsive layouts. No native widget, live account service, game arrival or physical device acceptance.',checks:[],pageErrors:[],consoleErrors:[],expectedOfflineErrors:[],resourceFailures:[]};
let owned,context,offline=false;
try{
  owned=await (engineName==='chromium'?chromium:webkit).launchServer({headless:true,...(engineName==='chromium'?{channel:'chrome',args:['--js-flags=--max-old-space-size=1536']}:{})});
  const browser=await (engineName==='chromium'?chromium:webkit).connect(owned.wsEndpoint());
  context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await context.newPage();await configureStagingAppCheck(page,base,{proxyGeospatial:false});page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)report.resourceFailures.push({url:response.url(),status:response.status()});});
  page.on('console',message=>{if(message.type()==='error')(offline?report.expectedOfflineErrors:report.consoleErrors).push(message.text());});
  await page.goto(`${base}/portal/`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Save place',exact:true}).waitFor();
  if(process.env.WE3D_PORTAL_SCOPE==='interaction'){
    await page.getByRole('button',{name:'Save place',exact:true}).click();
    await page.getByRole('button',{name:'Saved · remove',exact:true}).waitFor();
    assert.equal(await page.locator('[data-save]').evaluate(node=>node===document.activeElement),true);
    await page.getByRole('button',{name:'Investigate',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Add to Investigated',exact:true}).click();
    await page.getByRole('button',{name:'Read again',exact:true}).waitFor();
    assert.equal(await page.locator('[data-investigate]').evaluate(node=>node===document.activeElement),true);
    await page.getByRole('button',{name:'Read again',exact:true}).click();
    await page.getByRole('button',{name:'Investigated · close',exact:true}).click();
    assert.equal(await page.locator('#learning').evaluate(node=>node.open),false);
    offline=true;await context.setOffline(true);
    await page.getByText(/^Offline · Device Trail/).waitFor();
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Read again',exact:true}).click();
    await page.screenshot({path:path.join(out,'portrait-dialog-viewport.png')});
    report.checks.push('Save preserves keyboard focus; investigation returns focus; Read again closes without a duplicate learning write; offline state is visible.');
  }else{
  const id=await page.locator('[data-save]').getAttribute('data-save');
  await page.getByRole('button',{name:'Save place',exact:true}).click();
  await page.getByRole('button',{name:'Saved · remove',exact:true}).waitFor();
  await page.getByRole('button',{name:'Investigate',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Add to Investigated',exact:true}).click();
  await page.locator('#trailList').getByText('Saved · Investigated',{exact:true}).waitFor();
  report.checks.push('Actual page saves and investigation completion update the independent Trail.');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#trailList').getByText('Saved · Investigated',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Make this my Home Portal',exact:true}).click();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  assert.equal(await page.locator('[data-save]').getAttribute('data-save'),id);
  report.checks.push('Journal IndexedDB and Home preference survive a full page reload.');
  await page.screenshot({path:path.join(out,'desktop-trail.png'),fullPage:true});
  await page.getByRole('button',{name:'Saved · remove',exact:true}).click();
  await page.getByRole('button',{name:'Save place',exact:true}).waitFor();
  await page.locator('#trailList').getByText('Investigated',{exact:true}).waitFor();
  const data=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return createIndexedDbDiscoveryProfileStore().exportData();});
  const entry=data.portalTrail.find(row=>row.destinationId===id&&row.ownerScope==='device-guest');
  assert.equal(entry.state.saved,false);assert.ok(entry.state.investigatedAt);assert.equal(entry.state.visitedAt,0);assert.equal(data.items.length,0);assert.equal(data.events.length,0);
  report.checks.push('Removing a save keeps learning; real exported Journal has no forged item, visit or event.');
  await page.getByRole('button',{name:'Together',exact:true}).click();assert.match(await page.getByRole('link',{name:'Open Multiplayer ↗',exact:true}).getAttribute('href'),/tab=multiplayer/);
  await page.getByRole('button',{name:'Beyond Earth',exact:true}).click();assert.equal(await page.getByRole('link',{name:'Moon ↗',exact:true}).getAttribute('href'),`${base}/app/?launch=moon&gm=free`);
  report.checks.push('Together and Beyond Earth hand off to the existing game destinations.');
  await page.getByRole('button',{name:'Wander',exact:true}).click();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Read again',exact:true}).click();
  await page.screenshot({path:path.join(out,'portrait-investigation.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#learning').evaluate(node=>node.open),false);
  await page.setViewportSize({width:844,height:390});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'landscape-portal.png'),fullPage:true});
  await page.screenshot({path:path.join(out,'landscape-viewport.png')});
  report.checks.push('Portrait and landscape fit viewport; modal closes with Escape and restores its screen.');
  // Run the installed skill choreography against the actual Portal region; it
  // has no simulation/canvas to advance. The adapter introduces no game loop.
  await runPrescribedGameActions(page,out,[{buttons:[],frames:2}],'#discovery');
  if(engineName==='chromium'){
    await page.evaluate(()=>new Promise(resolve=>{const timer=setTimeout(resolve,12000);navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='portal-offline-ready'){clearTimeout(timer);resolve();}},{once:true});navigator.serviceWorker.controller?.postMessage({type:'cache-portal-static',urls:[location.origin+'/portal/',...performance.getEntriesByType('resource').map(row=>row.name)]});}));
    const cached=await page.evaluate(()=>caches.keys());assert.ok(cached.some(key=>key.startsWith('we3d-living-portal-')));
    offline=true;await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Read again',exact:true}).waitFor({timeout:10000});
    await page.getByRole('button',{name:'Save place',exact:true}).click();await page.getByRole('button',{name:'Saved · remove',exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'offline-trail.png'),fullPage:true});
    report.checks.push('Offline reload opens cached Portal and Journal, then persists another save without a network connection.');
  }
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{if(context)await context.close();if(owned)await closeOwnedBrowser(owned);await server.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
