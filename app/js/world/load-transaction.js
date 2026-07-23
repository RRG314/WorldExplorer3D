function createWorldLoadTransactionManager(options = {}) {
  const now = typeof options.now === 'function'
    ? options.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  let sequence = 0;
  let active = null;
  let lastFinished = null;

  function snapshotToken(token) {
    if (!token) return null;
    return {
      id: token.id,
      signature: token.signature,
      source: token.source,
      location: token.location,
      status: token.status,
      startedAt: token.startedAt,
      finishedAt: token.finishedAt,
      reason: token.reason,
      details: token.details
    };
  }

  function finish(token, status, reason = '', details = null) {
    if (!token || token.status !== 'active') return false;
    token.status = status;
    token.reason = String(reason || status);
    token.details = details && typeof details === 'object' ? { ...details } : null;
    token.finishedAt = now();
    if (active === token) active = null;
    lastFinished = snapshotToken(token);
    return true;
  }

  function abort(token = active, reason = 'aborted') {
    if (!token || token.status !== 'active') return false;
    token.abortController.abort(reason);
    return finish(token, 'aborted', reason);
  }

  function begin(definition = {}) {
    const signature = String(definition.signature || '').trim();
    if (!signature) throw new TypeError('World load transactions require a signature.');
    if (active) abort(active, 'superseded');
    const abortController = new AbortController();
    const token = {
      id: ++sequence,
      signature,
      source: String(definition.source || 'world-load'),
      location: definition.location && typeof definition.location === 'object'
        ? { ...definition.location }
        : null,
      status: 'active',
      startedAt: now(),
      finishedAt: null,
      reason: '',
      details: null,
      abortController,
      signal: abortController.signal,
      isCurrent: () => active === token && token.status === 'active' && !token.signal.aborted,
      commit: (details = null) => (
        token.isCurrent() && finish(token, 'committed', 'committed', details)
      ),
      fail: (error) => finish(
        token,
        'failed',
        error instanceof Error ? error.message : String(error || 'failed')
      ),
      abort: (reason = 'aborted') => abort(token, reason),
      snapshot: () => snapshotToken(token)
    };
    active = token;
    return token;
  }

  function snapshot() {
    return {
      sequence,
      active: snapshotToken(active),
      lastFinished
    };
  }

  return Object.freeze({
    abort,
    begin,
    getActive: () => active,
    snapshot
  });
}

const worldLoadTransactions = createWorldLoadTransactionManager();

export { createWorldLoadTransactionManager, worldLoadTransactions };
