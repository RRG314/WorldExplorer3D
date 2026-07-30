const activeScopes = new Map();
let scopeSequence = 0;

function createLifecycleScope(owner = 'runtime') {
  const id = ++scopeSequence;
  const records = new Set();
  let active = true;
  let disposedReason = '';

  function track(type, cancel) {
    if (!active) {
      cancel();
      return null;
    }
    const record = { type, cancel };
    records.add(record);
    return record;
  }

  function release(record) {
    if (record) records.delete(record);
  }

  function timeout(callback, delay = 0) {
    let record = null;
    const handle = globalThis.setTimeout(() => {
      release(record);
      if (active) callback();
    }, Math.max(0, Number(delay) || 0));
    record = track('timeout', () => globalThis.clearTimeout(handle));
    return handle;
  }

  function interval(callback, delay = 0) {
    const handle = globalThis.setInterval(() => {
      if (active) callback();
    }, Math.max(1, Number(delay) || 1));
    track('interval', () => globalThis.clearInterval(handle));
    return handle;
  }

  function animationFrame(callback) {
    if (typeof globalThis.requestAnimationFrame !== 'function') return null;
    let record = null;
    const handle = globalThis.requestAnimationFrame((timestamp) => {
      release(record);
      if (active) callback(timestamp);
    });
    record = track('animation-frame', () => globalThis.cancelAnimationFrame?.(handle));
    return handle;
  }

  function listen(target, eventName, listener, options) {
    if (!target?.addEventListener || !target?.removeEventListener) return () => {};
    target.addEventListener(eventName, listener, options);
    const record = track('listener', () => target.removeEventListener(eventName, listener, options));
    return () => {
      if (!record || !records.has(record)) return;
      record.cancel();
      release(record);
    };
  }

  function defer(disposer, type = 'resource') {
    if (typeof disposer !== 'function') return () => {};
    const record = track(type, disposer);
    return () => {
      if (!record || !records.has(record)) return;
      record.cancel();
      release(record);
    };
  }

  function guard(callback) {
    return (...args) => active ? callback(...args) : undefined;
  }

  function dispose(reason = 'disposed') {
    if (!active) return false;
    active = false;
    disposedReason = String(reason || 'disposed');
    const pending = [...records];
    records.clear();
    for (const record of pending.reverse()) {
      try {
        record.cancel();
      } catch (error) {
        console.warn(`[lifecycle:${owner}] ${record.type} cleanup failed`, error);
      }
    }
    activeScopes.delete(id);
    return true;
  }

  function snapshot() {
    const counts = {};
    for (const record of records) counts[record.type] = (counts[record.type] || 0) + 1;
    return {
      owner,
      id,
      active,
      disposedReason,
      resourceCount: records.size,
      resources: counts
    };
  }

  const scope = Object.freeze({
    animationFrame,
    defer,
    dispose,
    guard,
    interval,
    isActive: () => active,
    listen,
    owner,
    snapshot,
    timeout
  });
  activeScopes.set(id, scope);
  return scope;
}

function getLifecycleRegistrySnapshot() {
  const scopes = [...activeScopes.values()].map((scope) => scope.snapshot());
  const owners = {};
  const resources = {};
  for (const scope of scopes) {
    const owner = owners[scope.owner] || { scopes: 0, resources: 0 };
    owner.scopes += 1;
    owner.resources += scope.resourceCount;
    owners[scope.owner] = owner;
    for (const [type, count] of Object.entries(scope.resources)) {
      resources[type] = (resources[type] || 0) + count;
    }
  }
  return {
    activeScopeCount: scopes.length,
    resourceCount: scopes.reduce((total, scope) => total + scope.resourceCount, 0),
    owners,
    resources,
    scopes
  };
}

export { createLifecycleScope, getLifecycleRegistrySnapshot };
