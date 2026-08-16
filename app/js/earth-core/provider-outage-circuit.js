class ProviderUnavailableError extends Error {
  constructor(provider, reason, retryAt) {
    super(`${provider} unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
    this.code = 'provider_unavailable';
    this.provider = provider;
    this.reason = reason;
    this.retryAt = retryAt;
  }
}

function createProviderOutageCircuit(options = {}) {
  const provider = String(options.provider || 'provider');
  const cooldownMs = Math.max(1000, Number(options.cooldownMs) || 60_000);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const activeControllers = new Set();
  let unavailableUntil = 0;
  let lastReason = '';
  let trips = 0;
  let abortedSiblingRequests = 0;

  const isOpen = () => unavailableUntil > now();

  function unavailableError(reason = lastReason || 'temporary provider outage') {
    return new ProviderUnavailableError(provider, reason, unavailableUntil);
  }

  function assertAvailable() {
    if (isOpen()) throw unavailableError();
    if (unavailableUntil !== 0) {
      unavailableUntil = 0;
      lastReason = '';
    }
  }

  function track(controller) {
    assertAvailable();
    if (!controller?.abort) return () => {};
    activeControllers.add(controller);
    return () => activeControllers.delete(controller);
  }

  function trip(reason = 'temporary provider outage', originController = null) {
    lastReason = String(reason || 'temporary provider outage');
    unavailableUntil = now() + cooldownMs;
    trips += 1;
    const error = unavailableError(lastReason);
    for (const controller of [...activeControllers]) {
      if (controller === originController) continue;
      activeControllers.delete(controller);
      if (!controller.signal?.aborted) {
        abortedSiblingRequests += 1;
        controller.abort(error);
      }
    }
    return error;
  }

  function snapshot() {
    return Object.freeze({
      provider,
      open: isOpen(),
      unavailableUntil,
      reason: isOpen() ? lastReason : '',
      activeRequests: activeControllers.size,
      trips,
      abortedSiblingRequests
    });
  }

  function reset() {
    unavailableUntil = 0;
    lastReason = '';
  }

  return Object.freeze({
    assertAvailable,
    isOpen,
    reset,
    snapshot,
    track,
    trip,
    unavailableError
  });
}

export { createProviderOutageCircuit, ProviderUnavailableError };
