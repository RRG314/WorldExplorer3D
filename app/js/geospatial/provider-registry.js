function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function safeError(error) {
  if (error?.name === 'AbortError') return 'Request timed out or was cancelled.';
  return error instanceof Error ? error.message : String(error || 'Unknown provider error');
}

function createProviderRegistry(options = {}) {
  const providers = new Map();
  const cache = new Map();
  const inFlight = new Map();
  const health = new Map();
  const failures = new Map();
  const maxActiveQueries = Math.max(1, Math.min(16, Number(options.maxActiveQueries) || 8));
  const events = [];
  const now = options.now || (() => Date.now());
  const maxCacheEntries = Math.max(8, Number(options.maxCacheEntries) || 64);

  function rememberEvent(type, providerId, detail = '') {
    events.push({ type, providerId, detail: String(detail || ''), at: now() });
    if (events.length > 40) events.splice(0, events.length - 40);
  }

  function register(definition = {}) {
    const id = String(definition.id || '').trim();
    if (!id) throw new TypeError('Geospatial providers require a stable id.');
    if (providers.has(id)) throw new Error(`Geospatial provider already registered: ${id}`);
    if (typeof definition.query !== 'function') throw new TypeError(`Provider ${id} requires query().`);
    providers.set(id, Object.freeze({
      id,
      sourceId: String(definition.sourceId || id),
      cacheTtlMs: Math.max(0, Number(definition.cacheTtlMs) || 0),
      timeoutMs: Math.max(1000, Number(definition.timeoutMs) || 8000),
      normalizeRequest: definition.normalizeRequest || ((request) => request),
      query: definition.query
    }));
    health.set(id, {
      status: 'idle',
      lastSuccessAt: 0,
      lastFailureAt: 0,
      lastCacheHitAt: 0,
      lastError: '',
      lastItemCount: 0,
      warningCount: 0,
      durationMs: 0
    });
    rememberEvent('registered', id);
    return () => {
      health.delete(id);
      invalidate(id);
      for (const [key, task] of inFlight) if (key.startsWith(`${id}:`)) task.controller.abort();
      return providers.delete(id);
    };
  }

  function cacheKey(provider, request) {
    return `${provider.id}:${JSON.stringify(stableValue(request))}`;
  }

  function trimCache() {
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
  }

  function cancelled() { return new DOMException('Provider request cancelled or timed out.', 'AbortError'); }

  // Each consumer owns its cancellation. Only the last departing consumer
  // aborts the shared fetch; force refresh cannot multiply an active request.
  function consume(task, signal) {
    task.consumers++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (callback, value) => {
        if (done) return;
        done = true;
        signal?.removeEventListener?.('abort', abort);
        task.consumers--;
        callback(value);
        if (!task.consumers && !task.settled) task.controller.abort();
      };
      const abort = () => finish(reject, cancelled());
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener?.('abort', abort, { once: true });
      task.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  async function query(providerId, request = {}, queryOptions = {}) {
    if (queryOptions.signal?.aborted) throw cancelled();
    const provider = providers.get(String(providerId));
    if (!provider) throw new Error(`Unknown geospatial provider: ${providerId}`);
    const normalizedRequest = provider.normalizeRequest(request);
    const key = cacheKey(provider, normalizedRequest);
    const cached = cache.get(key);
    if (!queryOptions.force && cached && cached.expiresAt > now()) {
      cache.delete(key); cache.set(key, cached);
      rememberEvent('cache-hit', provider.id);
      const providerHealth = health.get(provider.id);
      if (providerHealth) providerHealth.lastCacheHitAt = now();
      return { ...cached.value, fromCache: true };
    }
    const existing = inFlight.get(key);
    if (existing && !existing.controller.signal.aborted) return consume(existing, queryOptions.signal);
    if (inFlight.size >= maxActiveQueries) throw new Error('Data requests are busy. Retry after the current requests finish.');
    if ((failures.get(key) || 0) > now()) throw new Error('Data source is temporarily unavailable. Retry in a moment.');
    const controller = new AbortController();
    const task = { controller, consumers: 0, settled: false, promise: null };
    inFlight.set(key, task);
    task.promise = (async () => {
      const startedAt = now(), providerHealth = health.get(provider.id);
      let timedOut = false;
      const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, provider.timeoutMs);
      const abortPromise = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(cancelled()), { once: true }));
      if (providerHealth) providerHealth.status = 'loading';
      rememberEvent('loading', provider.id);
      try {
        const requestPromise = Promise.resolve().then(() => {
          if (controller.signal.aborted) throw cancelled();
          return provider.query(normalizedRequest, { signal: controller.signal, provider, registry: api });
        });
        const response = await Promise.race([requestPromise, abortPromise]);
        if (controller.signal.aborted || providers.get(provider.id) !== provider) throw cancelled();
        const value = Object.freeze({
          providerId: provider.id, sourceId: provider.sourceId,
          items: Array.isArray(response?.items) ? response.items : [],
          fetchedAt: String(response?.fetchedAt || new Date(now()).toISOString()),
          query: normalizedRequest,
          warnings: Array.isArray(response?.warnings) ? response.warnings : [],
          externalViewerUrl: String(response?.externalViewerUrl || ''),
          durationMs: Math.max(0, now() - startedAt), fromCache: false
        });
        cache.set(key, { value, expiresAt: now() + provider.cacheTtlMs }); trimCache(); failures.delete(key);
        if (providerHealth) Object.assign(providerHealth, { status: value.warnings.length ? 'degraded' : 'ready', lastSuccessAt: now(), lastError: value.warnings[0] || '', lastItemCount: value.items.length, warningCount: value.warnings.length, durationMs: value.durationMs });
        rememberEvent('ready', provider.id, value.items.length);
        return value;
      } catch (error) {
        const aborted = controller.signal.aborted && !timedOut;
        if (!aborted) {
          failures.set(key, now() + 1500);
          while (failures.size > maxCacheEntries) failures.delete(failures.keys().next().value);
          if (providerHealth) Object.assign(providerHealth, { status: [...cache.keys()].some(entry => entry.startsWith(`${provider.id}:`)) ? 'degraded' : 'failed', lastFailureAt: now(), lastError: safeError(error) });
          rememberEvent('failed', provider.id, safeError(error));
        } else if (providerHealth) providerHealth.status = providerHealth.lastSuccessAt ? 'ready' : 'idle';
        throw error;
      } finally {
        task.settled = true;
        clearTimeout(timeoutId);
        if (inFlight.get(key) === task) inFlight.delete(key);
      }
    })();
    return consume(task, queryOptions.signal);
  }

  function invalidate(providerId = '') {
    const prefix = providerId ? `${providerId}:` : '';
    for (const key of cache.keys()) {
      if (!prefix || key.startsWith(prefix)) cache.delete(key);
    }
  }

  function snapshot() {
    return {
      registered: providers.size,
      cachedQueries: cache.size,
      activeQueries: inFlight.size,
      maxActiveQueries,
      providers: [...providers.values()].map(({ id, sourceId, cacheTtlMs, timeoutMs }) => {
        const providerHealth = health.get(id) || {};
        const prefix = `${id}:`;
        return {
          id, sourceId, cacheTtlMs, timeoutMs,
          ...providerHealth,
          cachedQueries: [...cache.keys()].filter((key) => key.startsWith(prefix)).length,
          activeQueries: [...inFlight.keys()].filter((key) => key.startsWith(prefix)).length
        };
      }),
      recentEvents: events.slice(-12)
    };
  }

  const api = Object.freeze({ invalidate, query, register, snapshot });
  return api;
}

export { createProviderRegistry };
