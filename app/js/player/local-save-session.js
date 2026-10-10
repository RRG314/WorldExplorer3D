// One page owns local possessions writes. IndexedDB Journal transactions and
// connected property transactions retain their separate existing authorities.
const sessions = new WeakMap();
const alwaysWritable = Object.freeze({ ready: Promise.resolve(true), writable: () => true, status: () => 'ready' });
export function localSaveSession(storage) {
  if (typeof window === 'undefined') return alwaysWritable;
  try { if (storage !== window.localStorage) return alwaysWritable; } catch { return alwaysWritable; }
  if (sessions.has(storage)) return sessions.get(storage);
  let state = 'starting', release;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const session = Object.freeze({ ready, writable: () => state === 'ready', status: () => state,
    // Used by an owning page at explicit shutdown; never steal another tab's lock.
    dispose() { state = 'closed'; release?.(); } });
  sessions.set(storage, session);
  if (!navigator.locks?.request) { state = 'unavailable'; resolveReady(false); return session; }
  void navigator.locks.request('we3d:local-possessions-writer:v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) { state = 'another-tab'; resolveReady(false); return; }
    state = 'ready'; resolveReady(true);
    await new Promise(resolve => { release = resolve; });
  }).catch(() => { state = 'unavailable'; resolveReady(false); });
  return session;
}
