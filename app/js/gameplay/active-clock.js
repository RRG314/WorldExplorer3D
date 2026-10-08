// Monotonic gameplay time shared by timed challenges. Nested pause reasons
// suspend one clock, so closing one overlay cannot resume another's timer.
export function createActivePlayClock(now=()=>performance.now()){
 let pausedAt=null,totalPaused=0;
 return {setPaused(paused){const t=now();if(paused&&pausedAt===null)pausedAt=t;else if(!paused&&pausedAt!==null){totalPaused+=Math.max(0,t-pausedAt);pausedAt=null;}},now(){const t=now();return t-totalPaused-(pausedAt===null?0:Math.max(0,t-pausedAt));}};
}
