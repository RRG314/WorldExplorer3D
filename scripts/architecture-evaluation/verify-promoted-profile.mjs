import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startStaticServer} from '../verification/static-server.mjs';
const out='output/architecture-evaluation/promoted-profile';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4493,4494]});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:false});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.port}/scripts/architecture-evaluation/service-lifecycle.html`);
 const report=await page.evaluate(async()=>{
  const {prepare,compare}=await import('/scripts/architecture-evaluation/profile-benchmark.js');
  const {sampleProfileAtDistance:before,sampleSortedProfileAtDistance:after}=await import('/app/js/structure-semantics/profile-sampling.js');
  const source=await(await fetch('/output/architecture-evaluation/transport-input-capture/transport-profiles.json')).json(),input=prepare(source.records);
  const run=sample=>{const output=new Float64Array(input.queries.length);for(let i=0;i<output.length;i++){const [index,distance]=input.queries[i],p=input.profiles[index];output[i]=sample(p.distances,p.values,distance);}return output;};
  const parity=compare(run(before),run(after)),timings=[[],[]],fns=[before,after];let checksum=0;
  for(let r=0;r<35;r++)for(let j=0;j<2;j++){const i=(r+j)%2,start=performance.now(),values=run(fns[i]);if(r>=5)timings[i].push(performance.now()-start);checksum+=values[r%values.length];}
  const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{medianMs:s[15],p95Ms:s[28],maximumMs:s[29],samples:a};};
  return{queries:input.queries.length,profiles:input.profiles.length,parity,before:stats(timings[0]),after:stats(timings[1]),checksum,scope:'Actual promoted numeric function, captured Baltimore profiles, synthetic endpoint/interior query distribution. Not whole-game FPS.'};
 });await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({queries:report.queries,parity:report.parity,before:report.before.medianMs,after:report.after.medianMs}));
}finally{await browser?.close();await server.close();}
