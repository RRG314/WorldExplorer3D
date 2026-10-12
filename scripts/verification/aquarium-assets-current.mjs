// Review acquired files with the application's pinned Three/GLTF loader.
// This is model evidence, not aquarium gameplay or artistic approval.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

const directory='output/aquarium-expansion/asset-review';
const sources=[
  {id:'blacktip-reef-shark',sha256:'9f30d3aef4cfc47941fa844db4dcb0f7b4799acca8bacfa7d3972d16680cac8f'},
  {id:'green-sea-turtle',sha256:'7294581e0e7a2d2259ed343fcdb8dc9c7f8b55031bfffb282e4342b9cb63c818'}
];
for(const source of sources){
  const bytes=await readFile(`output/aquarium-expansion/quarantine/${source.id}.source.glb`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,'Review only the acquired, pinned source bytes');
}
await mkdir(directory,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4498,4499]});
let browser;
const report={ok:false,scope:'Pinned original models in the application renderer; not gameplay, verified species anatomy, final resource budgets or visual approval',models:[],errors:[]};
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  collectBrowserGraphicsErrors(page,report.errors);
  page.on('pageerror',error=>report.errors.push(error.message));
  for(const source of sources){
    const asset=`/output/aquarium-expansion/quarantine/${source.id}.source.glb`;
    await page.goto(`http://127.0.0.1:${server.port}/scripts/verification/fixtures/marine-asset-review.html?asset=${encodeURIComponent(asset)}`);
    await page.waitForFunction(()=>globalThis.__fixtureReady===true,null,{timeout:45000});
    const state=await page.evaluate(()=>JSON.parse(globalThis.render_game_to_text()));
    const record={...source,state,animationChangesRenderedPose:false};report.models.push(record);
    assert.equal(state.animations.length,1);assert.ok(state.animations[0].duration>0);
    assert.ok([...state.bounds.min,...state.bounds.max].every(Number.isFinite));
    for(const view of ['front','back','side']){
      await page.locator(`#${view}`).click();
      await page.screenshot({path:`${directory}/${source.id}-${view}.png`});
    }
    const before=await page.screenshot();
    await runPrescribedGameActions(page,directory,[{buttons:[],frames:20}],'canvas');
    const after=await page.screenshot({path:`${directory}/${source.id}-animated.png`});
    assert.notEqual(createHash('sha256').update(before).digest('hex'),createHash('sha256').update(after).digest('hex'),'Authored animation must change the rendered pose');
    record.animationChangesRenderedPose=true;
  }
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.failure=String(error.stack||error);throw error;}
finally{
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');
  await browser?.close();await server.close();
}
