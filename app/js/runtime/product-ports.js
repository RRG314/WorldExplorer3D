const PRODUCT_PORT_METHODS = Object.freeze({
  shell: Object.freeze([
    'publishRuntimeEvent',
    'reportRuntimeError',
    'setRuntimeReady'
  ]),
  input: Object.freeze([
    'snapshot',
    'update'
  ]),
  persistence: Object.freeze([
    'capture',
    'restore',
    'snapshot'
  ]),
  multiplayer: Object.freeze([
    'ensureReady',
    'snapshot'
  ])
});

function createProductPorts() {
  const records = new Map(Object.keys(PRODUCT_PORT_METHODS).map((name) => [
    name,
    {
      name,
      adapter: null,
      revision: 0,
      calls: 0,
      misses: 0,
      failures: 0,
      lastError: ''
    }
  ]));

  function requireRecord(name) {
    const record = records.get(String(name || ''));
    if (!record) throw new Error(`Unknown product port: ${name}`);
    return record;
  }

  function bind(name, adapter) {
    const record = requireRecord(name);
    if (!adapter || typeof adapter !== 'object') {
      throw new TypeError(`Product port ${record.name} requires an adapter object.`);
    }
    const missing = PRODUCT_PORT_METHODS[record.name]
      .filter((method) => typeof adapter[method] !== 'function');
    if (missing.length > 0) {
      throw new TypeError(
        `Product port ${record.name} is missing: ${missing.join(', ')}`
      );
    }
    record.revision++;
    const revision = record.revision;
    record.adapter = Object.freeze({ ...adapter });
    record.lastError = '';
    return () => {
      if (record.revision !== revision || record.adapter == null) return false;
      record.adapter = null;
      record.revision++;
      return true;
    };
  }

  function invoke(record, method, args, optional) {
    const handler = record.adapter?.[method];
    if (typeof handler !== 'function') {
      record.misses++;
      if (optional) return undefined;
      throw new Error(`Product port ${record.name}.${method} is unavailable.`);
    }
    record.calls++;
    try {
      return handler(...args);
    } catch (error) {
      record.failures++;
      record.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  function call(name, method, ...args) {
    const record = requireRecord(name);
    if (!PRODUCT_PORT_METHODS[record.name].includes(method)) {
      throw new Error(`Unknown product port method: ${record.name}.${method}`);
    }
    return invoke(record, method, args, false);
  }

  function tryCall(name, method, ...args) {
    const record = requireRecord(name);
    if (!PRODUCT_PORT_METHODS[record.name].includes(method)) {
      throw new Error(`Unknown product port method: ${record.name}.${method}`);
    }
    return invoke(record, method, args, true);
  }

  function snapshot() {
    return {
      ports: [...records.values()].map((record) => ({
        name: record.name,
        bound: record.adapter != null,
        methods: [...PRODUCT_PORT_METHODS[record.name]],
        revision: record.revision,
        calls: record.calls,
        misses: record.misses,
        failures: record.failures,
        lastError: record.lastError
      }))
    };
  }

  return Object.freeze({
    bind,
    call,
    snapshot,
    tryCall
  });
}

export { PRODUCT_PORT_METHODS, createProductPorts };
