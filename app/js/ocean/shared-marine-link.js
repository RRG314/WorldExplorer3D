// The server grants leases in epoch milliseconds. Local wall-clock corrections
// must never grant or revoke a seat. Use an upper bound on server time for leases
// and a separate, delayed estimate for presentation.
export function createMarineClock(now = () => performance.now()) {
  let received = 0, server = 0, upper = Infinity, ready = false;
  return Object.freeze({
    observe(serverNowMs, sentAt) {
      if (!Number.isFinite(serverNowMs)) return;
      const at = now(), roundTrip = Math.max(0, at - sentAt);
      const previous = ready ? upper + Math.max(0, at - received) : 0;
      received = at; server = serverNowMs;
      upper = Math.max(previous, serverNowMs + roundTrip); ready = true;
    },
    leaseNow: () => ready ? upper + Math.max(0, now() - received) : Infinity,
    presentationNow: () => ready ? server + Math.max(0, now() - received) : 0
  });
}

// Discrete commands serialize; motion is sampled only when the wire is idle.
// A slow/uncertain acknowledgment suspends prediction and reconciles before
// movement resumes. Obsolete poses never accumulate behind a slow request.
export function createMarineLink({transport, state, onState, onFault, reconcile,
  now = () => performance.now(), identity = () => crypto.randomUUID(), intervalMs = 2500, stallMs = 1000}) {
  const clock = createMarineClock(now);
  let queue = Promise.resolve(), pending = 0, motionStarted = null;
  let finishedAt = -Infinity, fault = '', disposed = false;
  const blocked = () => !!fault || motionStarted !== null && now() - motionStarted >= stallMs;
  function send(type, extra = {}) {
    pending++;
    const work = queue.catch(() => {}).then(async () => {
      if (disposed || !transport.isCurrent()) throw Error('Room connection changed. Rejoin the voyage.');
      const current = state(), sentAt = now();
      const motion = type === 'pose' || type === 'heartbeat';
      if (motion) motionStarted = sentAt;
      const command = {type, ...extra, requestId: identity(), revision: current?.controlRevision || 0, deployment: current?.deployment || 0};
      try {
        const result = await transport.send(command);
        if (disposed || !transport.isCurrent()) return null;
        clock.observe(result.serverNowMs ?? result.state?.updatedAtMs, sentAt);
        onState(result.state);
        if (type === 'join' || motion && now() - sentAt >= stallMs) reconcile(result.state);
        fault = ''; onFault('');
        return result.state;
      } catch (error) {
        if (!disposed && transport.isCurrent()) { fault = error.message || 'Connection interrupted.'; onFault(fault); }
        throw error;
      } finally {
        if (motion) motionStarted = null;
        finishedAt = now();
      }
    }).finally(() => { pending--; });
    queue = work;
    return work;
  }
  return Object.freeze({clock, send, blocked,
    get recovering() { return !!fault; },
    get ready() { return !disposed && pending === 0 && now() - finishedAt >= intervalMs; },
    sample(type, read) {
      if (!this.ready || fault) return null;
      return send(type, read());
    },
    dispose() { disposed = true; },
    snapshot: () => ({pending, blocked: blocked(), recovering: !!fault})
  });
}
