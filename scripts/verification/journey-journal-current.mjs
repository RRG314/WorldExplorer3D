import assert from 'node:assert/strict';
import {mkdir,writeFile,statfs} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out=process.env.WE3D_JOURNAL_OUTPUT||'output/roadmap-20261011/journey-journal';await mkdir(out,{recursive:true});
const disk=await statfs('.');assert.ok(disk.bavail*disk.bsize>1.8*1024**3,'Need 1.8 GiB for this DOM-only check');
const report={ok:false,scope:'Actual Journal DOM/CSS and session owner, controlled storage failures and returns; no 3D world or live service.',cases:[],errors:[]};
let server,browser,page,timer;const check=(name,passed)=>{report.cases.push({name,passed:!!passed});assert.ok(passed,name);};
try{
 server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});browser=await chromium.launch({channel:'chrome',headless:false});page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',e=>report.errors.push(e.message));
 timer=setInterval(async()=>{const d=await statfs('.');if(d.bavail*d.bsize<1.25*1024**3){report.resourceStop=true;await browser?.close();}},10000);
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/journey-journal.html`);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>journalTest.open());
 check('saved record details are readable in the existing Journal',await page.locator('#discoveryJournalList').innerText().then(t=>t.includes('Swimming below the surface')&&!t.includes('fixture-activity')));
 check('only a validated marine voyage and Earth record have return actions',await page.locator('[data-journey-return]').count()===2);
 check('Journal pauses the active journey',await page.evaluate(()=>journalTest.snapshot().pauses.journey_journal));
 await page.screenshot({path:`out-placeholder/desktop.png`.replace('out-placeholder',out)});
 await page.selectOption('#discoveryJournalCategory','travel');check('Journal path filter works',await page.locator('.discoveryJournalEvent').count()===1);
 await page.selectOption('#discoveryJournalCategory','all');await page.locator('[data-discovery-tab="guide"]').click();
 await page.fill('#discoveryGuideSearch','Basalt');check('shared Guide search works',await page.locator('#discoveryFieldGuideList .discoveryItem').count()===1&&await page.locator('#discoveryFieldGuideList').innerText().then(t=>t.includes('Basalt')));
 await page.fill('#discoveryGuideSearch','');await page.selectOption('#discoveryGuideCategory','ocean');check('Guide category filter works',await page.locator('#discoveryFieldGuideList').innerText().then(t=>t.includes('Common dolphin')&&!t.includes('Basalt')));
 await page.evaluate(()=>journalTest.fail(true));await page.evaluate(()=>journalTest.refresh());check('storage failure preserves records and offers retry',await page.getByRole('button',{name:'Retry Journal'}).isVisible());
 await page.evaluate(()=>journalTest.fail(false));await page.getByRole('button',{name:'Retry Journal'}).click();await page.waitForSelector('[data-journey-return="wildlife"]');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/phone.png`});
 const box=await page.locator('#discoveryPanel').boundingBox();check('Journal fits phone viewport',box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=845);
 await page.locator('[data-journey-return="wildlife"]').click();check('marine return hands same voyage to existing authority and releases pause',await page.evaluate(()=>{const s=journalTest.snapshot();return s.returns.length===1&&!s.open&&!s.pauses.journey_journal&&!s.layer;}));
 check('old Earth click handlers do not also process journey controls',await page.evaluate(()=>journalTest.snapshot().oldClicks===0));
 await page.evaluate(()=>{journalTest.hold();void journalTest.open();});await page.evaluate(()=>journalTest.close());await page.evaluate(()=>journalTest.release());
 check('late storage read cannot reopen a closed Journal',await page.evaluate(()=>!journalTest.snapshot().open&&!document.getElementById('discoveryPanel').classList.contains('show')));
 await page.evaluate(()=>journalTest.open('guide'));await page.evaluate(()=>journalTest.transition());check('environment handoff closes Journal and releases pause',await page.evaluate(()=>!journalTest.snapshot().open&&!journalTest.snapshot().pauses.journey_journal));
 await page.evaluate(()=>journalTest.open());await runPrescribedGameActions(page,out,[{buttons:[],frames:1}],'canvas');await page.keyboard.press('Escape');
 check('Escape closes the Journal after repeated reopen',await page.evaluate(()=>!journalTest.snapshot().open));
 check('Earth controls and prior visibility restore on close',await page.locator('[data-discovery-tab="today"]').evaluate(n=>!n.hidden));
 check('no browser errors',report.errors.length===0);report.ok=true;
}catch(error){report.failure=String(error.stack||error).split('\nBrowser logs:')[0];process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{clearInterval(timer);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify(report));
