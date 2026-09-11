import { throwIfWorldLoadAborted } from './request-cancellation.js?v=1';

function normalizeConcurrency(value, itemCount) {
  const requested = Math.floor(Number(value) || 1);
  return Math.max(1, Math.min(32, itemCount, requested));
}

async function runBoundedProviderBatch(items, worker, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('Provider batch items must be an array.');
  if (typeof worker !== 'function') throw new TypeError('Provider batch worker must be a function.');
  const parentSignal = options.signal || null;
  const budgetMs=Number(options.maxElapsedMs)||0;
  const controller=budgetMs>0?new AbortController():null;
  const signal=controller?.signal || parentSignal;
  let deadlineReached=false;
  const forwardAbort=()=>controller?.abort(parentSignal.reason);
  if(parentSignal?.aborted)forwardAbort();
  else if(controller)parentSignal?.addEventListener('abort',forwardAbort,{once:true});
  const abortMessage = String(options.abortMessage || 'Provider batch aborted');
  throwIfWorldLoadAborted(signal, abortMessage);

  if (items.length === 0) {
    parentSignal?.removeEventListener('abort',forwardAbort);
    return {
      settled: [],
      metrics: Object.freeze({ requested: 0, started: 0, fulfilled: 0, rejected: 0, maxInFlight: 0 })
    };
  }

  const settled = new Array(items.length);
  const concurrency = normalizeConcurrency(options.concurrency, items.length);
  let cursor = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let started = 0;
  let fulfilled = 0;
  let rejected = 0;
  const deadline=controller?setTimeout(()=>{deadlineReached=true;controller.abort('provider-batch-deadline');},budgetMs):null;

  const runner = async () => {
    while (cursor < items.length) {
      throwIfWorldLoadAborted(parentSignal, abortMessage);
      if(deadlineReached)break;
      const index = cursor;
      cursor += 1;
      started += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const value = await worker(items[index], index, signal);
        settled[index] = { status: 'fulfilled', value };
        fulfilled += 1;
      } catch (reason) {
        throwIfWorldLoadAborted(parentSignal, abortMessage);
        settled[index] = { status: 'rejected', reason };
        rejected += 1;
      } finally {
        inFlight -= 1;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => runner()));
    throwIfWorldLoadAborted(parentSignal, abortMessage);
  } finally {
    if(deadline!==null)clearTimeout(deadline);
    parentSignal?.removeEventListener('abort',forwardAbort);
  }
  const skipped=items.length-started;
  for(let index=0;index<settled.length;index++)if(!settled[index])settled[index]={status:'rejected',reason:new Error('Provider batch deadline: request not started')};
  return {
    settled,
    metrics: Object.freeze({
      requested: items.length,
      started,
      fulfilled,
      rejected,
      maxInFlight,
      skipped,
      deadlineReached
    })
  };
}

export { runBoundedProviderBatch };
