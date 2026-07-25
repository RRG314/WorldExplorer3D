import { createTileAddress } from './world-tile-contract.js';

class TileCoordinatorClosedError extends Error {
  constructor() {
    super('TileCoordinator is closed.');
    this.name = 'TileCoordinatorClosedError';
  }
}

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function abortError() {
  const error = new Error('Tile request was aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function waitWithSignal(delay, signal) {
  if (!(delay > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function createTileCoordinator(options = {}) {
  invariant(typeof options.load === 'function', 'TileCoordinator requires a load function.');
  invariant(typeof options.compile === 'function', 'TileCoordinator requires a compile function.');
  invariant(typeof options.commit === 'function', 'TileCoordinator requires a commit function.');
  invariant(typeof options.retire === 'function', 'TileCoordinator requires a retire function.');

  const maxConcurrent = Math.max(1, Math.floor(Number(options.maxConcurrent) || 2));
  const maxQueue = Math.max(maxConcurrent, Math.floor(Number(options.maxQueue) || 96));
  const retryCount = Math.max(0, Math.floor(Number(options.retryCount) || 0));
  const retryDelay = typeof options.retryDelay === 'function'
    ? options.retryDelay
    : (attempt) => Math.min(2000, 150 * 2 ** Math.max(0, attempt - 1));
  const sleep = typeof options.sleep === 'function' ? options.sleep : waitWithSignal;
  const sourceIdentity = String(options.sourceIdentity || 'openstreetmap/shortbread-v1/live').trim();
  invariant(sourceIdentity.length > 0, 'TileCoordinator source identity is required.');

  let generation = 0;
  let sequence = 0;
  let running = 0;
  let closed = false;
  const queue = [];
  const pending = new Map();
  const active = new Map();
  const counters = {
    requested: 0,
    deduplicated: 0,
    committed: 0,
    cacheHits: 0,
    failed: 0,
    stale: 0,
    aborted: 0,
    dropped: 0,
    retried: 0,
    retired: 0,
    disposedCandidates: 0
  };

  function cacheKey(address) {
    return `${sourceIdentity}:${address.key}`;
  }

  function settle(entry, result) {
    if (entry.settled) return;
    entry.settled = true;
    pending.delete(entry.pendingKey);
    entry.resolve(result);
  }

  async function disposeCandidate(candidate, reason) {
    if (!candidate || typeof options.disposeCandidate !== 'function') return;
    await options.disposeCandidate(candidate, reason);
    counters.disposedCandidates += 1;
  }

  async function retireActive(entry, reason) {
    if (!entry) return;
    await options.retire(entry.ownership, {
      tile: entry.tile,
      address: entry.address,
      generation: entry.generation,
      reason
    });
    counters.retired += 1;
  }

  function staleResult(entry, reason = 'superseded') {
    counters.stale += 1;
    return {
      status: 'stale',
      key: entry.address.key,
      generation: entry.generation,
      reason
    };
  }

  async function runEntry(entry) {
    running += 1;
    entry.controller = new AbortController();
    let candidate = null;
    let committedOwnership = null;
    try {
      let raw = null;
      let lastError = null;
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        if (entry.generation !== generation || entry.controller.signal.aborted) throw abortError();
        try {
          raw = await options.load({
            address: entry.address,
            cacheKey: entry.cacheKey,
            generation: entry.generation,
            signal: entry.controller.signal,
            attempt
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (isAbortError(error) || entry.controller.signal.aborted || attempt >= retryCount) throw error;
          counters.retried += 1;
          await sleep(retryDelay(attempt + 1), entry.controller.signal);
        }
      }
      if (lastError) throw lastError;
      if (entry.generation !== generation || entry.controller.signal.aborted) throw abortError();

      candidate = await options.compile({
        raw,
        address: entry.address,
        cacheKey: entry.cacheKey,
        generation: entry.generation,
        signal: entry.controller.signal
      });
      if (entry.generation !== generation || entry.controller.signal.aborted) {
        await disposeCandidate(candidate, 'stale-before-commit');
        candidate = null;
        settle(entry, staleResult(entry));
        return;
      }

      const previous = active.get(entry.address.key) || null;
      committedOwnership = await options.commit(candidate, {
        address: entry.address,
        cacheKey: entry.cacheKey,
        generation: entry.generation,
        previous,
        signal: entry.controller.signal,
        isCurrent: () => !closed && entry.generation === generation && !entry.controller.signal.aborted
      });
      if (entry.generation !== generation || entry.controller.signal.aborted) {
        await retireActive({
          ownership: committedOwnership,
          tile: candidate,
          address: entry.address,
          generation: entry.generation
        }, 'stale-after-commit');
        committedOwnership = null;
        candidate = null;
        settle(entry, staleResult(entry));
        return;
      }

      const committed = {
        address: entry.address,
        cacheKey: entry.cacheKey,
        generation: entry.generation,
        tile: candidate,
        ownership: committedOwnership
      };
      active.set(entry.address.key, committed);
      committedOwnership = null;
      candidate = null;
      counters.committed += 1;
      if (previous) await retireActive(previous, 'replaced');
      settle(entry, {
        status: 'committed',
        key: entry.address.key,
        generation: entry.generation,
        tile: committed.tile,
        ownership: committed.ownership
      });
    } catch (error) {
      if (candidate) await disposeCandidate(candidate, 'commit-failed');
      if (isAbortError(error) || entry.controller.signal.aborted || entry.generation !== generation) {
        counters.aborted += 1;
        settle(entry, staleResult(entry, closed ? 'closed' : 'superseded'));
      } else {
        counters.failed += 1;
        settle(entry, {
          status: 'failed',
          key: entry.address.key,
          generation: entry.generation,
          error
        });
      }
    } finally {
      running -= 1;
      pump();
    }
  }

  function pump() {
    if (closed) return;
    while (running < maxConcurrent && queue.length > 0) {
      const entry = queue.shift();
      if (entry.generation !== generation) {
        settle(entry, staleResult(entry));
        continue;
      }
      void runEntry(entry);
    }
  }

  function request(addressInput, requestOptions = {}) {
    if (closed) return Promise.reject(new TileCoordinatorClosedError());
    const address = createTileAddress(addressInput);
    const requestGeneration = Number(requestOptions.generation ?? generation);
    invariant(Number.isSafeInteger(requestGeneration) && requestGeneration >= 0, 'Tile request generation is invalid.');
    if (requestGeneration !== generation) {
      counters.stale += 1;
      return Promise.resolve({
        status: 'stale',
        key: address.key,
        generation: requestGeneration,
        reason: 'generation-mismatch'
      });
    }

    const current = active.get(address.key);
    if (current?.generation === requestGeneration && requestOptions.refresh !== true) {
      counters.cacheHits += 1;
      return Promise.resolve({
        status: 'active',
        key: address.key,
        generation: requestGeneration,
        tile: current.tile,
        ownership: current.ownership
      });
    }

    const pendingKey = `${requestGeneration}:${address.key}`;
    const existing = pending.get(pendingKey);
    if (existing) {
      counters.deduplicated += 1;
      return existing.promise;
    }
    counters.requested += 1;
    if (queue.length + running >= maxQueue) {
      counters.dropped += 1;
      return Promise.resolve({
        status: 'dropped',
        key: address.key,
        generation: requestGeneration,
        reason: 'queue-capacity'
      });
    }

    let resolve;
    const promise = new Promise((settlePromise) => {
      resolve = settlePromise;
    });
    const entry = {
      address,
      cacheKey: cacheKey(address),
      generation: requestGeneration,
      pendingKey,
      priority: Number(requestOptions.priority) || 0,
      sequence: sequence++,
      promise,
      resolve,
      settled: false,
      controller: null
    };
    pending.set(pendingKey, entry);
    queue.push(entry);
    queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    pump();
    return promise;
  }

  function beginGeneration(nextGeneration = generation + 1) {
    if (closed) throw new TileCoordinatorClosedError();
    const value = Number(nextGeneration);
    invariant(Number.isSafeInteger(value) && value > generation, 'Tile generation must increase monotonically.');
    generation = value;
    for (const entry of pending.values()) {
      if (entry.generation === generation) continue;
      entry.controller?.abort();
      if (!entry.controller) settle(entry, staleResult(entry));
    }
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].settled) queue.splice(index, 1);
    }
    pump();
    return generation;
  }

  async function reconcile(addresses, reconcileOptions = {}) {
    if (closed) throw new TileCoordinatorClosedError();
    const reconcileGeneration = Number(reconcileOptions.generation ?? generation);
    invariant(reconcileGeneration === generation, 'Tile reconciliation must target the current generation.');
    const desired = new Map(
      (addresses || []).map((address) => {
        const normalized = createTileAddress(address);
        return [normalized.key, normalized];
      })
    );
    const results = await Promise.all(
      [...desired.values()].map((address, index) => request(address, {
        generation: reconcileGeneration,
        priority: Number(reconcileOptions.priority) || -index
      }))
    );
    if (reconcileGeneration !== generation || closed) return results;
    const retirements = [];
    for (const [key, entry] of active) {
      if (desired.has(key)) continue;
      active.delete(key);
      retirements.push(retireActive(entry, 'outside-desired-set'));
    }
    await Promise.all(retirements);
    return results;
  }

  async function close() {
    if (closed) return;
    closed = true;
    const pendingPromises = [...pending.values()].map((entry) => entry.promise);
    for (const entry of pending.values()) {
      entry.controller?.abort();
      if (!entry.controller) settle(entry, staleResult(entry, 'closed'));
    }
    queue.length = 0;
    await Promise.allSettled(pendingPromises);
    const retirements = [...active.values()].map((entry) => retireActive(entry, 'coordinator-closed'));
    active.clear();
    await Promise.all(retirements);
  }

  function snapshot() {
    return {
      generation,
      sourceIdentity,
      closed,
      running,
      queued: queue.filter((entry) => !entry.settled).length,
      pending: pending.size,
      active: active.size,
      activeKeys: [...active.keys()].sort(),
      activeEntries: [...active.values()]
        .map((entry) => ({
          key: entry.address.key,
          generation: entry.generation,
          cacheKey: entry.cacheKey
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
      limits: {
        maxConcurrent,
        maxQueue,
        retryCount
      },
      counters: { ...counters }
    };
  }

  return Object.freeze({
    beginGeneration,
    close,
    reconcile,
    request,
    snapshot
  });
}

export { TileCoordinatorClosedError, createTileCoordinator };
