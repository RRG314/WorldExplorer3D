import {readFile,writeFile} from 'node:fs/promises';
const [frameFile,profileFile,outputFile]=process.argv.slice(2);
const raw=JSON.parse(await readFile(frameFile)),capture=JSON.parse(await readFile(profileFile));
const profile=capture.profile,navigationStart=capture.clock.metrics.find(m=>m.name==='NavigationStart')?.value;
if(!Number.isFinite(navigationStart)||!Number.isFinite(raw.startedAt))throw Error('Missing monotonic clock alignment');
const nodes=new Map(profile.nodes.map(n=>[n.id,n]));
const parents=new Map();for(const n of profile.nodes)for(const child of n.children||[])parents.set(child,n.id);
const points=[];let time=profile.startTime;
for(let i=0;i<profile.samples.length;i++){const start=time;time+=profile.timeDeltas[i];points.push({start,end:time,id:profile.samples[i]});}
const describe=(id,ms)=>{const n=nodes.get(id);const stack=[];let parent=parents.get(id);for(let i=0;parent&&i<7;i++,parent=parents.get(parent))stack.push(nodes.get(parent)?.callFrame.functionName);return {ms:+ms.toFixed(2),function:n?.callFrame.functionName,url:n?.callFrame.url,line:n?.callFrame.lineNumber,column:n?.callFrame.columnNumber,callers:stack};};
const totals=new Map();for(const p of points)totals.set(p.id,(totals.get(p.id)||0)+(p.end-p.start)/1000);
const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,ms])=>describe(id,ms));
let cursor=raw.startedAt;const hitches=[];
for(const delta of raw.deltas){const start=cursor;cursor+=delta;if(delta<=50)continue;
 const startUs=navigationStart*1e6+start*1000,endUs=startUs+delta*1000,weights=new Map();
 for(const p of points){const overlap=Math.max(0,Math.min(endUs,p.end)-Math.max(startUs,p.start));if(overlap)weights.set(p.id,(weights.get(p.id)||0)+overlap/1000);}
 hitches.push({startMs:start,relativeMs:start-raw.startedAt,durationMs:delta,profileCoverageMs:[...weights.values()].reduce((a,b)=>a+b,0),top:top(weights)});
}
const result={alignment:{navigationStartSeconds:navigationStart,frameStartUs:navigationStart*1e6+raw.startedAt*1000,profileStartUs:profile.startTime,profileEndUs:profile.endTime,calibration:capture.clock.page,performanceTimestamp:capture.clock.metrics.find(m=>m.name==='Timestamp')?.value},top:top(totals),hitches};
if(outputFile)await writeFile(outputFile,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
