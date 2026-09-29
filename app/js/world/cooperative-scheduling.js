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

// Background world refinement must leave a paint opportunity between slices.
// A scheduler.yield continuation can run again before the next rendering turn.
// The timer after RAF keeps the next slice out of RAF's pre-paint microtasks;
// the deadline also lets cleanup complete when a tab stops receiving frames.
export function yieldToWorldFrame(host = globalThis) {
  if (typeof host.requestAnimationFrame !== 'function' || host.document?.hidden) {
    return new Promise(resolve => host.setTimeout(resolve, 16));
  }
  return new Promise(resolve => {
    let settled = false, frame = null, afterPaint = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      host.clearTimeout(deadline);
      if (frame !== null) host.cancelAnimationFrame?.(frame);
      if (afterPaint !== null) host.clearTimeout(afterPaint);
      resolve();
    };
    const deadline = host.setTimeout(finish, 100);
    frame = host.requestAnimationFrame(() => {
      frame = null;
      afterPaint = host.setTimeout(finish, 0);
    });
  });
}
