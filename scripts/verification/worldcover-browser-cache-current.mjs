import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='output/verification/worldcover-browser-cache-current';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4195/docs/research/ground-ecosystems/ground-ecosystems-plan.html');
 const read=()=>page.evaluate(async()=>{
  const {loadWorldCoverBaseline}=await import('/app/js/terrain/worldcover-baseline.js?v=17');
  const result=await loadWorldCoverBaseline({latN:37.74465712069938,latS:37.735969208590504,lonW:-119.59716796875,lonE:-119.586181640625},{size:128,key:'browser-persistence-audit'});
  return {source:result.source,authority:result.dataAuthority,classes:Array.from(result.classIds||[])};
 });
 const first=await read();assert.equal(first.authority,'esa-worldcover-v200-categorical');
 await page.waitForTimeout(200);
 let blockedRequests=0;
 await page.route(/planetarycomputer\.microsoft\.com|titiler\.terrascope\.be/,route=>{blockedRequests++;return route.abort();});
 await page.reload();
 const cached=await read();
 assert.equal(cached.source,'persistent-cache');assert.deepEqual(cached.classes,first.classes);
 assert.equal(blockedRequests,0,'Persisted numeric data should not attempt a network fallback');
 const report={ok:true,firstSource:first.source,cachedSource:cached.source,cells:cached.classes.length,blockedRequests};
 await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(report);
} finally {await browser.close();}
