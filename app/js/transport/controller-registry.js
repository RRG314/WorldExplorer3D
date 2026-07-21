function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function controllerSnapshot(record) {
  return {
    id: record.id,
    priority: record.priority,
    updates: record.updates,
    failures: record.failures,
    lastDurationMs: Number(record.lastDurationMs.toFixed(3)),
    lastError: record.lastError
  };
}

function createTransportControllerRegistry(options = {}) {
  const controllers = new Map();
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const onConflict = typeof options.onConflict === 'function' ? options.onConflict : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  let registrationOrder = 0;
  let activeId = null;
  let transitions = 0;
  let conflicts = 0;
  let lastConflictSignature = '';

  function orderedControllers() {
    return [...controllers.values()].sort((left, right) => (
      left.priority - right.priority || left.registrationOrder - right.registrationOrder
    ));
  }

  function registerController(definition = {}) {
    const id = String(definition.id || '').trim();
    if (!id) throw new TypeError('Transport controllers require a stable id.');
    if (controllers.has(id)) throw new Error(`Transport controller already registered: ${id}`);
    if (typeof definition.isActive !== 'function' || typeof definition.update !== 'function') {
      throw new TypeError(`Transport controller ${id} requires isActive and update functions.`);
    }
    const record = {
      id,
      priority: finiteNumber(definition.priority, 100),
      isActive: definition.isActive,
      update: definition.update,
      registrationOrder: registrationOrder++,
      updates: 0,
      failures: 0,
      lastDurationMs: 0,
      lastError: ''
    };
    controllers.set(id, record);
    return () => controllers.delete(id);
  }

  function activeCandidates(context) {
    return orderedControllers().filter((controller) => {
      try {
        return controller.isActive(context) === true;
      } catch (error) {
        controller.failures++;
        controller.lastError = error instanceof Error ? error.message : String(error);
        onError?.({ controller: controllerSnapshot(controller), error, stage: 'isActive' });
        return false;
      }
    });
  }

  function update(dt, context = {}) {
    const candidates = activeCandidates(context);
    const selected = candidates[0] || null;
    const nextActiveId = selected?.id || null;
    if (nextActiveId !== activeId) {
      activeId = nextActiveId;
      transitions++;
    }

    if (candidates.length > 1) {
      const signature = candidates.map((candidate) => candidate.id).join('|');
      if (signature !== lastConflictSignature) {
        conflicts++;
        lastConflictSignature = signature;
        onConflict?.({ activeId, candidates: candidates.map((candidate) => candidate.id) });
      }
    } else {
      lastConflictSignature = '';
    }

    if (!selected) return false;
    const startedAt = now();
    try {
      selected.update(Math.max(0, finiteNumber(dt, 0)), context);
      selected.updates++;
      selected.lastDurationMs = Math.max(0, now() - startedAt);
      return true;
    } catch (error) {
      selected.failures++;
      selected.lastError = error instanceof Error ? error.message : String(error);
      onError?.({ controller: controllerSnapshot(selected), error, stage: 'update' });
      throw error;
    }
  }

  function snapshot(context = {}) {
    return {
      activeId,
      activeCandidates: activeCandidates(context).map((controller) => controller.id),
      transitions,
      conflicts,
      controllers: orderedControllers().map(controllerSnapshot)
    };
  }

  return Object.freeze({ registerController, snapshot, update });
}

export { createTransportControllerRegistry };
