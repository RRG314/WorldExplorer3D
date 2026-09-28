import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {startStaticServer} from '../verification/static-server.mjs';
const out='output/architecture-evaluation/decal-refactor';await mkdir(out,{recursive:true});
await writeFile(`${out}/baseline.js`,execFileSync('git',['show','a9237aea:app/js/terrain/surface-decal-projection.js']));
const server=await startStaticServer({rootDir:process.cwd(),ports:[4493,4494]});let browser;
try{
 browser=await chromium.launch({headless:false,channel:'chrome'});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/service-lifecycle.html`);
 const result=await page.evaluate(async()=>{
  const {projectDecalPolygon:old}=await import('/output/architecture-evaluation/decal-refactor/baseline.js');
  const {projectDecalPolygon:next}=await import('/app/js/terrain/surface-decal-projection.js');
  const cases=[];let trianglesCount=0;
  for(const city of ['monaco','sf']){
   const capture=await(await fetch(`/docs/streets/audit-2026-09-13/${city}-unioned-roads-surfaces.json`)).json();
   const triangles=capture.surfaces.filter(s=>s.family==='road').flatMap(s=>s.triangles);trianglesCount+=triangles.length;
   const positions=Float32Array.from(triangles.flatMap(t=>t.flatMap(p=>[p.x,p.y,p.z]))),supports=[];
   for(let a=0;a<positions.length;a+=9){const b=a+3,c=a+6,p=positions;supports.push({positions:p,a,b,c,denominator:(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2])});}
   for(let i=0;i<triangles.length;i+=7)cases.push({points:triangles[i],supports});
  }
  let vertices=0;for(const c of cases){const a=old(c.points,c.supports),b=next(c.points,c.supports);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Vertex mismatch');vertices+=a.length/3;}
  const times=[[],[]],fns=[old,next];let checksum=0;
  for(let round=0;round<35;round++)for(let j=0;j<2;j++){
   const index=(round+j)%2,start=performance.now();for(let repeat=0;repeat<32;repeat++)for(const c of cases)checksum+=fns[index](c.points,c.supports).length;
   if(round>=5)times[index].push(performance.now()-start);
  }
  const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{medianMs:s[15],p95Ms:s[28],maximumMs:s[29],samples:a};};
  return{queriesPerRound:cases.length*32,trianglesCount,vertices,mismatches:0,checksum,before:stats(times[0]),after:stats(times[1]),scope:'Matched captured SF/Monaco road surfaces; complete vertex parity. Component elapsed time, not total load latency.'};
 });
 await writeFile(`${out}/report.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({queries:result.queriesPerRound,vertices:result.vertices,before:result.before.medianMs,after:result.after.medianMs,mismatches:result.mismatches}));
}finally{await browser?.close();await server.close();}
