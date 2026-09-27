import { chromium } from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startStaticServer} from '../verification/static-server.mjs';
const out='output/architecture-evaluation/capture-query',inputPath='output/architecture-evaluation/urban-retention/capture-building-inputs.json';
await mkdir(out,{recursive:true});
const inputBytes=await readFile(inputPath),server=await startStaticServer({rootDir:process.cwd(),ports:[4493,4494]});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:false});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/service-lifecycle.html`);
 const report=await page.evaluate(async inputPath=>{
  const {RdtBuildingIndex,createRdtCaptureSelector}=await import('/app/js/reality-capture/rdt-building-index.js');
  const {buildingCenter,nearestCaptureBuildingIds}=await import('/app/js/reality-capture/nearby-buildings.js');
  const buildings=await(await fetch('/'+inputPath)).json();
  const actors=Array.from({length:32},(_,i)=>buildingCenter(buildings[Math.floor(i*buildings.length/32)]));
  const fullSort=actor=>{
   const records=buildings.flatMap((b,i)=>{if(!b.sourceBuildingId)return[];const p=buildingCenter(b);return[{id:String(b.sourceBuildingId),i,d:Math.hypot(p.x-actor.x,p.z-actor.z)}];}).sort((a,b)=>a.d-b.d||a.i-b.i);
   const ids=new Set();for(const r of records){ids.add(r.id);if(ids.size===60)break;}return [...ids];
  };
  const index=new RdtBuildingIndex(buildings),selector=createRdtCaptureSelector();let mismatches=0;const candidates=[];
  for(const a of actors){const expected=JSON.stringify(fullSort(a));for(const result of [nearestCaptureBuildingIds(buildings,a),index.nearest(a),selector.select(buildings,a,1).ids])if(JSON.stringify(result)!==expected)mismatches++;candidates.push(index.lastCandidates);}
  if(mismatches)throw Error(`Capture ordered result mismatch: ${mismatches}`);
  const cases={fullSort:()=>actors.map(fullSort),boundedHeap:()=>actors.map(a=>nearestCaptureBuildingIds(buildings,a)),rdtQueryOnly:()=>actors.map(a=>index.nearest(a)),rdtValidationOnly:()=>actors.map(()=>index.matches(buildings)),rdtFullSelector:()=>actors.map(a=>selector.select(buildings,a,1).ids),rdtRebuild:()=>{const x=new RdtBuildingIndex(buildings);const n=x.nodes;x.dispose();return n;}};
  const timings=Object.fromEntries(Object.keys(cases).map(k=>[k,[]]));
  for(let round=0;round<15;round++){const keys=Object.keys(cases);for(let i=0;i<keys.length;i++){const k=keys[(i+round)%keys.length],start=performance.now();cases[k]();if(round>=5)timings[k].push(performance.now()-start);}}
  // Preserve the reason validation exists: same array can mutate between selections.
  const target=buildings.find(b=>b.sourceBuildingId),oldId=target.sourceBuildingId;target.sourceBuildingId=oldId+'-probe';
  const mutationDetected=!index.matches(buildings),rebuiltAfterMutation=selector.select(buildings,actors[0],1).stats.rebuilt;target.sourceBuildingId=oldId;
  index.dispose();selector.clear();
  return{records:buildings.length,queriesPerRound:actors.length,candidates,mismatches,mutationDetected,rebuiltAfterMutation,timings,scope:'Actual published Baltimore building records; synthetic positions sampled from their centers. 32 queries per round except rebuild is one. Full selector includes O(n) identity/coordinate validation. CPU component replay, not UI FPS or network evidence.'};
 },inputPath);
 report.inputSha256=createHash('sha256').update(inputBytes).digest('hex');
 report.mediansMs=Object.fromEntries(Object.entries(report.timings).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)[5]]));
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({records:report.records,mismatches:report.mismatches,mutationDetected:report.mutationDetected,rebuiltAfterMutation:report.rebuiltAfterMutation,mediansMs:report.mediansMs}));
}finally{await browser?.close();await server.close();}
