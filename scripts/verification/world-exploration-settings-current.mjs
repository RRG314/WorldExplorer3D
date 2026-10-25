import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out='output/research/location-default-play-2026-10-24';
await fs.mkdir(out,{recursive:true});
const capacity=await fs.statfs('.');assert.ok(capacity.bavail*capacity.bsize>2*1024**3,'Retain disk reserve before capture');
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4396]});
let owned;
const report={passed:false,scope:'Actual current Settings markup and owner; no ocean/Earth runtime or new world load; desktop and mobile-layout browser component acceptance.',checks:[],errors:[]};
try{
  owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:760},deviceScaleFactor:1,...(mobile?{isMobile:true,hasTouch:true}:{})});
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/world-exploration-settings.html`);
    await page.waitForFunction(()=>window.worldSettingsCheck?.ready);
    assert.equal(await page.locator('#regionalSceneryToggle').isChecked(),false);assert.equal(await page.locator('#oceanContinuousToggle').isChecked(),false);
    assert.ok(await page.locator('#regionalSceneryHelp').textContent().then(text=>text.includes('not a continuous worldwide driving mode')));
    await page.screenshot({path:out+`/world-settings-default-${mobile?'mobile':'desktop'}.png`});
    await page.locator('#oceanContinuousToggle').check();
    assert.equal(JSON.parse(await page.evaluate(()=>render_game_to_text())).ocean,true);
    await page.reload();await page.waitForFunction(()=>window.worldSettingsCheck?.ready);assert.equal(await page.locator('#oceanContinuousToggle').isChecked(),true);
    await page.locator('#regionalSceneryToggle').check();assert.equal(JSON.parse(await page.evaluate(()=>render_game_to_text())).earth,true);
    await page.locator('#oceanContinuousToggle').click();
    await runPrescribedGameActions(page,out,[{buttons:['space'],frames:1},{buttons:[],frames:2}],'body');
    assert.equal(await page.locator('#oceanContinuousToggle').isChecked(),true,'Prescribed Space key must toggle the focused preference');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:out+`/world-settings-${mobile?'mobile':'desktop'}.png`});
    report.checks.push(`${mobile?'Mobile layout':'Desktop'}: default areas, honest limits, opt-in before runtime, retained choice after reload, prescribed keyboard toggle, no horizontal overflow`);
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();await fs.writeFile(out+'/world-settings-browser.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
