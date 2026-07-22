const DEFAULT_RUNTIME_BUDGETS = Object.freeze({
  frameMs: 33.3,
  drawCalls: 900,
  triangles: 3000000,
  geometries: 1500,
  textures: 512,
  heapBytes: 1000 * 1024 * 1024,
  loadMs: 60000,
  renderReadyMs: 9000,
  pendingGeometryDisposals: 192
});

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function topRuntimeOwner(kernel) {
  const owners = Object.entries(kernel?.owners || {});
  if (owners.length === 0) return null;
  owners.sort((left, right) => (
    finite(right[1]?.smoothedDurationMs) - finite(left[1]?.smoothedDurationMs)
  ));
  const [owner, metrics] = owners[0];
  return {
    owner,
    smoothedDurationMs: finite(metrics?.smoothedDurationMs) || 0,
    maxDurationMs: finite(metrics?.maxDurationMs) || 0,
    systems: Array.isArray(metrics?.systems) ? [...metrics.systems] : []
  };
}

function topRuntimeSystem(kernel) {
  const systems = Object.values(kernel?.phases || {}).flat().filter(Boolean);
  if (systems.length === 0) return null;
  systems.sort((left, right) => (
    (finite(right?.smoothedDurationMs) || 0) - (finite(left?.smoothedDurationMs) || 0)
  ));
  const system = systems[0];
  return {
    id: system.id,
    owner: system.owner,
    phase: system.phase,
    smoothedDurationMs: finite(system.smoothedDurationMs) || 0,
    maxDurationMs: finite(system.maxDurationMs) || 0
  };
}

function createViolation({ budget, metric, owner, value, detail = null }) {
  return { metric, owner, value, budget, detail };
}

function diagnoseRuntimeBudgets(snapshot = {}, options = {}) {
  const budgets = { ...DEFAULT_RUNTIME_BUDGETS, ...(options.budgets || {}) };
  const violations = [];
  const renderer = snapshot.renderer || {};
  const kernel = snapshot.runtimeKernel || {};
  const memory = snapshot.browserMemory || {};
  const streaming = snapshot.streamingResources || {};
  const lastLoad = snapshot.lastLoad || null;
  const renderReadiness = snapshot.renderReadiness || null;
  const topOwner = topRuntimeOwner(kernel);
  const topSystem = topRuntimeSystem(kernel);

  const frameMs = finite(kernel.lastFrameDurationMs);
  if (frameMs !== null && frameMs > budgets.frameMs) {
    violations.push(createViolation({
      metric: 'frameMs',
      owner: topOwner?.owner || 'runtime-kernel',
      value: frameMs,
      budget: budgets.frameMs,
      detail: { topOwner, topSystem }
    }));
  }
  const rendererChecks = [
    ['calls', 'drawCalls', 'world-rendering'],
    ['triangles', 'triangles', 'world-rendering'],
    ['geometries', 'geometries', 'resource-lifecycle'],
    ['textures', 'textures', 'resource-lifecycle']
  ];
  rendererChecks.forEach(([field, budgetKey, owner]) => {
    const value = finite(renderer[field]);
    if (value !== null && value > budgets[budgetKey]) {
      violations.push(createViolation({ metric: field, owner, value, budget: budgets[budgetKey] }));
    }
  });
  const heapBytes = finite(memory.usedBytes);
  if (heapBytes !== null && heapBytes > budgets.heapBytes) {
    violations.push(createViolation({
      metric: 'heapBytes', owner: 'resource-lifecycle', value: heapBytes, budget: budgets.heapBytes
    }));
  }
  const pendingDisposals = finite(streaming.pendingGeometryDisposals);
  if (pendingDisposals !== null && pendingDisposals > budgets.pendingGeometryDisposals) {
    violations.push(createViolation({
      metric: 'pendingGeometryDisposals',
      owner: 'earth-streaming',
      value: pendingDisposals,
      budget: budgets.pendingGeometryDisposals
    }));
  }
  const loadMs = finite(lastLoad?.loadMs);
  if (loadMs !== null && loadMs > budgets.loadMs) {
    violations.push(createViolation({ metric: 'loadMs', owner: 'world-loading', value: loadMs, budget: budgets.loadMs }));
  }
  const renderReadyMs = finite(renderReadiness?.durationMs);
  if (renderReadyMs !== null && renderReadyMs > budgets.renderReadyMs) {
    violations.push(createViolation({
      metric: 'renderReadyMs', owner: 'renderer-readiness', value: renderReadyMs, budget: budgets.renderReadyMs
    }));
  }

  return { ok: violations.length === 0, budgets, topRuntimeOwner: topOwner, topRuntimeSystem: topSystem, violations };
}

export { DEFAULT_RUNTIME_BUDGETS, diagnoseRuntimeBudgets };
