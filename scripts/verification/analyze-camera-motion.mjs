import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2],result={scope:'Diagnostic relative chase velocity, excluding stopped motion and frames >40ms; not stall acceptance',modes:{}};
for(const mode of ['drive','plane']) {
 const {rows}=JSON.parse(await readFile(path.join(directory,`candidate-0-cold-${mode}-settled-camera.json`)));
 const groups={short:[],long:[],absolute:[]};
 for(let i=2;i<rows.length;i++) {
  const p=rows[i-1],r=rows[i],delta=r[1];if(delta>.04||delta<.01)continue;
  const speed=Math.hypot(r[2]-p[2],r[4]-p[4])/delta;if(speed<2)continue;
  const yaw=mode==='drive'?Math.atan2(r[2]-p[2],r[4]-p[4]):r[5];
  const lag=(r[2]-r[6])*Math.sin(yaw)+(r[4]-r[8])*Math.cos(yaw);
  const oldlag=(p[2]-p[6])*Math.sin(yaw)+(p[4]-p[8])*Math.cos(yaw);
  const change=(lag-oldlag)/delta;
  groups[delta<.025?'short':'long'].push(change);groups.absolute.push(Math.abs(change));
 }
 const stats=a=>({n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p95:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
 result.modes[mode]=Object.fromEntries(Object.entries(groups).map(([key,a])=>[key,stats(a)]));
}
await writeFile(path.join(directory,'camera-motion-summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
