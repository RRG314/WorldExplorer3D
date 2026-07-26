function createLifecycleScope(owner = 'runtime') {
  const records = new Set();
  const animationFrameRecords = new Map();
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

  function timeoutFn(callback, delay = 0) {
    let record = null;
    const handle = globalThis.setTimeout(() => {
      release(record);
      if (active) callback();
    }, Math.max(0, Number(delay) || 0));
    record = track('timeout', () => globalThis.clearTimeout(handle));
    return handle;
  }

  const timeout = timeoutFn;

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
      animationFrameRecords.delete(handle);
      if (active) callback(timestamp);
    });
    record = track('animation-frame', () => {
      animationFrameRecords.delete(handle);
      globalThis.cancelAnimationFrame?.(handle);
    });
    if (record) animationFrameRecords.set(handle, record);
    return handle;
  }

  function cancelAnimationFrame(handle) {
    const record = animationFrameRecords.get(handle);
    if (!record) return false;
    record.cancel();
    release(record);
    return true;
  }

  function idle(callback, timeout = 2000) {
    if (typeof globalThis.requestIdleCallback !== 'function') {
      return timeoutFn(
        () => callback({ didTimeout: true, timeRemaining: () => 0 }),
        Math.min(50, Math.max(0, Number(timeout) || 0))
      );
    }
    let record = null;
    const handle = globalThis.requestIdleCallback((deadline) => {
      release(record);
      if (active) callback(deadline);
    }, { timeout: Math.max(0, Number(timeout) || 0) });
    record = track('idle-callback', () => globalThis.cancelIdleCallback?.(handle));
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
    return true;
  }

  function snapshot() {
    const counts = {};
    for (const record of records) counts[record.type] = (counts[record.type] || 0) + 1;
    return {
      owner,
      active,
      disposedReason,
      resourceCount: records.size,
      resources: counts
    };
  }

  return Object.freeze({
    animationFrame,
    cancelAnimationFrame,
    defer,
    dispose,
    guard,
    idle,
    interval,
    isActive: () => active,
    listen,
    owner,
    snapshot,
    timeout
  });
}

export { createLifecycleScope };
