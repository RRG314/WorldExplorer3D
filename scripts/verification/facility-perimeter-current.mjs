import assert from 'node:assert/strict';
import {mkdir,writeFile,statfs} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out='output/facilities-20261011/perimeter';await mkdir(out,{recursive:true});
const disk=await statfs('.');assert.ok(disk.bavail*disk.bsize>2*1024**3,'Need 2 GiB for bounded component check');
const report={ok:false,scope:'Real bundled GLB in Three, real shared collision query; controlled mapped geometry. Not a loaded worldwide airport journey.',cases:[],errors:[]};
let server,browser,page,timer;const check=(name,passed)=>{report.cases.push({name,passed:!!passed});assert.ok(passed,name);};
try{
 server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});browser=await chromium.launch({channel:'chrome',headless:false});page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>report.errors.push(e.message));
 timer=setInterval(async()=>{const d=await statfs('.');if(d.bavail*d.bsize<1.5*1024**3){report.resourceStop=true;await browser?.close();}},10000);
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/facility-perimeter.html`);await page.waitForFunction(()=>window.ready);
 report.initial=await page.evaluate(()=>facilityTest.snapshot());check('authored asset publishes visible fence and matching collision',report.initial.runtime.status==='ready'&&report.initial.runtime.visibleBays>40&&report.initial.runtime.colliderCount===report.initial.runtime.visibleBays);
 check('posts and alpha-tested wire are actually present',report.initial.parts.some(p=>p.name.startsWith('Fence_post')&&p.count>0)&&report.initial.parts.some(p=>p.alphaTest>.1&&p.count>0));
 check('only a few instanced draw calls serve the boundary',report.initial.runtime.drawCount<=6&&report.initial.render.calls<12);
 await page.screenshot({path:`${out}/overview.png`});await page.click('#detail');await page.screenshot({path:`${out}/detail.png`});
 const contacts=await page.evaluate(()=>[-70,-45,0,50].map(x=>({x,blocked:facilityTest.collision(x,0,1,{actorBaseY:0,actorHeight:1.8}).collision})));
 check('shared collision blocks the fence and permits gate, road, taxiway',contacts[0].blocked&&contacts.slice(1).every(c=>!c.blocked));
 await page.evaluate(()=>facilityTest.move(-35,1));await runPrescribedGameActions(page,out,[{buttons:['up'],frames:40}],'canvas');
 check('keyboard movement cannot cross the visible fence',await page.evaluate(()=>facilityTest.snapshot().actor.z>.3));
 await page.evaluate(()=>facilityTest.move(-45,1));await runPrescribedGameActions(page,out,[{buttons:['up'],frames:40}],'canvas');
 check('keyboard movement passes through mapped gate',await page.evaluate(()=>facilityTest.snapshot().actor.z<-.5));
 await page.click('#away');check('travelling away retires visible detail and all owned collision',await page.evaluate(()=>facilityTest.snapshot().runtime.visibleBays===0&&facilityTest.ctx.dynamicBuildingColliders.length===0));
 await page.click('#return');check('return restores a single bounded set',await page.evaluate(()=>facilityTest.snapshot().runtime.colliderCount===facilityTest.ctx.dynamicBuildingColliders.length&&facilityTest.snapshot().runtime.colliderCount>0));
 await page.evaluate(()=>facilityTest.dispose());check('disposal removes scene and collision',await page.evaluate(()=>facilityTest.runtime.group.children.length===0&&facilityTest.ctx.dynamicBuildingColliders.length===0));
 check('no browser errors',report.errors.length===0);report.ok=true;
}catch(error){report.failure=String(error.stack||error).split('\nBrowser logs:')[0];process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{clearInterval(timer);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify(report));
