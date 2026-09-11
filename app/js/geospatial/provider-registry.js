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
      return providers.delete(id);
    };
  }

  function cacheKey(provider, request) {
    return `${provider.id}:${JSON.stringify(stableValue(request))}`;
  }

  function trimCache() {
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
  }

  async function query(providerId, request = {}, queryOptions = {}) {
    const provider = providers.get(String(providerId));
    if (!provider) throw new Error(`Unknown geospatial provider: ${providerId}`);
    const normalizedRequest = provider.normalizeRequest(request);
    const key = cacheKey(provider, normalizedRequest);
    const cached = cache.get(key);
    const force = queryOptions.force === true;
    if (!force && cached && cached.expiresAt > now()) {
      cache.delete(key);
      cache.set(key, cached);
      rememberEvent('cache-hit', provider.id);
      const providerHealth = health.get(provider.id);
      if (providerHealth) providerHealth.lastCacheHitAt = now();
      return { ...cached.value, fromCache: true };
    }
    if (!force && inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), provider.timeoutMs);
      const abortFromCaller = () => controller.abort();
      queryOptions.signal?.addEventListener?.('abort', abortFromCaller, { once: true });
      const startedAt = now();
      const providerHealth = health.get(provider.id);
      if (providerHealth) providerHealth.status = 'loading';
      rememberEvent('loading', provider.id);
      try {
        const response = await provider.query(normalizedRequest, {
          signal: controller.signal,
          provider,
          registry: api
        });
        const value = Object.freeze({
          providerId: provider.id,
          sourceId: provider.sourceId,
          items: Array.isArray(response?.items) ? response.items : [],
          fetchedAt: String(response?.fetchedAt || new Date().toISOString()),
          query: normalizedRequest,
          warnings: Array.isArray(response?.warnings) ? response.warnings : [],
          externalViewerUrl: String(response?.externalViewerUrl || ''),
          durationMs: Math.max(0, now() - startedAt),
          fromCache: false
        });
        cache.set(key, { value, expiresAt: now() + provider.cacheTtlMs });
        trimCache();
        if (providerHealth) Object.assign(providerHealth, {
          status: value.warnings.length ? 'degraded' : 'ready',
          lastSuccessAt: now(),
          lastError: value.warnings[0] || '',
          lastItemCount: value.items.length,
          warningCount: value.warnings.length,
          durationMs: value.durationMs
        });
        rememberEvent('ready', provider.id, value.items.length);
        return value;
      } catch (error) {
        if (providerHealth) Object.assign(providerHealth, {
          status: [...cache.keys()].some((cacheEntry) => cacheEntry.startsWith(`${provider.id}:`)) ? 'degraded' : 'failed',
          lastFailureAt: now(),
          lastError: safeError(error)
        });
        rememberEvent('failed', provider.id, safeError(error));
        throw error;
      } finally {
        clearTimeout(timeoutId);
        queryOptions.signal?.removeEventListener?.('abort', abortFromCaller);
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, task);
    return task;
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
