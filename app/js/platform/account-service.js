function createAccountService(options = {}) {
  const listeners = new Set();
  let currentUser = options.getCurrentUser?.() || null;
  let unsubscribe = null;
  let started = false;
  let revision = 0;

  function publish(user) {
    currentUser = user || null;
    revision++;
    options.onChange?.(currentUser);
    listeners.forEach((listener) => {
      try {
        listener(currentUser);
      } catch (error) {
        console.warn('[account] Subscriber failed.', error);
      }
    });
  }

  function start() {
    if (started) return api;
    started = true;
    unsubscribe = options.observeAuth?.(publish) || null;
    return api;
  }

  function subscribe(listener, emitCurrent = true) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (emitCurrent) listener(currentUser);
    return () => listeners.delete(listener);
  }

  function dispose() {
    try {
      unsubscribe?.();
    } finally {
      unsubscribe = null;
      listeners.clear();
      started = false;
    }
  }

  function snapshot() {
    const providers = Array.isArray(currentUser?.providerData)
      ? currentUser.providerData.map((entry) => String(entry?.providerId || '')).filter(Boolean)
      : [];
    return {
      started,
      signedIn: !!currentUser,
      anonymous: !!currentUser?.isAnonymous,
      providerCount: providers.length,
      revision
    };
  }

  const api = Object.freeze({
    dispose,
    getUser: () => currentUser,
    snapshot,
    start,
    subscribe
  });
  return api;
}

export { createAccountService };
