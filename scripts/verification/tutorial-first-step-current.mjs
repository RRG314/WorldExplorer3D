import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(process.env.WE3D_VERIFY_ROOT || '.');
const shellCss=await readFile(path.join(root,'app/styles/runtime-shell.css'),'utf8');
const css=await readFile(path.join(root,'app/styles/tutorial.css'),'utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
try {
  const ids=['urbanVehiclePrompt','interiorPrompt','boatPrompt','discoveryContextPrompt'];
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
    const context=await browser.newContext({viewport,hasTouch:viewport.width<1000,isMobile:viewport.width<1000});
    const page=await context.newPage();
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}.show{display:block}${shellCss}${css}</style>
      <aside id="tutorialHintCard" class="tutorial-card compact" data-tutorial-stage="move"><div class="tutorial-card-head"><div><span class="tutorial-eyebrow">First Journey · 1 of 3</span><strong class="tutorial-title">ZASD to move · Mouse to look</strong></div><button>Details</button></div></aside>
      ${ids.map(id=>`<div id="${id}" hidden>Observe</div>`).join('')}`);
    for(const id of ids){
      await page.evaluate(({id,ids})=>{
        const card=document.getElementById('tutorialHintCard');card.hidden=false;card.dataset.tutorialStage='move';
        for(const other of ids){const e=document.getElementById(other);e.hidden=other!==id;e.className=other===id?'show':'';}
      },{id,ids});
      assert.equal(await page.locator('#tutorialHintCard').isVisible(),true,`${id} hid the first movement instruction`);
      assert.equal(await page.locator('#'+id).isVisible(),false);
      const rect=await page.locator('#tutorialHintCard').boundingBox();
      assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=viewport.width&&rect.y+rect.height<=viewport.height,JSON.stringify({viewport,rect}));
      await page.locator('#tutorialHintCard').evaluate(e=>{e.dataset.tutorialStage='interact';});
      assert.equal(await page.locator('#tutorialHintCard').isVisible(),false);
      assert.equal(await page.locator('#'+id).isVisible(),true);
      await page.locator('#tutorialHintCard').evaluate(e=>{e.dataset.tutorialStage='move';e.hidden=true;});
      assert.equal(await page.locator('#'+id).isVisible(),true,'dismissing guidance must restore nearby actions');
      results.push({viewport,prompt:id,movementVisible:true,interactionPriorityRestored:true,dismissalRestoresAction:true});
    }
    await context.close();
  }
  await mkdir('output/verification/tutorial-first-step',{recursive:true});
  const report={ok:true,evidenceMode:'css-priority-fixture',root,results};
  await writeFile('output/verification/tutorial-first-step/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
