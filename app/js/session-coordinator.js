import { ctx as appCtx } from './shared-context.js?v=55';
import { ENV, getEnv, switchEnv } from './env.js?v=57';
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';

const environmentAdapters = new Map();
let transitionSequence = 0;
let activeTransition = null;

function validEnvironment(environment) {
  return Object.values(ENV).includes(environment);
}

function isEnvironmentTransitionCurrent(token) {
  return !!token && activeTransition === token && token.scope.isActive();
}

function finishEnvironmentTransition(token, reason = 'completed') {
  if (!isEnvironmentTransitionCurrent(token)) return false;
  token.finishedAt = performance.now();
  token.finishReason = reason;
  token.scope.dispose(reason);
  activeTransition = null;
  return true;
}

function cancelEnvironmentTransition(token = activeTransition, reason = 'superseded') {
  if (!token || !token.scope.isActive()) return false;
  token.cancelledAt = performance.now();
  token.cancelReason = reason;
  token.abortController.abort(reason);
  token.scope.dispose(reason);
  if (activeTransition === token) activeTransition = null;
  return true;
}

function beginEnvironmentTransition(target, options = {}) {
  if (!validEnvironment(target)) throw new Error(`Unknown environment: ${target}`);
  if (activeTransition) cancelEnvironmentTransition(activeTransition, 'superseded');
  const id = ++transitionSequence;
  const source = String(options.source || 'runtime');
  const scope = createLifecycleScope(`environment-transition:${id}:${source}`);
  const abortController = new AbortController();
  const token = {
    id,
    source,
    from: getEnv(),
    target,
    startedAt: performance.now(),
    committedAt: null,
    finishedAt: null,
    finishReason: '',
    cancelReason: '',
    abortController,
    signal: abortController.signal,
    scope,
    metadata: options.metadata && typeof options.metadata === 'object' ? { ...options.metadata } : {}
  };
  activeTransition = token;
  return token;
}

function commitEnvironment(target, options = {}) {
  if (!validEnvironment(target)) return false;
  let token = options.token || null;
  if (token && (!isEnvironmentTransitionCurrent(token) || token.target !== target)) return false;
  if (!token) {
    token = activeTransition?.target === target
      ? activeTransition
      : beginEnvironmentTransition(target, { source: options.source });
  }

  const committed = getEnv() === target || switchEnv(target);
  if (!committed) {
    cancelEnvironmentTransition(token, 'commit-rejected');
    return false;
  }
  token.committedAt = performance.now();
  if (options.finish !== false) finishEnvironmentTransition(token);
  return true;
}

function registerEnvironmentLifecycle(environment, adapter) {
  if (!validEnvironment(environment)) throw new Error(`Unknown environment: ${environment}`);
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Environment lifecycle adapter must be an object.');
  environmentAdapters.set(environment, adapter);
  return () => {
    if (environmentAdapters.get(environment) === adapter) environmentAdapters.delete(environment);
  };
}

function exitCurrentEnvironmentSync(target, options = {}) {
  if (!validEnvironment(target)) throw new Error(`Unknown environment: ${target}`);
  const from = getEnv();
  if (!from || from === target) return false;
  const adapter = environmentAdapters.get(from);
  if (typeof adapter?.exitSync !== 'function') return false;
  adapter.exitSync({
    appCtx,
    from,
    target,
    source: String(options.source || 'runtime')
  });
  return true;
}

async function transitionEnvironment(target, options = {}) {
  const token = beginEnvironmentTransition(target, options);
  const fromAdapter = environmentAdapters.get(token.from);
  const targetAdapter = environmentAdapters.get(target);
  const context = { appCtx, signal: token.signal, scope: token.scope, token };
  try {
    if (typeof fromAdapter?.exit === 'function') await fromAdapter.exit(context);
    else if (typeof fromAdapter?.exitSync === 'function') fromAdapter.exitSync(context);
    if (!isEnvironmentTransitionCurrent(token)) return false;
    await targetAdapter?.prepare?.(context);
    if (!isEnvironmentTransitionCurrent(token)) return false;
    if (!commitEnvironment(target, { token, finish: false })) return false;
    await targetAdapter?.enter?.(context);
    if (!isEnvironmentTransitionCurrent(token)) return false;
    finishEnvironmentTransition(token);
    return true;
  } catch (error) {
    cancelEnvironmentTransition(token, 'failed');
    throw error;
  }
}

function getSessionCoordinatorDebugState() {
  const environments = {};
  environmentAdapters.forEach((adapter, environment) => {
    try {
      environments[environment] = typeof adapter.snapshot === 'function'
        ? adapter.snapshot()
        : { registered: true };
    } catch (error) {
      environments[environment] = {
        registered: true,
        snapshotError: error instanceof Error ? error.message : String(error)
      };
    }
  });
  return {
    environment: getEnv(),
    registeredEnvironments: [...environmentAdapters.keys()],
    environments,
    transition: activeTransition ? {
      id: activeTransition.id,
      source: activeTransition.source,
      from: activeTransition.from,
      target: activeTransition.target,
      committed: Number.isFinite(activeTransition.committedAt),
      scope: activeTransition.scope.snapshot()
    } : null
  };
}

Object.assign(appCtx, {
  beginEnvironmentTransition,
  cancelEnvironmentTransition,
  commitEnvironment,
  exitCurrentEnvironmentSync,
  finishEnvironmentTransition,
  getSessionCoordinatorDebugState,
  isEnvironmentTransitionCurrent,
  registerEnvironmentLifecycle,
  transitionEnvironment
});

export {
  beginEnvironmentTransition,
  cancelEnvironmentTransition,
  commitEnvironment,
  exitCurrentEnvironmentSync,
  finishEnvironmentTransition,
  getSessionCoordinatorDebugState,
  isEnvironmentTransitionCurrent,
  registerEnvironmentLifecycle,
  transitionEnvironment
};
