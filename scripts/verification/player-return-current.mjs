import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const output=path.resolve(`output/verification/player-journey-20261105/return-${Date.now()}`);
const qa=await createFieldworkQaSession({output,careerId:'geology',maximumDurationMs:360000});
const {page,report}=qa;
try {
 await configureStagingAppCheck(page,'http://127.0.0.1:4192/app/',{proxyGeospatial:false});
 await page.goto('http://127.0.0.1:4192/app/');
 await page.locator('#playerEntryScreen').waitFor({state:'visible',timeout:90000});
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:90000});
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');window.__returnCtx=ctx;window.__returnReady=()=>ctx.gameStarted&&!ctx.worldLoading&&!ctx.titleLaunchPending&&ctx.initialEarthWorldReady;});
 if(process.env.WE3D_EXPECT_REUSE==='1'&&process.env.WE3D_RETURN_ONLY!=='1'){
  await page.locator('#playerEntryScreen [data-entry=progress]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#playerJourney .journey-careers>article').length===19&&document.querySelector('#playerJourney').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#playerJourney').getAttribute('aria-busy'),'false');
  await page.screenshot({path:path.join(output,'journey-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'journey-phone.png')});
  await page.locator('#playerJourney [data-journey=close]').click();
  await page.setViewportSize({width:1280,height:800});
 }
 await page.locator('#playerEntryScreen [data-entry=explore]').first().click();
 await page.evaluate(()=>__returnCtx.globeSelector.setSelection(39.2904,-76.6122,{name:'Baltimore',focus:false}));
 let start=Date.now();
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>__returnReady(),null,{timeout:180000});
 report.coldMs=Date.now()-start; report.before=await qa.snapshot();
 await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2));
 await page.screenshot({path:path.join(output,'first-arrival.png')});
 if(process.env.WE3D_EXPECT_REUSE==='1'&&process.env.WE3D_RETURN_ONLY!=='1'){
  await page.locator('#explorerGameMenuBtn').click();
  await page.locator('#explorerGameMenu [data-open-player-journey]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#playerJourney .journey-careers>article').length===19&&document.querySelector('#playerJourney').getAttribute('aria-busy')==='false');
  await page.locator('#playerJourney [data-journey=homes]').click();
  const offers=await page.evaluate(async()=>{const {personalHomeOffers}=await import('/app/js/game/property-ui.js?v=10');return personalHomeOffers().map(h=>({id:h.id,price:h.price,distance:h.distance}));});
  report.offers=offers;
  assert.ok(offers.length,'Actual supported residential offers');
  const id=offers[0].id;
  await page.locator(`[data-journey-visit="${id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  const buy=page.locator(`[data-journey-buy="${id}"]`);
  assert.equal(await buy.isEnabled(),true,await page.locator('.journey-status').innerText());
  const before=await page.evaluate(()=>__returnCtx.explorerHousing.snapshot());
  await buy.click();
  await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  const after=await page.evaluate(()=>__returnCtx.explorerHousing.snapshot());
  assert.equal(after.homes.length,before.homes.length+1);assert.equal(after.credits,before.credits-offers[0].price);assert.ok(after.primaryHome?.worldOrigin);
  report.purchase={id,price:offers[0].price,homeCount:after.homes.length};
  await page.locator('#playerJourney [data-journey=return-home]').click();
  await page.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');
  assert.match(await page.locator('.journey-status').innerText(),/safely outside/);
  await page.screenshot({path:path.join(output,'purchased-home-return.png')});
  await page.locator('#playerJourney [data-journey=leaderboard]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.career-board-row').length===19);
  await page.screenshot({path:path.join(output,'career-milestones.png')});
  await page.locator('#leaderboardCloseBtn').click();
 }
 await page.locator('#explorerGameMenuBtn').click();
 await page.locator('#explorerGameMenu [data-explorer-target=mainMenuBtn]').click();
 await page.locator('#globeSelectorScreen').waitFor({state:'visible'});
 start=Date.now();
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>__returnReady(),null,{timeout:180000});
 report.repeatMs=Date.now()-start;report.after=await qa.snapshot();
 if(process.env.WE3D_EXPECT_REUSE==='1'){
  assert.equal(report.after.worldSequence,report.before.worldSequence,'Same location retains current publication');
  await page.evaluate(()=>__returnCtx.renderer.domElement.focus());
  const before=report.after.walker;await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  const after=(await qa.snapshot()).walker;assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.2,'Actual movement after return');
  report.persistedHome=await page.evaluate(()=>__returnCtx.explorerHousing.snapshot().primaryHome?.id);
  if(report.purchase)assert.equal(report.persistedHome,report.purchase.id);
 }
 await page.screenshot({path:path.join(output,'same-place-return.png')});
 await qa.succeed();
}catch(error){await qa.fail(error);process.exitCode=1;}finally{await qa.close();}
