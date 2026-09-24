import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

// Actual UI controller and CSS in a small DOM fixture. The following full-world
// walking journey separately verifies ownership against the compiled artifact.
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4496,4497] });
let browser;
const directory = 'output/verification/field-prompt-layout';
try {
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.port}/404.html`);
  await page.setContent(`<button id="discoveryQuickToolBtn" class="show">Record Rock pigeon</button>
    <section id="currentJourneyCard" hidden><span id="currentJourneyEyebrow"></span><b id="currentJourneyTitle"></b>
    <p id="currentJourneyDetail"></p><button id="currentJourneyAction"></button><button id="currentJourneyDismiss"></button></section>
    <div id="urbanVehiclePrompt" style="display:block">Enter vehicle</div>
    <div id="interiorPrompt" style="display:block">Enter building</div>`);
  await page.addStyleTag({content:await fs.readFile('app/styles/discovery.css','utf8')});
  const checks=await page.evaluate(async()=>{
    const {createCurrentJourneyUi}=await import('/app/js/tutorial/current-journey.js');
    const snapshot={active:true,promptOwner:'discovery',activeActivityId:'survey',
      actions:[{id:'survey',label:'Community survey'}],interaction:{phase:'seeking'}};
    const ui=createCurrentJourneyUi({gameStarted:true,isLikelyMobileDevice:()=>true,
      worldDiscoveryRuntimeSnapshot:()=>snapshot});
    const quick=document.getElementById('discoveryQuickToolBtn');
    const card=document.getElementById('currentJourneyCard');
    const visible=element=>!element.hidden && getComputedStyle(element).display!=='none';
    const checks={};
    for(const phase of ['seeking','observing','revealed']){
      snapshot.interaction.phase=phase;ui.update(1);
      checks[`${phase}HasOneFieldPrompt`]=visible(quick)&&!visible(card);
    }
    for(const id of ['urbanVehiclePrompt','interiorPrompt']){
      const direct=document.getElementById(id);direct.classList.add('show');
      checks[`${id}TakesPriority`]=visible(direct)&&!visible(quick)&&!visible(card);
      direct.classList.remove('show');
      checks[`${id}RestoresFieldPrompt`]=visible(quick)&&!visible(card);
    }
    snapshot.promptOwner=null;ui.update(1);
    checks.missingDiscoveryOwnerPreservesFallback=visible(card);
    return checks;
  });
  assert.ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
  assert.deepEqual(errors,[]);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(`${directory}/report.json`,JSON.stringify({ok:true,evidenceScope:'source UI controller and real CSS DOM fixture; not a world journey',checks,browserErrors:errors},null,2));
  console.log(JSON.stringify(checks));
} finally {await browser?.close();await server.close();}
