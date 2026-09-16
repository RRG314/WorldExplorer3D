export function yieldToMainThread() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  if (typeof globalThis.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new globalThis.MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}


// Drain the same construction iterator used by synchronous callers. Yielding
// changes scheduling only, never geometry, ordering or acceptance criteria.
export async function drainCooperatively(steps, {current=()=>true, now=()=>performance.now(), yieldWork=yieldToMainThread, budgetMs=8, onSlice=()=>{}}={}) {
  let started=now();
  try {
    for(;;) {
      if(!current())throw new Error('Surface construction superseded');
      const result=steps.next();
      const elapsed=now()-started;
      if(result.done){onSlice(elapsed);return result.value;}
      if(elapsed>=budgetMs){onSlice(elapsed);await yieldWork();started=now();}
    }
  } finally {steps.return();}
}
