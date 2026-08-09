const ACTIVE_STATES = new Set(['requested', 'fetching', 'compiling']);
const TERMINAL_STATES = new Set(['published', 'superseded', 'failed', 'disposed']);

const ALLOWED_TRANSITIONS = Object.freeze({
  requested: new Set(['fetching', 'superseded', 'failed', 'disposed']),
  fetching: new Set(['compiling', 'superseded', 'failed', 'disposed']),
  compiling: new Set(['fetching', 'published', 'superseded', 'failed', 'disposed']),
  published: new Set(['disposed']),
  superseded: new Set(['disposed']),
  failed: new Set(['disposed']),
  disposed: new Set()
});

function finiteTime(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function freezeProviderStats(stats) {
  return Object.freeze(Object.fromEntries(
    [...stats.entries()].map(([provider, value]) => [provider, Object.freeze({ ...value })])
  ));
}

export function createWorldLoadSession(request, options = {}) {
  if (!request || !Number.isInteger(request.sequence) || request.sequence < 1) {
    throw new TypeError('World load session requires an immutable request with a positive sequence.');
  }

  const clock = typeof options.now === 'function' ? options.now : () => performance.now();
  const startedAt = finiteTime(clock(), 0);
  const providers = new Map();
  const operations = new Map();
  const events = [];
  let nextOperationId = 0;
  let state = 'requested';
  let reason = '';
  let updatedAt = startedAt;

  const providerStats = (provider) => {
    const key = String(provider || 'unknown');
    if (!providers.has(key)) {
      providers.set(key, {
        started: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
        discarded: 0,
        inFlight: 0
      });
    }
    return { key, stats: providers.get(key) };
  };

  const recordEvent = (type, detail = {}) => {
    updatedAt = finiteTime(clock(), updatedAt);
    events.push(Object.freeze({ type, at: updatedAt, ...detail }));
  };

  const transition = (nextState, nextReason = '') => {
    const next = String(nextState || '');
    if (next === state) return true;
    if (!ALLOWED_TRANSITIONS[state]?.has(next)) return false;
    const previous = state;
    state = next;
    reason = String(nextReason || '');
    recordEvent('transition', { from: previous, to: next, reason });
    return true;
  };

  const beginProviderWork = (provider, operation = 'request') => {
    if (!ACTIVE_STATES.has(state)) return null;
    const { key, stats } = providerStats(provider);
    const id = ++nextOperationId;
    const token = Object.freeze({ id, provider: key, operation: String(operation || 'request') });
    operations.set(id, token);
    stats.started += 1;
    stats.inFlight += 1;
    recordEvent('provider-start', { id, provider: key, operation: token.operation });
    return token;
  };

  const settleProviderWork = (token, outcome = 'completed') => {
    const active = operations.get(Number(token?.id));
    if (!active || active !== token) return false;
    const normalized = ['completed', 'failed', 'aborted', 'discarded'].includes(outcome)
      ? outcome
      : 'failed';
    operations.delete(active.id);
    const { stats } = providerStats(active.provider);
    stats.inFlight = Math.max(0, stats.inFlight - 1);
    stats[normalized] += 1;
    recordEvent('provider-settle', {
      id: active.id,
      provider: active.provider,
      operation: active.operation,
      outcome: normalized
    });
    return true;
  };

  const snapshot = () => Object.freeze({
    requestId: request.id,
    request,
    sequence: request.sequence,
    state,
    reason: reason || null,
    active: ACTIVE_STATES.has(state),
    terminal: TERMINAL_STATES.has(state),
    startedAt,
    updatedAt,
    providers: freezeProviderStats(providers),
    outstandingProviderWork: operations.size,
    events: Object.freeze(events.slice())
  });

  recordEvent('transition', { from: null, to: state, reason: '' });

  return Object.freeze({
    beginProviderWork,
    dispose: (nextReason = 'disposed') => transition('disposed', nextReason),
    fail: (nextReason = 'failed') => transition('failed', nextReason),
    isActive: () => ACTIVE_STATES.has(state),
    publish: (nextReason = 'published') => transition('published', nextReason),
    request,
    settleProviderWork,
    snapshot,
    supersede: (nextReason = 'superseded') => transition('superseded', nextReason),
    transition
  });
}

export const WORLD_LOAD_SESSION_STATES = Object.freeze([
  'requested',
  'fetching',
  'compiling',
  'published',
  'superseded',
  'failed',
  'disposed'
]);
