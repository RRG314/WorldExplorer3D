import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4468,4469]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900}});
  const page=await context.newPage();
  await page.route(`http://127.0.0.1:${server.port}/controller-fixture`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><div id="loading" class="show"></div><div id="ctrlContent"></div><div id="tab-settings"></div></body>'}));
  await page.goto(`http://127.0.0.1:${server.port}/controller-fixture`);
  const result=await page.evaluate(async mobile=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   const controller=await import('/app/js/tutorial/tutorial.js?v=13');
   Object.assign(ctx,{gameStarted:true,worldLoading:true,isLikelyMobileDevice:()=>mobile,Walk:{state:{mode:'walk',walker:{x:0,z:0}}},resolvePrimaryContextInteraction:()=>null});
   controller.initTutorial();controller.tutorialUpdate(.1);
   const duringLoad=controller.getTutorialSnapshot();
   ctx.Walk.state.walker.x=200;controller.tutorialUpdate(.1);
   const afterLoadingPlacement=controller.getTutorialSnapshot();
   ctx.worldLoading=false;
   controller.tutorialUpdate(.1);
   const duringHandoff=controller.getTutorialSnapshot();
   document.getElementById('loading').classList.remove('show');
   ctx.resolvePrimaryContextInteraction=()=>({family:'vehicle',label:'Enter vehicle'});
   controller.tutorialUpdate(.1);
   const firstPlay=controller.getTutorialSnapshot();
   if(mobile){document.getElementById('tutorialRestartBtn').click();controller.tutorialUpdate(.1);}
   const requestedGuide=controller.getTutorialSnapshot();
   ctx.Walk.state.walker.x=203;controller.tutorialUpdate(.1);
   ctx.Walk.state.walker.x=207;controller.tutorialUpdate(.1);
   const afterMovement=controller.getTutorialSnapshot();
   ctx.worldLoading=true;controller.tutorialUpdate(.1);
   const reloading=controller.getTutorialSnapshot();
   return {mobile,duringLoad,afterLoadingPlacement,duringHandoff,firstPlay,requestedGuide,afterMovement,reloading};
  },mobile);
  results.push(result);
  await mkdir('output/verification/tutorial-controller',{recursive:true});
  await writeFile('output/verification/tutorial-controller/report.json',JSON.stringify({ok:false,evidence:'real tutorial controller in isolated browser DOM',results},null,2));
  assert.equal(result.duringLoad.promptVisible,false,'guidance must not be consumed behind the loading cover');
  assert.equal(result.duringHandoff.promptVisible,false,'first-render/title handoff still owns the loading cover');
  assert.equal(result.afterLoadingPlacement.distanceMoved,0,'loading-time placement must not count as player movement');
  assert.equal(result.firstPlay.promptVisible,!mobile,'desktop movement guidance starts at play; phone guidance stays opt-in');
  assert.equal(result.requestedGuide.promptVisible,true,'enabled movement guidance must not be starved by a nearby action');
  assert.equal(result.afterMovement.stage,'interact','actual post-load movement must advance the guide');
  assert.equal(result.afterMovement.promptVisible,false,'nearby actions take priority after the movement step');
  assert.equal(result.reloading.promptVisible,false);
  await context.close();
 }
 await writeFile('output/verification/tutorial-controller/report.json',JSON.stringify({ok:true,evidence:'real tutorial controller in isolated browser DOM',results},null,2));
 console.log(JSON.stringify({ok:true,profiles:results.length}));
}finally{await browser.close();await server.close();}
