import { ACCELERATOR_PROTOCOL } from './accelerator-studies.js';
export function createAcceleratorExperimentClient({
  workerFactory = () =>
    new Worker(new URL('./accelerator-experiment-worker.js', import.meta.url), { type: 'module' }),
  isCurrent = () => true,
  timeoutMs = 25000,
} = {}) {
  let worker = null,
    closed = false,
    sequence = 0,
    pending = null;
  function finish(error, value) {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timeout);
    error ? p.reject(error) : p.resolve(value);
  }
  function ensure() {
    if (closed || !isCurrent())
      throw new DOMException('The experiment visit changed.', 'AbortError');
    if (worker) return;
    worker = workerFactory();
    worker.onmessage = ({ data }) => {
      const p = pending;
      if (!p || data?.requestId !== p.requestId) return;
      if (
        !isCurrent({ generation: p.generation, revision: p.revision }) ||
        data.protocol !== ACCELERATOR_PROTOCOL ||
        data.generation !== p.generation ||
        data.revision !== p.revision
      ) {
        finish(new DOMException('This experiment response is stale.', 'AbortError'));
        return;
      }
      finish(data.ok ? null : Error(data.error || 'The experiment could not finish.'), data.result);
    };
    worker.onerror = () => {
      finish(Error('The experiment worker stopped. Reopen the instrument.'));
      worker?.terminate();
      worker = null;
    };
  }
  return {
    run({ studyId, method, inputs, generation, revision }) {
      ensure();
      finish(new DOMException('A newer instrument request replaced this response.', 'AbortError'));
      const requestId = ++sequence;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          finish(Error('The experiment exceeded its response time. Retry the instrument.'));
          worker?.terminate();
          worker = null;
        }, timeoutMs);
        pending = { resolve, reject, timeout, requestId, generation, revision };
        try {
          worker.postMessage({
            protocol: ACCELERATOR_PROTOCOL,
            requestId,
            generation,
            revision,
            studyId,
            method,
            inputs,
          });
        } catch (error) {
          finish(error);
        }
      });
    },
    dispose() {
      if (closed) return;
      closed = true;
      finish(new DOMException('The experiment visit closed.', 'AbortError'));
      worker?.terminate();
      worker = null;
    },
    snapshot: () => ({ closed, workerActive: !!worker, pending: !!pending, requests: sequence }),
  };
}
