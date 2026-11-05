// A short lease on the one current city, not a second world cache. The world
// owner still releases all geometry; timers cannot retire a newer publication.
export function createTitleReturnLease({
  read,
  release,
  schedule = setTimeout,
  cancel = clearTimeout,
  duration = 45000,
  now = Date.now,
}) {
  let lease = null;
  function clear() {
    if (lease) cancel(lease.timer);
    lease = null;
  }
  function retain() {
    clear();
    const state = read();
    if (!state.ready || !state.publication || state.liveGps) return false;
    const ticket = {
      publication: state.publication,
      signature: state.signature,
      expiresAt: now() + duration,
    };
    lease = ticket;
    ticket.timer = schedule(() => {
      if (lease !== ticket) return;
      lease = null;
      const current = read();
      if (!current.started && !current.loading && current.publication === ticket.publication)
        release();
    }, duration);
    return true;
  }
  function claim() {
    const state = read(),
      ticket = lease;
    // Active globe selection can also keep the current publication. Main-menu
    // return additionally requires the bounded lease above.
    const allowed =
      state.ready &&
      !state.liveGps &&
      !!state.publication &&
      state.signature === state.publishedSignature &&
      (state.started ||
        (ticket?.publication === state.publication &&
          ticket.signature === state.signature &&
          now() <= ticket.expiresAt));
    clear();
    return !!allowed;
  }
  return Object.freeze({ retain, claim, clear });
}
