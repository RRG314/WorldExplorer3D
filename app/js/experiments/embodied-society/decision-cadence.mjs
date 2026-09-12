// Measure spacing after settlement: dispatch/checkpoint/network latency must not
// make the browser's next request earlier than the server's quota clock.
export function createDecisionCadence(intervalMs,{now=Date.now}={}){
 if(!Number.isFinite(intervalMs)||intervalMs<0||typeof now!=='function')throw Error('Invalid decision interval.');
 let settledAt=-Infinity,inFlight=false;
 const ready=()=>!inFlight&&now()-settledAt>=intervalMs;
 return Object.freeze({ready,async run(decide){
  if(!ready())throw Error('Decision cadence is not ready.');
  inFlight=true;
  try{return await decide();}finally{settledAt=now();inFlight=false;}
 }});
}
