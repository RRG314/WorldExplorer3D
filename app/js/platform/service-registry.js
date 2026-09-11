function safeError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown service error');
}

function createPlatformServiceRegistry(options = {}) {
  const services = new Map();
  const listeners = new Set();
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());

  function emit(type, record) {
    const event = {
      type,
      id: record.id,
      category: record.category,
      status: record.status,
      timestamp: now()
    };
    options.onEvent?.(event);
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('[platform] Service event listener failed.', error);
      }
    });
  }

  function registerService(definition = {}) {
    const id = String(definition.id || '').trim();
    if (!id) throw new TypeError('Platform services require a stable id.');
    if (services.has(id)) throw new Error(`Platform service already registered: ${id}`);
    if (typeof definition.load !== 'function') throw new TypeError(`Platform service ${id} requires a load function.`);
    const record = {
      id,
      category: String(definition.category || 'platform'),
      load: definition.load,
      dispose: definition.dispose,
      status: 'idle',
      value: null,
      promise: null,
      attempts: 0,
      readyAt: 0,
      lastDurationMs: 0,
      lastError: ''
    };
    services.set(id, record);
    emit('registered', record);
    return () => resetService(id, 'unregistered', true);
  }

  async function ensureService(id, context = {}) {
    const record = services.get(String(id));
    if (!record) throw new Error(`Unknown platform service: ${id}`);
    if (record.status === 'ready') return record.value;
    if (record.promise) return record.promise;

    record.status = 'loading';
    record.attempts++;
    record.lastError = '';
    const startedAt = now();
    emit('loading', record);
    record.promise = Promise.resolve()
      .then(() => record.load({ context, id: record.id, registry: api }))
      .then((value) => {
        record.value = value ?? null;
        record.status = 'ready';
        record.readyAt = now();
        record.lastDurationMs = Math.max(0, record.readyAt - startedAt);
        record.promise = null;
        emit('ready', record);
        return record.value;
      })
      .catch((error) => {
        record.status = 'failed';
        record.lastDurationMs = Math.max(0, now() - startedAt);
        record.lastError = safeError(error);
        record.promise = null;
        emit('failed', record);
        throw error;
      });
    return record.promise;
  }

  async function callService(id, method, ...args) {
    const value = await ensureService(id);
    const handler = value?.[method];
    if (typeof handler !== 'function') throw new Error(`Platform service ${id} does not provide ${method}().`);
    return handler(...args);
  }

  function resetService(id, reason = 'reset', remove = false) {
    const record = services.get(String(id));
    if (!record) return false;
    const value = record.value;
    try {
      if (typeof record.dispose === 'function') record.dispose(value, reason);
      else value?.dispose?.(reason);
    } catch (error) {
      console.warn(`[platform] Service disposal failed: ${record.id}`, error);
    }
    record.status = 'idle';
    record.value = null;
    record.promise = null;
    record.readyAt = 0;
    emit(remove ? 'unregistered' : 'reset', record);
    if (remove) services.delete(record.id);
    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function snapshot() {
    return {
      registered: services.size,
      services: [...services.values()].map((record) => ({
        id: record.id,
        category: record.category,
        status: record.status,
        attempts: record.attempts,
        readyAt: record.readyAt,
        lastDurationMs: Number(record.lastDurationMs.toFixed(3)),
        lastError: record.lastError
      }))
    };
  }

  const api = Object.freeze({
    call: callService,
    ensure: ensureService,
    isReady: (id) => services.get(String(id))?.status === 'ready',
    peek: (id) => services.get(String(id))?.value || null,
    register: registerService,
    reset: resetService,
    snapshot,
    subscribe
  });
  return api;
}

export { createPlatformServiceRegistry };
