import { createLifecycleScope } from './lifecycle-scope.js';

function createDestinationSession(options = {}) {
  const destination = String(options.destination || '').trim();
  if (!destination) throw new TypeError('Destination sessions require a destination.');
  const generation = Number(options.generation);
  if (!Number.isInteger(generation) || generation < 1) {
    throw new TypeError('Destination sessions require a positive integer generation.');
  }

  const source = String(options.source || 'runtime');
  const metadata = Object.freeze({
    ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {})
  });
  const scope = createLifecycleScope(`destination:${destination}:${generation}`);
  const abortController = new AbortController();
  const scheduler = options.scheduler || null;
  let state = 'preparing';
  let activatedAt = null;
  let disposedAt = null;
  let disposedReason = '';

  if (scheduler) {
    scope.defer(() => {
      if (typeof scheduler.dispose === 'function') scheduler.dispose('destination-disposed');
      else scheduler.stop?.('destination-disposed');
    }, 'frame-scheduler');
  }

  function activate(at = performance.now()) {
    if (state === 'disposed') return false;
    if (state === 'active') return false;
    state = 'active';
    activatedAt = Number(at);
    scheduler?.start?.();
    return true;
  }

  function dispose(reason = 'disposed', at = performance.now()) {
    if (state === 'disposed') return false;
    state = 'disposed';
    disposedAt = Number(at);
    disposedReason = String(reason || 'disposed');
    abortController.abort(disposedReason);
    scope.dispose(disposedReason);
    return true;
  }

  function snapshot() {
    return {
      destination,
      generation,
      source,
      metadata,
      state,
      active: state === 'active',
      activatedAt,
      disposedAt,
      disposedReason,
      aborted: abortController.signal.aborted,
      scope: scope.snapshot(),
      scheduler: scheduler?.snapshot?.() || null
    };
  }

  return Object.freeze({
    activate,
    destination,
    dispose,
    generation,
    metadata,
    scope,
    signal: abortController.signal,
    snapshot,
    source
  });
}

export { createDestinationSession };
