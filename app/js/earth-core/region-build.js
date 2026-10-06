// A region owns its construction resources until the publication owner accepts
// them. Cancellation is cooperative: even a late provider result is registered
// and retired, and the next build cannot overtake unfinished dependencies.
export function createRegionBuild(parentSignal) {
  const controller = new AbortController();
  const resources = new Map();
  let closed = false;
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });

  function own(value, retire = resource => resource.dispose()) {
    if (value == null) return value;
    if (closed) retire(value);
    else if (!resources.has(value)) resources.set(value, retire);
    return value;
  }

  async function loadAll(entries) {
    let failure;
    const results = await Promise.allSettled(entries.map(async ({ load, retire }) => {
      try {
        controller.signal.throwIfAborted();
        const value = await load(controller.signal);
        if (retire) own(value, retire);
        return value;
      } catch (error) {
        if (failure === undefined) failure = error;
        controller.abort(error);
        throw error;
      }
    }));
    // Drain every launched dependency before exposing failure. Promise.all's
    // early rejection used to orphan a later building/road worker packet.
    if (results.some(result => result.status === 'rejected')) throw failure;
    controller.signal.throwIfAborted();
    return results.map(result => result.value);
  }

  return {
    signal: controller.signal,
    own,
    transfer(value) { resources.delete(value); return value; },
    loadAll,
    dispose() {
      if (closed) return;
      closed = true;
      parentSignal?.removeEventListener('abort', abort);
      controller.abort();
      const errors = [];
      for (const [value, retire] of [...resources].reverse()) {
        try { retire(value); } catch (error) { errors.push(error); }
      }
      resources.clear();
      if (errors.length) throw new AggregateError(errors, 'Region resource retirement failed');
    }
  };
}
