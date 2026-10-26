import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const out=process.env.WE3D_JOURNAL_OUTPUT||'output/roadmap-20261011/journey-journal';await mkdir(out,{recursive:true});
const disk=await statfs('.');assert.ok(disk.bavail*disk.bsize>1.8*1024**3,'Need 1.8 GiB for this DOM-only check');
const report={ok:false,scope:'Actual Journal DOM/CSS and session owner, controlled storage failures and returns; no 3D world or live service.',cases:[],errors:[]};
const files=['app/index.html','app/styles/discovery.css','styles/world-explorer-tokens.css','app/js/discovery/journey-journal.js','app/js/ui/accessibility.js','tests/fixtures/journey-journal.html'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
report.source=await hashes();
let server,owned,browser,page,timer;const check=(name,passed,detail)=>{report.cases.push({name,passed:!!passed,...(detail?{detail}:{})});assert.ok(passed,detail?`${name}: ${JSON.stringify(detail)}`:name);};
try{
 server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});owned=await chromium.launchServer({channel:'chrome',headless:true});browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 timer=setInterval(async()=>{const d=await statfs('.');if(d.bavail*d.bsize<1.25*1024**3){report.resourceStop=true;await closeOwnedBrowser(owned);}},10000);
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/journey-journal.html`);await page.waitForFunction(()=>window.ready);
 await page.locator('#journalOpener').focus();await page.evaluate(()=>journalTest.open());
 await page.waitForFunction(()=>getWorldExplorerAccessibilitySnapshot().activeModalId==='discoveryPanel'&&document.getElementById('discoveryPanel').contains(document.activeElement));
 for(let i=0;i<12;i++)await page.keyboard.press('Tab');
 check('existing accessibility owner keeps keyboard focus in the Journal',await page.evaluate(()=>document.getElementById('discoveryPanel').contains(document.activeElement)));
 check('saved record details are readable in the existing Journal',await page.locator('#discoveryJournalList').innerText().then(t=>t.includes('Swimming below the surface')&&!t.includes('fixture-activity')));
 check('only a validated marine voyage and Earth record have return actions',await page.locator('[data-journey-return]').count()===2);
 check('Journal pauses the active journey',await page.evaluate(()=>journalTest.snapshot().pauses.journey_journal));
 await page.screenshot({path:`out-placeholder/desktop.png`.replace('out-placeholder',out)});
 await page.selectOption('#discoveryJournalCategory','travel');check('Journal path filter works',await page.locator('.discoveryJournalEvent').count()===1);
 await page.selectOption('#discoveryJournalCategory','all');await page.selectOption('#discoveryJournalRegion','moon');check('Journal region filter works',await page.locator('.discoveryJournalEvent').count()===1&&await page.locator('#discoveryJournalList').innerText().then(t=>t.includes('Lunar field sample')));
 await page.selectOption('#discoveryJournalCategory','travel');check('empty filter state keeps recovery controls available',await page.locator('.discoveryEmpty').isVisible()&&await page.locator('#discoveryJournalRegion').isVisible());await page.selectOption('#discoveryJournalCategory','all');await page.selectOption('#discoveryJournalRegion','all');await page.locator('[data-discovery-tab="guide"]').click();
 await page.fill('#discoveryGuideSearch','Basalt');check('shared Guide search works',await page.locator('#discoveryFieldGuideList .discoveryItem').count()===1&&await page.locator('#discoveryFieldGuideList').innerText().then(t=>t.includes('Basalt')));
 await page.fill('#discoveryGuideSearch','');await page.selectOption('#discoveryGuideCategory','ocean');check('Guide category filter works',await page.locator('#discoveryFieldGuideList').innerText().then(t=>t.includes('Common dolphin')&&!t.includes('Basalt')));
 await page.selectOption('#discoveryGuideCategory','all');
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}])for(const scale of ['100','200']){
  await page.setViewportSize(size);await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);
  for(const section of ['journal','guide']){
   await page.locator(`[data-discovery-tab="${section}"]`).click();await page.evaluate(()=>{document.querySelector('.discoveryPane.active').scrollTop=0;});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.locator('#discoveryPanel').evaluate(root=>{
    const pane=root.querySelector('.discoveryPane.active'),r=root.getBoundingClientRect(),close=document.getElementById('discoveryCloseBtn').getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},scrollWidth:pane.scrollWidth,clientWidth:pane.clientWidth,closeVisible:close.top>=r.top&&close.bottom<=r.bottom,smallControls:[...pane.querySelectorAll('button,input,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44);}).map(e=>e.id||e.textContent),clippedFields:[...pane.querySelectorAll('input:not([hidden]),select:not([hidden])')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.height&&r.height+0.5<parseFloat(s.lineHeight)+parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)+2;}).map(e=>e.id),titleFont:parseFloat(getComputedStyle(pane.querySelector('.discoveryItem strong')).fontSize)};
   });
   check(`layout-${section}-${size.width}-${scale}`,layout.x>=0&&layout.y>=0&&layout.x+layout.width<=size.width+1&&layout.y+layout.height<=size.height+1&&layout.scrollWidth<=layout.clientWidth+2&&layout.closeVisible&&layout.smallControls.length===0&&layout.clippedFields.length===0&&layout.titleFont>=(scale==='200'?31.9:15.9),layout);
   await page.screenshot({path:`${out}/${section}-${size.width}-${scale}.png`});
   if(section==='journal')await page.locator('[data-journey-return="wildlife"]').click({trial:true,timeout:4000});
   await page.locator('#discoveryCloseBtn').click({trial:true,timeout:4000});
  }
 }
 await page.setViewportSize({width:1000,height:800});await page.evaluate(()=>document.documentElement.dataset.we3dTextScale='100');
 await page.evaluate(()=>journalTest.fail(true));await page.evaluate(()=>journalTest.refresh());check('storage failure preserves records and offers retry',await page.getByRole('button',{name:'Retry Journal'}).isVisible());
 await page.evaluate(()=>journalTest.fail(false));await page.getByRole('button',{name:'Retry Journal'}).click();await page.waitForSelector('[data-journey-return="wildlife"]');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/phone.png`});
 const box=await page.locator('#discoveryPanel').boundingBox();check('Journal fits phone viewport',box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=845);
 await page.locator('[data-journey-return="wildlife"]').click();check('marine return hands same voyage to existing authority and releases pause',await page.evaluate(()=>{const s=journalTest.snapshot();return s.returns.length===1&&!s.open&&!s.pauses.journey_journal&&!s.layer;}));
 await page.waitForFunction(()=>getWorldExplorerAccessibilitySnapshot().activeModalId==='');check('focus returns to the opening control',await page.locator('#journalOpener').evaluate(n=>n===document.activeElement));
 check('old Earth click handlers do not also process journey controls',await page.evaluate(()=>journalTest.snapshot().oldClicks===0));
 await page.evaluate(()=>{journalTest.hold();void journalTest.open();});await page.evaluate(()=>journalTest.close());await page.evaluate(()=>journalTest.release());
 check('late storage read cannot reopen a closed Journal',await page.evaluate(()=>!journalTest.snapshot().open&&!document.getElementById('discoveryPanel').classList.contains('show')));
 await page.evaluate(()=>journalTest.open('guide'));await page.evaluate(()=>journalTest.transition());check('environment handoff closes Journal and releases pause',await page.evaluate(()=>!journalTest.snapshot().open&&!journalTest.snapshot().pauses.journey_journal));
 await page.evaluate(()=>journalTest.open());await runPrescribedGameActions(page,out,[{buttons:[],frames:1}],'canvas');await page.keyboard.press('Escape');
 check('Escape closes the Journal after repeated reopen',await page.evaluate(()=>!journalTest.snapshot().open));
 check('Earth controls and prior visibility restore on close',await page.locator('[data-discovery-tab="today"]').evaluate(n=>!n.hidden));
 assert.deepEqual(await hashes(),report.source,'Source changed during the run');check('no browser errors',report.errors.length===0);report.ok=true;
}catch(error){report.failure=String(error.stack||error).split('\nBrowser logs:')[0];process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{clearInterval(timer);if(owned)await closeOwnedBrowser(owned);await server?.close();report.ownedCleanup=true;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
