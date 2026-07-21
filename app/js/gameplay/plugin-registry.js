function safeError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown gameplay error');
}

function createGameplayPluginRegistry(options = {}) {
  const plugins = new Map();
  const listeners = new Set();
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  let active = null;
  let transitionCount = 0;
  let failureCount = 0;

  function emit(type, record, detail = {}) {
    const event = {
      type,
      id: record?.id || null,
      category: record?.category || null,
      timestamp: now(),
      ...detail
    };
    options.onEvent?.(event);
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('[gameplay] Plugin event listener failed.', error);
      }
    });
  }

  function register(definition = {}) {
    const id = String(definition.id || '').trim();
    if (!id) throw new TypeError('Gameplay plugins require a stable id.');
    if (plugins.has(id)) throw new Error(`Gameplay plugin already registered: ${id}`);

    const record = {
      id,
      label: String(definition.label || id),
      category: String(definition.category || 'game'),
      start: typeof definition.start === 'function' ? definition.start : null,
      update: typeof definition.update === 'function' ? definition.update : null,
      stop: typeof definition.stop === 'function' ? definition.stop : null,
      save: typeof definition.save === 'function' ? definition.save : null,
      leaderboard: typeof definition.leaderboard === 'function' ? definition.leaderboard : null,
      starts: 0,
      updates: 0,
      failures: 0,
      totalUpdateMs: 0,
      lastError: ''
    };
    plugins.set(id, record);
    emit('registered', record);

    return () => {
      if (active?.record === record) stop('unregistered');
      plugins.delete(id);
      emit('unregistered', record);
    };
  }

  function stop(reason = 'stopped', context = {}) {
    if (!active) return false;
    const session = active;
    active = null;
    try {
      session.record.stop?.(context, session.state, reason);
      emit('stopped', session.record, { reason });
    } catch (error) {
      session.record.failures++;
      session.record.lastError = safeError(error);
      failureCount++;
      options.onError?.(error, session.record.id, 'stop');
      emit('failed', session.record, { phase: 'stop', error: session.record.lastError });
    }
    return true;
  }

  function start(id, context = {}) {
    const record = plugins.get(String(id));
    if (!record) throw new Error(`Unknown gameplay plugin: ${id}`);
    stop('replaced', context);

    try {
      const state = record.start?.(context) ?? null;
      record.starts++;
      record.lastError = '';
      active = { record, state, startedAt: now() };
      transitionCount++;
      emit('started', record);
      return state;
    } catch (error) {
      record.failures++;
      record.lastError = safeError(error);
      failureCount++;
      options.onError?.(error, record.id, 'start');
      emit('failed', record, { phase: 'start', error: record.lastError });
      throw error;
    }
  }

  function update(dt, context = {}) {
    if (!active?.record.update) return;
    const session = active;
    const startedAt = now();
    try {
      session.record.update(dt, context, session.state);
      session.record.updates++;
      session.record.totalUpdateMs += Math.max(0, now() - startedAt);
    } catch (error) {
      session.record.failures++;
      session.record.lastError = safeError(error);
      failureCount++;
      options.onError?.(error, session.record.id, 'update');
      emit('failed', session.record, { phase: 'update', error: session.record.lastError });
      stop('update-failed', context);
    }
  }

  function save(context = {}) {
    if (!active?.record.save) return null;
    return active.record.save(context, active.state);
  }

  function leaderboard(context = {}) {
    if (!active?.record.leaderboard) return null;
    return active.record.leaderboard(context, active.state);
  }

  function snapshot() {
    return {
      activeId: active?.record.id || null,
      activeForMs: active ? Math.max(0, now() - active.startedAt) : 0,
      registered: plugins.size,
      transitionCount,
      failureCount,
      plugins: [...plugins.values()].map((record) => ({
        id: record.id,
        label: record.label,
        category: record.category,
        starts: record.starts,
        updates: record.updates,
        failures: record.failures,
        averageUpdateMs: record.updates ? Number((record.totalUpdateMs / record.updates).toFixed(3)) : 0,
        lastError: record.lastError,
        capabilities: {
          update: !!record.update,
          save: !!record.save,
          leaderboard: !!record.leaderboard
        }
      }))
    };
  }

  return Object.freeze({
    getActiveId: () => active?.record.id || null,
    has: (id) => plugins.has(String(id)),
    leaderboard,
    register,
    save,
    snapshot,
    start,
    stop,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update
  });
}

export { createGameplayPluginRegistry };
