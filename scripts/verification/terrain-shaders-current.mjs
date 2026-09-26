import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';
const output='output/verification/terrain-shaders';
await mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4447,4448]});
let browser, passed=false;
const results=[],errors=[];
try {
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:600,height:460}});
 collectBrowserGraphicsErrors(page,errors);
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/terrain-shader-composition.html`);
 await page.waitForFunction(()=>window.ready===true,null,{timeout:20000});
 for(let index=0;index<5;index++){
  if(index)await page.keyboard.press('ArrowRight');
  const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));results.push(state);
  await page.screenshot({path:`${output}/${index}-${state.phase}.png`});
  assert.equal(state.phaseIndex,index);assert.equal(state.glError,0);assert.equal(state.contextLost,false);assert.ok(state.calls>0);
  assert.ok(state.pavedReference.slice(0,3).some((v,i)=>Math.abs(v-state.background[i])>30));
  for(const probe of state.probes){const expected=probe.expected==='opening'?state.background:state.pavedReference;
   assert.ok(probe.rgba.every((value,i)=>Math.abs(value-expected[i])<=2),`${state.phase}: ${probe.expected} at ${probe.x},${probe.z} rendered ${probe.rgba}, expected ${expected}`);
  }
  assert.deepEqual(errors,[]);
 }
 passed=true;
} finally {
 await writeFile(`${output}/report.json`,JSON.stringify({evidenceScope:'actual GPU shader composition and pixel lifecycle fixture',ok:passed,results,errors},null,2));
 await browser?.close();await server.close();
}
console.log('Terrain/pavement GPU lifecycle passed refresh, clear, grow, and cached-program reuse.');
