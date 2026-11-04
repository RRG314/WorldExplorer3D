import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium} from 'playwright';import {startStaticServer} from './static-server.mjs';
const output='output/verification/solo-racer-20261102';await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4399,4400]});const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual IndexedDB transaction/reload and shared UI; controlled race receipts, not newly driven laps',checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>report.errors.push(error.message));
 await page.route('**/racer-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><link rel="stylesheet" href="/app/styles/experiences.css"><style>body{background:#101e1a;color:#f3f0e4}</style><button id="open">Activities</button>'}));
 await page.goto(`http://127.0.0.1:${server.port}/racer-check`);
 report.checks=await page.evaluate(async()=>{
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
  const {beginSoloRacer,soloRacerSummary,SOLO_RACER}=await import('/app/js/campaign/solo-racer.js');
  const {createExperienceBrowser}=await import('/app/js/ui/experience-browser.js');
  const store=createIndexedDbDiscoveryProfileStore(),checks=[],garage={selectedId:'bmw_e34',vehicles:{bmw_e34:{condition:1}}};
  const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  await store.saveProfile(profile=>({...profile,soloRacer:beginSoloRacer(profile.soloRacer,{garage,ownerUid:'check-owner',now:100}),activeExperience:{experienceId:'career:racer',variantId:'campaign'},retainedFutureField:{keep:true}}));
  const event=(id,time,venue='silverstone-grand-prix',course='a',at=200)=>({eventId:'racer:browser:'+id,eventType:'activity-completed',sourceSystem:'games-and-activities',sourceId:'race-practice-'+course.repeat(32),activityId:'race-practice-'+course.repeat(32),name:'Accepted race result',pathId:'activity',occurredAt:at,environment:'EARTH',regionId:'qa',regionLabel:'Practice',points:0,metadata:{resultOwner:'game-result',outcome:'completed',racingPracticeVersion:1,racingOwnerUid:'check-owner',vehicleId:'bmw_e34',courseId:'road-race-'+course.repeat(32),physicsVersion:'qa-physics',raceConfiguration:{upgrades:{engine:0}},elapsedMs:time,barrierContacts:0,penaltyMs:0,cleanFinish:true,racingVenueId:venue}});
  const first=event('first',100000);const original=IDBObjectStore.prototype.put;let injected=false;
  IDBObjectStore.prototype.put=function(value,...args){if(this.name==='profiles'&&value?.soloRacer?.phase==='clean-finish'){injected=true;throw new DOMException('Injected quota failure','QuotaExceededError');}return original.call(this,value,...args);};
  let failed=false;try{await store.recordExplorerEvent(first);}catch{failed=true;}finally{IDBObjectStore.prototype.put=original;}
  check(failed&&injected,'profile failure was exercised');check((await store.getProfile()).soloRacer.phase==='first-finish'&&(await store.getEventsById([first.eventId])).length===0,'failed result and career projection roll back together');
  await Promise.all([store.recordExplorerEvent(first),store.recordExplorerEvent(first)]);check((await store.getProfile()).soloRacer.phase==='clean-finish','concurrent duplicate grants one stage');
  const reloaded=createIndexedDbDiscoveryProfileStore();check((await reloaded.getProfile()).soloRacer.phase==='clean-finish','fresh store resumes the saved next assignment');
  for(const row of [event('clean',98000,undefined,undefined,300),event('improved',96000,undefined,undefined,400),event('nord',120000,'nurburgring-nordschleife','b',500),event('daytona',90000,'daytona-tri-oval','c',600)])await reloaded.recordExplorerEvent(row);
  check((await reloaded.getProfile()).soloRacer.phase==='complete','three-venue capstone projected from accepted result records');check((await reloaded.getEventsById([SOLO_RACER.receiptId])).length===1,'capstone has one durable Journal receipt');
  check((await reloaded.getProfile()).retainedFutureField.keep,'unrelated profile data survives');
  const adapter={equipment:'Your cars and condition are in the Garage.',places:()=>[{id:'silverstone',name:'Silverstone',environment:'earth',lat:52.0713,lon:-1.0168}],offer:()=>({state:'ready',label:'Choose an event',enabled:true}),summary:({profile,variantId})=>soloRacerSummary(profile?.soloRacer,{variantId})};
  const browser=createExperienceBrowser({readProfile:()=>reloaded.getProfile(),resolveAdapter:(id)=>id==='racing'?adapter:null,onBegin:async()=>false});
  window.render_game_to_text=()=>JSON.stringify({scope:'saved Racer UI, controlled receipt evidence',...browser.snapshot(),heading:document.querySelector('.experience-detail h3')?.textContent});window.advanceTime=async()=>{};
  document.querySelector('#open').onclick=()=>browser.open({experienceId:'career:racer'});await browser.open({experienceId:'career:racer'});
  return checks;
 });
 await page.getByRole('combobox',{name:'Assignment',exact:true}).selectOption('clean-series');
 assert.equal(await page.locator('.experience-detail h3').textContent(),'Clean Sprint');await page.screenshot({path:`${output}/saved-repeat-mobile.png`});
 await page.getByRole('combobox',{name:'Assignment',exact:true}).selectOption('pace-session');assert.equal(await page.locator('.experience-detail h3').textContent(),'Consistency Run');report.checks.push('both repeat assignments are selectable from saved career');
 assert.deepEqual(report.errors,[]);report.ok=true;await fs.writeFile(`${output}/receipt.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS '+report.checks.length+' Racer storage/UI checks. No new lap or production claim.');
}finally{await browser.close();await server.close();}
