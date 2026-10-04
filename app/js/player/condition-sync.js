import { createConditionOutbox } from './condition-outbox.js';

export function createConditionSync({ uid, send, onState = () => {}, onError = () => {}, onConfirmed = () => {},
  isCurrent = () => true, indexedDB, storage, outbox = createConditionOutbox({ uid, indexedDB, storage }),
  locks = globalThis.navigator?.locks, channelFactory = name => globalThis.BroadcastChannel ? new BroadcastChannel(name) : null,
  setTimer = setTimeout, clearTimer = clearTimeout, identity = () => crypto.randomUUID() } = {}) {
  let disposed = false, initialized = false, ready = false, running = false, timer = null;
  let revision = 0, attempts = 0, error = '', pendingWrite = null, sequence = 0, confirmedRevision = -1;
  let record = { pending: null, operation: null, revision: 0, confirmed: null };
  let observed = null, localWork = Promise.resolve(), channel = null;
  let storageWarningSent = false;
  const lifecycle = globalThis.window;
  try { channel = channelFactory(`world-explorer:condition:${uid}`); } catch { /* Refresh at dispatch still reads current shared state. */ }

  const snapshot = () => Object.freeze({ ready: ready && initialized, pending: !!(pendingWrite || record.pending || record.operation), saving: running,
    status: disposed ? 'disposed' : !ready || !initialized ? 'loading' : error ? 'retrying' : running || record.operation ? 'saving' : pendingWrite || record.pending ? 'queued' : 'saved',
    revision, error, durable: initialized && !pendingWrite && outbox.durable(),
    latestCondition: pendingWrite?.value.condition ?? record.pending?.condition ?? record.operation?.condition ?? null });
  const publish = () => { if (!disposed && isCurrent()) onState(snapshot()); };
  const broadcast = () => { if (!disposed && outbox.durable()) channel?.postMessage({ changed: true }); };
  function confirm() {
    if (disposed || !isCurrent() || !ready || !initialized || pendingWrite || record.pending || record.operation) return;
    const saved = record.confirmed;
    const state = saved && (!observed || saved.revision >= observed.revision) ? saved : observed;
    if (!Number.isFinite(state?.condition) || !Number.isInteger(state.revision) || state.revision <= confirmedRevision) return;
    confirmedRevision = state.revision;
    onConfirmed(state);
  }
  function adopt(next) {
    if (disposed || !isCurrent()) return;
    record = next;
    revision = Math.max(revision, Number(next.revision) || 0);
    if (!outbox.durable() && !storageWarningSent) {
      storageWarningSent = true;
      onError(Object.assign(new Error('Health changes cannot be saved on this device. Keep this tab open until account sync finishes.'), { code: 'condition-storage-unavailable' }));
    }
  }
  function schedule(delay = 180) {
    if (disposed || !ready || !initialized || running || !isCurrent()) return;
    if (!pendingWrite && !record.pending && !record.operation) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => { timer = null; void flush(); }, delay);
  }
  function task(action) {
    const next = localWork.then(action);
    localWork = next.catch(e => {
      if (disposed || !isCurrent()) return;
      error = e.message || 'The latest health change has not been saved.';
      publish(); onError(e);
    });
    return next;
  }
  const initializedTask = task(async () => {
    adopt(await outbox.read()); initialized = true; publish(); confirm(); schedule();
  });
  const refresh = () => {
    if (disposed || !isCurrent()) return;
    void task(async () => { adopt(await outbox.read()); publish(); confirm(); schedule(); });
  };
  if (channel) channel.onmessage = refresh;
  lifecycle?.addEventListener('focus', refresh);
  lifecycle?.document?.addEventListener('visibilitychange', refresh);
  // Recover a transaction committed as its owner tab closed, including when
  // no BroadcastChannel notification could be delivered after that closure.
  const poll = lifecycle?.setInterval(refresh, 30_000);

  async function dispatch() {
    await localWork;
    if (disposed || !ready || !initialized || !isCurrent()) return;
    const claimed = await outbox.update(row => {
      if (disposed || !isCurrent()) return;
      if (!row.operation && row.pending) {
        row.operation = { ...row.pending, mutationId: identity(), expectedRevision: Math.max(revision, Number(row.revision) || 0) };
        row.pending = null;
      }
    });
    adopt(claimed); publish();
    if (disposed || !isCurrent() || !claimed.operation) { confirm(); return; }
    const sent = claimed.operation;
    try {
      const response = await send(sent);
      const committedRevision = Number.isInteger(response?.revision) ? response.revision : sent.expectedRevision + 1;
      const completed = await outbox.update(row => {
        if (row.operation?.mutationId === sent.mutationId) row.operation = null;
        row.revision = Math.max(Number(row.revision) || 0, committedRevision);
        if (Number.isFinite(response?.condition) && (!row.confirmed || committedRevision >= row.confirmed.revision)) {
          row.confirmed = { condition: response.condition, revision: committedRevision };
        }
      });
      adopt(completed);
      if (!disposed && isCurrent()) { attempts = 0; error = ''; broadcast(); confirm(); }
    } catch (e) {
      if (e.status === 409 && Number.isInteger(e.payload?.state?.revision)) {
        const rebased = await outbox.update(row => {
          row.revision = Math.max(Number(row.revision) || 0, e.payload.state.revision);
          if (row.operation?.mutationId === sent.mutationId) {
            row.pending ||= { condition: sent.condition, reason: sent.reason };
            row.operation = null;
          }
        });
        adopt(rebased); broadcast();
      }
      // Ambiguous network outcomes keep the durable operation identity intact.
      if (!disposed && isCurrent()) {
        attempts++; error = e.message || 'Health is waiting to sync.'; onError(e);
      }
    }
  }

  async function flush() {
    if (disposed || !ready || running || !isCurrent()) return;
    running = true; publish();
    try {
      if (locks?.request) await locks.request(`world-explorer:condition:${uid}`, dispatch);
      else await dispatch(); // The backend still arbitrates revision and idempotency.
    } catch (e) {
      if (!disposed && isCurrent()) { attempts++; error = e.message; onError(e); }
    } finally {
      running = false;
      if (!disposed && isCurrent()) {
        publish();
        if (pendingWrite || record.pending || record.operation) schedule(error ? Math.min(30000, 500 * 2 ** Math.min(attempts, 6)) : 0);
      }
    }
  }

  return Object.freeze({ snapshot, flush,
    whenInitialized: () => initializedTask,
    whenDurable: () => localWork,
    queue(change) {
      if (disposed || !isCurrent() || !Number.isFinite(change.after) || change.after < 0 || change.after > 1) return false;
      const accepted = { sequence: ++sequence, value: { condition: change.after, reason: String(change.reason || 'gameplay').slice(0, 80) } };
      pendingWrite = accepted; publish();
      void task(async () => {
        const next = await outbox.update(row => { row.pending = accepted.value; });
        if (pendingWrite?.sequence === accepted.sequence) pendingWrite = null;
        adopt(next); broadcast(); publish(); schedule();
      });
      return true;
    },
    accept(state) {
      if (disposed || !isCurrent()) return false;
      const incoming = Number(state?.revision) || 0;
      if (incoming < revision) {
        ready = true; publish(); confirm(); schedule(); return false;
      }
      revision = Math.max(revision, incoming); ready = true;
      observed = state ? { condition: Number(state.condition), revision: incoming } : null;
      const mayHydrate = initialized && !pendingWrite && !record.pending && !record.operation && !running;
      publish(); schedule(); return mayHydrate;
    },
    retry() { attempts = 0; error = ''; schedule(0); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null; channel?.close();
      lifecycle?.clearInterval(poll);
      lifecycle?.removeEventListener('focus', refresh);
      lifecycle?.document?.removeEventListener('visibilitychange', refresh);
      // Accepted transactions finish; disposal never writes an old snapshot.
    }
  });
}
