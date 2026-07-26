import { createDestinationSession } from './destination-session.js';
import { createLifecycleScope } from './lifecycle-scope.js';

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createAppRuntime(options = {}) {
  const getDestination = options.getDestination;
  const commitDestination = options.commitDestination;
  const isDestinationValid = options.isDestinationValid;
  const createScheduler = options.createScheduler;
  const ports = options.ports || null;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const now = typeof options.now === 'function' ? options.now : defaultNow;

  if (typeof getDestination !== 'function') {
    throw new TypeError('AppRuntime requires getDestination().');
  }
  if (typeof commitDestination !== 'function') {
    throw new TypeError('AppRuntime requires commitDestination().');
  }
  if (typeof isDestinationValid !== 'function') {
    throw new TypeError('AppRuntime requires isDestinationValid().');
  }

  const adapters = new Map();
  let generation = 0;
  let activeSession = null;
  let activeTransition = null;
  let disposed = false;

  function emit(type, detail = {}) {
    onEvent?.(Object.freeze({
      type,
      at: now(),
      ...detail
    }));
  }

  function assertUsable() {
    if (disposed) throw new Error('AppRuntime is disposed.');
  }

  function validDestination(destination) {
    return isDestinationValid(destination) === true;
  }

  function isTransitionCurrent(token) {
    return !!token
      && activeTransition === token
      && token.scope.isActive()
      && !token.signal.aborted;
  }

  function finishTransition(token, reason = 'completed') {
    if (!isTransitionCurrent(token)) return false;
    token.finishedAt = now();
    token.finishReason = String(reason || 'completed');
    token.scope.dispose(token.finishReason);
    if (!Number.isFinite(token.committedAt)) {
      token.session.dispose(token.finishReason, token.finishedAt);
    }
    activeTransition = null;
    emit('transition-finished', {
      generation: token.generation,
      reason: token.finishReason,
      target: token.target
    });
    return true;
  }

  function cancelTransition(token = activeTransition, reason = 'superseded') {
    if (!token || !token.scope.isActive()) return false;
    token.cancelledAt = now();
    token.cancelReason = String(reason || 'superseded');
    token.abortController.abort(token.cancelReason);
    token.session.dispose(token.cancelReason, token.cancelledAt);
    if (activeSession === token.session) activeSession = null;
    token.scope.dispose(token.cancelReason);
    if (activeTransition === token) activeTransition = null;
    emit('transition-cancelled', {
      generation: token.generation,
      reason: token.cancelReason,
      target: token.target
    });
    return true;
  }

  function beginTransition(target, transitionOptions = {}) {
    assertUsable();
    if (!validDestination(target)) throw new Error(`Unknown destination: ${target}`);
    if (activeTransition) cancelTransition(activeTransition, 'superseded');

    const nextGeneration = ++generation;
    const source = String(transitionOptions.source || 'runtime');
    const scope = createLifecycleScope(`transition:${nextGeneration}:${source}`);
    const abortController = new AbortController();
    const scheduler = typeof createScheduler === 'function'
      ? createScheduler({ destination: target, generation: nextGeneration, source })
      : null;
    const session = createDestinationSession({
      destination: target,
      generation: nextGeneration,
      source,
      metadata: transitionOptions.metadata,
      scheduler
    });
    const token = {
      id: nextGeneration,
      generation: nextGeneration,
      source,
      from: getDestination(),
      target,
      startedAt: now(),
      committedAt: null,
      finishedAt: null,
      cancelledAt: null,
      finishReason: '',
      cancelReason: '',
      abortController,
      signal: abortController.signal,
      scope,
      session,
      metadata: session.metadata
    };
    activeTransition = token;
    emit('transition-started', {
      from: token.from,
      generation: token.generation,
      source,
      target
    });
    return token;
  }

  function commit(target, commitOptions = {}) {
    assertUsable();
    if (!validDestination(target)) return false;
    let token = commitOptions.token || null;
    if (token && (!isTransitionCurrent(token) || token.target !== target)) return false;
    if (!token) {
      token = activeTransition?.target === target
        ? activeTransition
        : beginTransition(target, { source: commitOptions.source });
    }

    const currentDestination = getDestination();
    if (currentDestination !== target) {
      const committed = commitDestination({
        from: currentDestination,
        source: token.source,
        target,
        token
      });
      if (committed !== true) {
        cancelTransition(token, 'commit-rejected');
        return false;
      }

      const previousSession = activeSession;
      previousSession?.dispose(`destination-changed:${target}`, now());
      activeSession = token.session;
      token.session.activate(now());
    } else {
      token.session.dispose('destination-already-active', now());
    }

    token.committedAt = now();
    emit('destination-committed', {
      from: token.from,
      generation: token.generation,
      target
    });
    if (commitOptions.finish !== false) finishTransition(token);
    return true;
  }

  function registerDestination(destination, adapter) {
    assertUsable();
    if (!validDestination(destination)) throw new Error(`Unknown destination: ${destination}`);
    if (!adapter || typeof adapter !== 'object') {
      throw new TypeError('Destination adapters must be objects.');
    }
    if (adapters.has(destination)) {
      throw new Error(`Destination adapter already registered: ${destination}`);
    }
    adapters.set(destination, adapter);
    emit('destination-registered', { destination });
    return () => adapters.get(destination) === adapter && adapters.delete(destination);
  }

  function exitCurrentSync(target, exitOptions = {}) {
    assertUsable();
    if (!validDestination(target)) throw new Error(`Unknown destination: ${target}`);
    const from = getDestination();
    if (!from || from === target) return false;
    const adapter = adapters.get(from);
    if (typeof adapter?.exitSync !== 'function') return false;
    adapter.exitSync({
      from,
      session: activeSession,
      source: String(exitOptions.source || 'runtime'),
      target
    });
    return true;
  }

  async function transition(target, transitionOptions = {}) {
    const token = beginTransition(target, transitionOptions);
    const fromAdapter = adapters.get(token.from);
    const targetAdapter = adapters.get(target);
    const baseContext = {
      ports,
      signal: token.signal,
      scope: token.scope,
      session: token.session,
      previousSession: activeSession,
      token
    };
    try {
      if (typeof fromAdapter?.exit === 'function') await fromAdapter.exit(baseContext);
      else if (typeof fromAdapter?.exitSync === 'function') fromAdapter.exitSync(baseContext);
      if (!isTransitionCurrent(token)) return false;
      await targetAdapter?.prepare?.(baseContext);
      if (!isTransitionCurrent(token)) return false;
      if (!commit(target, { token, finish: false })) return false;
      await targetAdapter?.enter?.({
        ...baseContext,
        session: activeSession
      });
      if (!isTransitionCurrent(token)) return false;
      finishTransition(token);
      return true;
    } catch (error) {
      cancelTransition(token, 'failed');
      throw error;
    }
  }

  function adapterSnapshots() {
    const snapshots = {};
    adapters.forEach((adapter, destination) => {
      try {
        snapshots[destination] = typeof adapter.snapshot === 'function'
          ? adapter.snapshot()
          : { registered: true };
      } catch (error) {
        snapshots[destination] = {
          registered: true,
          snapshotError: error instanceof Error ? error.message : String(error)
        };
      }
    });
    return snapshots;
  }

  function snapshot() {
    return {
      disposed,
      destination: getDestination(),
      registeredDestinations: [...adapters.keys()],
      destinations: adapterSnapshots(),
      activeSession: activeSession?.snapshot() || null,
      transition: activeTransition ? {
        id: activeTransition.id,
        generation: activeTransition.generation,
        source: activeTransition.source,
        from: activeTransition.from,
        target: activeTransition.target,
        committed: Number.isFinite(activeTransition.committedAt),
        scope: activeTransition.scope.snapshot(),
        session: activeTransition.session.snapshot()
      } : null
    };
  }

  function dispose(reason = 'disposed') {
    if (disposed) return false;
    disposed = true;
    cancelTransition(activeTransition, reason);
    activeSession?.dispose(reason, now());
    activeSession = null;
    adapters.clear();
    emit('runtime-disposed', { reason: String(reason || 'disposed') });
    return true;
  }

  return Object.freeze({
    beginTransition,
    cancelTransition,
    commit,
    dispose,
    exitCurrentSync,
    finishTransition,
    isTransitionCurrent,
    registerDestination,
    snapshot,
    transition
  });
}

export { createAppRuntime };
