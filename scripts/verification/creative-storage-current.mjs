import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const dir=process.env.WE3D_CREATIVE_OUTPUT||'output/verification/creative-storage-current';await mkdir(dir,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4487]});let browser;
const report={passed:false,scope:'Actual Chromium localStorage, isolated browser profile; storage acceptance, not a terrain gameplay test',cases:[],errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/__creative_storage_fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Creative storage verification</title>'}));
 await page.goto(`http://127.0.0.1:${server.port}/__creative_storage_fixture`);
 report.cases=await page.evaluate(async()=>{
  const {createLocalWorldModificationStore,PRIMARY_KEY,BACKUP_KEY}=await import('/app/js/editable-world/local-store.js');
  const checks=[],expect=(ok,id)=>{if(!ok)throw Error(id);checks.push({id,passed:true});};
  const op=id=>({action:'suppress_base_building',suppression:{sourceFeatureId:id}});let failKey='';
  const storage={getItem:k=>localStorage.getItem(k),removeItem:k=>localStorage.removeItem(k),setItem(k,v){if(k===failKey)throw Error('controlled browser write failure');localStorage.setItem(k,v);}};
  const open=()=>{const s=createLocalWorldModificationStore({storage});s.initialize();return s;};
  let s=open(),stale=open();expect(s.commit('home',op('osm:1')).committed,'first-edit-commits');
  expect(stale.commit('home',op('osm:2')).reason==='storage-conflict','stale-tab-cannot-replace-edit');
  failKey=BACKUP_KEY;expect(s.commit('home',op('osm:3')).committed&&open().isBuildingSuppressed('home','osm:3'),'backup-failure-retains-successful-primary');
  failKey=PRIMARY_KEY;expect(!s.commit('home',op('osm:4')).committed&&!open().isBuildingSuppressed('home','osm:4'),'primary-failure-retains-previous-world');failKey='';
  for(let i=1;i<24;i++){if(!s.commit(`area:${i}`,op(`osm:${i}`)).committed)throw Error(`area ${i}`);}
  expect(s.commit('area:24',op('osm:24')).reason==='world-limit','new-area-limit-does-not-evict');
  s=open();expect(s.status().worldCount===24&&s.isBuildingSuppressed('home','osm:1')&&s.isBuildingSuppressed('area:23','osm:23'),'reload-retains-first-and-last-areas');
  const future=JSON.stringify({schemaVersion:2,worlds:{home:{futureField:'keep'}}});localStorage.setItem(PRIMARY_KEY,future);s=open();
  expect(!s.status().enabled&&!s.commit('home',op('osm:5')).committed&&localStorage.getItem(PRIMARY_KEY)===future,'newer-primary-preserved-without-downgrade');
  return checks;
 });
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await writeFile(`${dir}/browser.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failure:report.failure}));
