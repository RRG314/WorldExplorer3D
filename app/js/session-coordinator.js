import { ctx as appCtx } from './shared-context.js?v=55';
import { ENV, getEnv, switchEnv } from './env.js?v=57';
import { createAppRuntime } from './runtime/app-runtime.js';
import { createDestinationScheduler } from './runtime/destination-schedulers.js';

const validEnvironments = new Set(Object.values(ENV));

const runtime = createAppRuntime({
  getDestination: getEnv,
  isDestinationValid: (environment) => validEnvironments.has(environment),
  commitDestination: ({ target }) => getEnv() === target || switchEnv(target),
  createScheduler: createDestinationScheduler,
  onEvent(event) {
    globalThis.dispatchEvent?.(new CustomEvent('we3d:app-runtime', { detail: event }));
  }
});

function withLegacyContext(adapter) {
  const wrap = (method) => typeof adapter[method] === 'function'
    ? (context) => adapter[method]({ appCtx, ...context })
    : undefined;
  return Object.freeze({
    enter: wrap('enter'),
    exit: wrap('exit'),
    exitSync: wrap('exitSync'),
    prepare: wrap('prepare'),
    snapshot: typeof adapter.snapshot === 'function' ? () => adapter.snapshot() : undefined
  });
}

function beginEnvironmentTransition(target, options = {}) {
  return runtime.beginTransition(target, options);
}

function isEnvironmentTransitionCurrent(token) {
  return runtime.isTransitionCurrent(token);
}

function finishEnvironmentTransition(token, reason = 'completed') {
  return runtime.finishTransition(token, reason);
}

function cancelEnvironmentTransition(token, reason = 'superseded') {
  return runtime.cancelTransition(token, reason);
}

function commitEnvironment(target, options = {}) {
  return runtime.commit(target, options);
}

function registerEnvironmentLifecycle(environment, adapter) {
  return runtime.registerDestination(environment, withLegacyContext(adapter));
}

function exitCurrentEnvironmentSync(target, options = {}) {
  return runtime.exitCurrentSync(target, options);
}

function transitionEnvironment(target, options = {}) {
  return runtime.transition(target, options);
}

function getSessionCoordinatorDebugState() {
  const snapshot = runtime.snapshot();
  return {
    environment: snapshot.destination,
    registeredEnvironments: snapshot.registeredDestinations,
    environments: snapshot.destinations,
    activeSession: snapshot.activeSession,
    transition: snapshot.transition
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
