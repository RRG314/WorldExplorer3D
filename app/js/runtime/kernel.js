const RUNTIME_PHASES = Object.freeze([
  'input',
  'simulation',
  'world',
  'camera',
  'presentation',
  'render'
]);

const phaseOrder = new Map(RUNTIME_PHASES.map((phase, index) => [phase, index]));

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function systemSnapshot(record) {
  return {
    id: record.id,
    owner: record.owner,
    phase: record.phase,
    priority: record.priority,
    enabled: record.enabled !== false,
    critical: record.critical,
    updates: record.updates,
    fixedUpdates: record.fixedUpdates,
    failures: record.failures,
    lastDurationMs: Number(record.lastDurationMs.toFixed(3)),
    smoothedDurationMs: Number(record.smoothedDurationMs.toFixed(3)),
    maxDurationMs: Number(record.maxDurationMs.toFixed(3)),
    lastError: record.lastError
  };
}

function createRuntimeKernel(options = {}) {
  const systems = new Map();
  const fixedDelta = Math.max(1 / 240, finiteNumber(options.fixedDelta, 1 / 60));
  const maxDelta = Math.max(fixedDelta, finiteNumber(options.maxDelta, 0.1));
  const maxFixedSteps = Math.max(1, Math.floor(finiteNumber(options.maxFixedSteps, 5)));
  const requestFrame = options.requestFrame || globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = options.cancelFrame || globalThis.cancelAnimationFrame?.bind(globalThis);
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const getContext = typeof options.getContext === 'function' ? options.getContext : () => ({});
  const isSuspended = typeof options.isSuspended === 'function' ? options.isSuspended : () => false;
  const onSuspendedFrame = typeof options.onSuspendedFrame === 'function' ? options.onSuspendedFrame : null;
  const onSystemError = typeof options.onSystemError === 'function' ? options.onSystemError : null;

  let orderedSystems = [];
  let registrationOrder = 0;
  let running = false;
  let disposed = false;
  let frameHandle = null;
  let previousTimestamp = null;
  let accumulator = 0;
  let frameNumber = 0;
  let suspendedFrames = 0;
  let lastFrameDurationMs = 0;
  let stopReason = '';

  function refreshOrder() {
    orderedSystems = [...systems.values()].sort((left, right) => (
      phaseOrder.get(left.phase) - phaseOrder.get(right.phase) ||
      left.priority - right.priority ||
      left.registrationOrder - right.registrationOrder
    ));
  }

  function registerSystem(definition = {}) {
    if (disposed) throw new Error('Runtime kernel is disposed.');
    const id = String(definition.id || '').trim();
    if (!id) throw new TypeError('Runtime systems require a stable id.');
    if (systems.has(id)) throw new Error(`Runtime system already registered: ${id}`);
    const phase = String(definition.phase || 'simulation');
    if (!phaseOrder.has(phase)) throw new Error(`Unknown runtime phase: ${phase}`);
    if (typeof definition.update !== 'function' && typeof definition.fixedUpdate !== 'function') {
      throw new TypeError(`Runtime system ${id} requires update or fixedUpdate.`);
    }

    const record = {
      id,
      owner: String(definition.owner || 'core').trim() || 'core',
      phase,
      priority: finiteNumber(definition.priority, 0),
      critical: definition.critical !== false,
      enabled: definition.enabled ?? true,
      update: definition.update,
      fixedUpdate: definition.fixedUpdate,
      dispose: definition.dispose,
      registrationOrder: registrationOrder++,
      updates: 0,
      fixedUpdates: 0,
      failures: 0,
      lastDurationMs: 0,
      smoothedDurationMs: 0,
      maxDurationMs: 0,
      lastError: ''
    };
    systems.set(id, record);
    refreshOrder();
    return () => unregisterSystem(id);
  }

  function unregisterSystem(id) {
    const record = systems.get(String(id));
    if (!record) return false;
    systems.delete(record.id);
    refreshOrder();
    try {
      record.dispose?.();
    } catch (error) {
      console.warn(`[runtime] System disposal failed: ${record.id}`, error);
    }
    return true;
  }

  function unregisterOwner(owner) {
    const normalizedOwner = String(owner || '').trim();
    if (!normalizedOwner) return 0;
    const ownedIds = orderedSystems
      .filter((record) => record.owner === normalizedOwner)
      .map((record) => record.id);
    ownedIds.forEach(unregisterSystem);
    return ownedIds.length;
  }

  function systemEnabled(record, frame) {
    return typeof record.enabled === 'function' ? record.enabled(frame) !== false : record.enabled !== false;
  }

  function invokeSystem(record, method, frame) {
    if (!systemEnabled(record, frame) || typeof record[method] !== 'function') return;
    const startedAt = now();
    try {
      record[method](frame);
      if (method === 'fixedUpdate') record.fixedUpdates++;
      else record.updates++;
      record.lastDurationMs = Math.max(0, now() - startedAt);
      record.smoothedDurationMs = record.smoothedDurationMs <= 0
        ? record.lastDurationMs
        : record.smoothedDurationMs * 0.9 + record.lastDurationMs * 0.1;
      record.maxDurationMs = Math.max(record.maxDurationMs, record.lastDurationMs);
    } catch (error) {
      record.failures++;
      record.lastError = error instanceof Error ? error.message : String(error);
      onSystemError?.({ error, frame, system: systemSnapshot(record) });
      if (record.critical) stop(`critical-system:${record.id}`);
      else record.enabled = false;
      throw error;
    }
  }

  function runFrame(timestamp = now(), suppliedContext = {}) {
    if (disposed) return false;
    const frameStartedAt = now();
    const currentTimestamp = finiteNumber(timestamp, frameStartedAt);
    const rawDelta = previousTimestamp === null ? 0 : Math.max(0, (currentTimestamp - previousTimestamp) / 1000);
    previousTimestamp = currentTimestamp;

    const sharedContext = {
      ...getContext(),
      ...suppliedContext
    };
    if (isSuspended(sharedContext)) {
      accumulator = 0;
      suspendedFrames++;
      onSuspendedFrame?.({ timestamp: currentTimestamp, context: sharedContext });
      return false;
    }

    const dt = Math.min(rawDelta, maxDelta);
    accumulator = Math.min(accumulator + dt, fixedDelta * maxFixedSteps);
    frameNumber++;
    const frame = {
      ...sharedContext,
      timestamp: currentTimestamp,
      dt,
      fixedDelta,
      frameNumber,
      flags: Object.create(null),
      interpolation: 0
    };

    let fixedStep = 0;
    while (accumulator >= fixedDelta && fixedStep < maxFixedSteps) {
      fixedStep++;
      const fixedFrame = { ...frame, dt: fixedDelta, fixedStep };
      for (const record of orderedSystems) invokeSystem(record, 'fixedUpdate', fixedFrame);
      accumulator -= fixedDelta;
    }
    frame.interpolation = fixedDelta > 0 ? accumulator / fixedDelta : 0;

    for (const phase of RUNTIME_PHASES) {
      frame.phase = phase;
      for (const record of orderedSystems) {
        if (record.phase === phase) invokeSystem(record, 'update', frame);
      }
    }
    lastFrameDurationMs = Math.max(0, now() - frameStartedAt);
    return true;
  }

  function scheduleNextFrame() {
    if (!running || typeof requestFrame !== 'function') return;
    frameHandle = requestFrame((timestamp) => {
      frameHandle = null;
      try {
        runFrame(timestamp);
      } finally {
        scheduleNextFrame();
      }
    });
  }

  function start() {
    if (disposed || running) return false;
    if (typeof requestFrame !== 'function') throw new Error('requestAnimationFrame is unavailable.');
    running = true;
    stopReason = '';
    previousTimestamp = null;
    accumulator = 0;
    scheduleNextFrame();
    return true;
  }

  function stop(reason = 'stopped') {
    if (!running && frameHandle === null) return false;
    running = false;
    stopReason = String(reason || 'stopped');
    if (frameHandle !== null && typeof cancelFrame === 'function') cancelFrame(frameHandle);
    frameHandle = null;
    previousTimestamp = null;
    accumulator = 0;
    return true;
  }

  function dispose(reason = 'disposed') {
    if (disposed) return false;
    stop(reason);
    disposed = true;
    for (const id of [...systems.keys()]) unregisterSystem(id);
    return true;
  }

  function snapshot() {
    const records = orderedSystems.map(systemSnapshot);
    return {
      running,
      disposed,
      stopReason,
      frameNumber,
      suspendedFrames,
      fixedDelta,
      maxDelta,
      lastFrameDurationMs: Number(lastFrameDurationMs.toFixed(3)),
      owners: records.reduce((owners, record) => {
        const owner = owners[record.owner] || {
          systems: [],
          failures: 0,
          lastDurationMs: 0,
          smoothedDurationMs: 0,
          maxDurationMs: 0
        };
        owner.systems.push(record.id);
        owner.failures += record.failures;
        owner.lastDurationMs = Number((owner.lastDurationMs + record.lastDurationMs).toFixed(3));
        owner.smoothedDurationMs = Number((owner.smoothedDurationMs + record.smoothedDurationMs).toFixed(3));
        owner.maxDurationMs = Math.max(owner.maxDurationMs, record.maxDurationMs);
        owners[record.owner] = owner;
        return owners;
      }, {}),
      phases: Object.fromEntries(RUNTIME_PHASES.map((phase) => [
        phase,
        records.filter((record) => record.phase === phase)
      ]))
    };
  }

  return Object.freeze({
    dispose,
    registerSystem,
    runFrame,
    snapshot,
    start,
    stop,
    unregisterOwner,
    unregisterSystem
  });
}

export { RUNTIME_PHASES, createRuntimeKernel };
