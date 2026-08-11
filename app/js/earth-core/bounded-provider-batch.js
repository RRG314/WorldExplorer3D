import { throwIfWorldLoadAborted } from './request-cancellation.js?v=1';

function normalizeConcurrency(value, itemCount) {
  const requested = Math.floor(Number(value) || 1);
  return Math.max(1, Math.min(32, itemCount, requested));
}

async function runBoundedProviderBatch(items, worker, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('Provider batch items must be an array.');
  if (typeof worker !== 'function') throw new TypeError('Provider batch worker must be a function.');
  const signal = options.signal || null;
  const abortMessage = String(options.abortMessage || 'Provider batch aborted');
  throwIfWorldLoadAborted(signal, abortMessage);

  if (items.length === 0) {
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

  const runner = async () => {
    while (cursor < items.length) {
      throwIfWorldLoadAborted(signal, abortMessage);
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
        throwIfWorldLoadAborted(signal, abortMessage);
        settled[index] = { status: 'rejected', reason };
        rejected += 1;
      } finally {
        inFlight -= 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  throwIfWorldLoadAborted(signal, abortMessage);
  return {
    settled,
    metrics: Object.freeze({
      requested: items.length,
      started,
      fulfilled,
      rejected,
      maxInFlight
    })
  };
}

export { runBoundedProviderBatch };
