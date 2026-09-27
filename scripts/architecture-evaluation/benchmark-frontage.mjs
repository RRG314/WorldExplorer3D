import { chromium } from 'playwright';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startStaticServer } from '../verification/static-server.mjs';
const out='output/architecture-evaluation/frontage-query';
await mkdir(out,{recursive:true});
const baseline=execFileSync('git',['show','ee1bca65:app/js/world/compiler/street-frontage-policy.js'],{encoding:'utf8'}).replace("'../road-units.js'","'/app/js/world/road-units.js'").replace("'./street-section.js'","'/app/js/world/compiler/street-section.js'");
await writeFile(`${out}/baseline.js`,baseline);
const inputPath='output/architecture-evaluation/world-boundary-and-environments/world-projection.json';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4493,4494]});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:false});
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/service-lifecycle.html`);
 const report=await page.evaluate(async inputPath=>{
  const old=await import('/output/architecture-evaluation/frontage-query/baseline.js');
  const next=await import('/app/js/world/compiler/street-frontage-policy.js');
  const data=await(await fetch('/'+inputPath)).json();
  const buildings=data.buildings.flatMap(b=>b.components.map(c=>({pts:c.footprint})));
  const policies=[old.createStreetFrontagePolicy(buildings),next.createStreetFrontagePolicy(buildings)];
  const queries=[];
  for(let x=-200;x<=200;x+=4)for(let z=-200;z<=200;z+=4){const p={x,z};queries.push([p,p,20/1.11]);}
  for(const road of data.roads)for(let i=1;i<road.points.length;i++)queries.push([road.points[i-1],road.points[i],20/1.11]);
  const maps=policies.map(p=>new Map(p.edges.map((e,i)=>[e,i])));
  let mismatches=0, hits=0;
  for(const q of queries){
    const results=policies.map((p,i)=>p.query(...q).map(e=>maps[i].get(e)));
    if(JSON.stringify(results[0])!==JSON.stringify(results[1]))mismatches++;
    hits+=results[0].length;
  }
  if(mismatches)throw Error(`${mismatches} mismatched ordered query results`);
  const timings=[[],[]];let checksum=0;
  for(let r=0;r<35;r++)for(let j=0;j<2;j++){
    const i=(j+r)%2,start=performance.now();
    for(const q of queries)checksum+=policies[i].query(...q).length;
    if(r>=5)timings[i].push(performance.now()-start);
  }
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{medianMs:sorted[15],p95Ms:sorted[28],maxMs:sorted[29],samplesMs:values};};
  return{buildings:buildings.length,edges:policies[0].edges.length,queries:queries.length,hits,mismatches,checksum,baseline:stats(timings[0]),boundsRejection:stats(timings[1]),userAgent:navigator.userAgent,scope:'Captured Baltimore district footprints/roads; synthetic 4-unit terrain grid plus road segments. Ordered edge identity parity. Component elapsed timing only; no load-time or FPS claim.'};
 },inputPath);
 report.inputSha256=createHash('sha256').update(await readFile(inputPath)).digest('hex');
 report.candidateSha256=createHash('sha256').update(await readFile('app/js/world/compiler/street-frontage-policy.js')).digest('hex');
 report.baselineSource='ee1bca65';
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,baseline:{medianMs:report.baseline.medianMs,p95Ms:report.baseline.p95Ms},boundsRejection:{medianMs:report.boundsRejection.medianMs,p95Ms:report.boundsRejection.p95Ms}},null,2));
}finally{await browser?.close();await server.close();}
