import { tunnelSolidComponents, buildTunnelSolidInput, prepareTunnelSolidBoundary } from './tunnel-solid-model.js';

// Compilation owns a short-lived worker, not another frame loop. Bounds are
// explicit and errors leave a diagnostic instead of publishing invalid solids.
export async function compileTunnelSolidBoundaries(features){
  const stats={owner:'compiled-tunnel-solid',components:0,triangles:0,pieces:0,failures:[],durationMs:0};
  const start=performance.now();
  for(const feature of features)feature.tunnelSolidBoundary=null;
  const components=tunnelSolidComponents(features);
  if(!components.length||typeof Worker==='undefined')return stats;
  const workerUrl=globalThis.__WORLD_EXPLORER_PRODUCTION__?.tunnelSolidWorkerUrl ||
    new URL('./tunnel-solid-worker.js',import.meta.url);
  const worker=new Worker(workerUrl,{type:'module'});
  let id=0;
  try{
    for(const component of components){
      const identity=component.map(f=>f.sourceFeatureId).join('|');
      if(performance.now()-start>10000){stats.failures.push({identity,reason:'world-compilation-budget'});break;}
      try{
        const input=buildTunnelSolidInput(component);
        const stations=input.sweeps.reduce((sum,rings)=>sum+rings.length,0);
        if(stations>12000){stats.failures.push({identity,reason:'component-station-budget'});continue;}
        const result=await new Promise((resolve,reject)=>{
          const requestId=++id;
          const timer=setTimeout(()=>reject(new Error('Tunnel worker deadline exceeded')),Math.max(100,10000-(performance.now()-start)));
          worker.onmessage=({data})=>{if(data.id!==requestId)return;clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
          worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message||'Tunnel worker failed'));};
          worker.postMessage({id:requestId,input});
        });
        const boundary=prepareTunnelSolidBoundary(input,result);
        boundary.publisher=component[0];
        for(const feature of component)feature.tunnelSolidBoundary=boundary;
        stats.components++;stats.triangles+=boundary.triangleCount;stats.pieces+=input.sweeps.length+input.pieces.length;
      }catch(error){stats.failures.push({identity,reason:String(error.message||error)});break;}
    }
  }finally{worker.terminate();stats.durationMs=performance.now()-start;}
  return stats;
}
