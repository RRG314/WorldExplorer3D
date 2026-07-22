import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// env.js - Centralized Environment State Manager
// ============================================================================
// Single source of truth for which environment is active.
// Only ONE environment can be active at a time.
// session-coordinator.js owns transition requests and commits through switchEnv().
// This module only validates and records the final environment identity.
//
// Render layer order:
//   EARTH:        main renderLoop → update() → renderer.render(scene, camera)
//   SPACE_FLIGHT: animateSpaceFlight() → spaceFlight.renderer.render(...)
//   MOON:         main renderLoop → update() → renderer.render(scene, camera)
//   OCEAN:        animateOceanMode() → oceanMode.renderer.render(...)

const ENV = Object.freeze({
  EARTH: 'EARTH',
  SPACE_FLIGHT: 'SPACE_FLIGHT',
  MOON: 'MOON',
  MARS: 'MARS',
  OCEAN: 'OCEAN'
});

let _activeEnv = null; // null until first switchEnv
let _transitioning = false; // guard against re-entrant transitions
let _envDebugEl = null; // debug HUD element

// Valid transitions: which env can switch to which
const _validTransitions = {
  null: [ENV.EARTH, ENV.OCEAN],
  EARTH: [ENV.SPACE_FLIGHT, ENV.MOON, ENV.MARS, ENV.OCEAN],
  SPACE_FLIGHT: [ENV.EARTH, ENV.MOON, ENV.MARS, ENV.OCEAN],
  MOON: [ENV.SPACE_FLIGHT, ENV.EARTH, ENV.MARS, ENV.OCEAN],
  MARS: [ENV.SPACE_FLIGHT, ENV.EARTH, ENV.MOON],
  OCEAN: [ENV.EARTH, ENV.MOON, ENV.SPACE_FLIGHT]
};

function getEnv() {
  return _activeEnv;
}

function isEnv(env) {
  return _activeEnv === env;
}

function setEnvironmentTransitionActive(active) {
  appCtx.travelingToMoon = active === true;
  return appCtx.travelingToMoon;
}

function switchEnv(newEnv) {
  // Guard: no re-entrant transitions
  if (_transitioning) {
    console.warn('[ENV] Blocked switchEnv to', newEnv, '- transition in progress');
    return false;
  }

  // Guard: already there
  if (_activeEnv === newEnv) {
    console.warn('[ENV] Already in', newEnv);
    return false;
  }

  // Guard: valid transition
  const allowed = _validTransitions[_activeEnv];
  if (allowed && !allowed.includes(newEnv)) {
    console.warn('[ENV] Invalid transition:', _activeEnv, '->', newEnv);
    return false;
  }

  _transitioning = true;
  const oldEnv = _activeEnv;
  console.log('[ENV]', oldEnv || 'INIT', '->', newEnv);

  _activeEnv = newEnv;

  // Sync legacy state flags for backward compatibility
  _syncLegacyFlags(newEnv);

  // Building blocks are an Earth/Moon interaction; disable during non-terrain destination modes.
  if ((newEnv === ENV.SPACE_FLIGHT || newEnv === ENV.OCEAN) && typeof appCtx.setBuildModeEnabled === 'function') {
    appCtx.setBuildModeEnabled(false);
  }

  _transitioning = false;

  // Update debug HUD
  _updateEnvDebug();
  if (typeof appCtx.updateControlsModeUI === 'function') {
    appCtx.updateControlsModeUI();
  }

  return true;
}

// Keep the legacy boolean flags in sync so existing code keeps working
function _syncLegacyFlags(env) {
  switch (env) {
    case ENV.EARTH:
      appCtx.onMoon = false;
      appCtx.onMars = false;
      setEnvironmentTransitionActive(false);
      break;
    case ENV.SPACE_FLIGHT:
      // travelingToMoon is set by the caller before switchEnv
      // onMoon stays whatever it was (could be leaving Earth or Moon)
      break;
    case ENV.MOON:
      appCtx.onMoon = true;
      appCtx.onMars = false;
      setEnvironmentTransitionActive(false);
      break;
    case ENV.MARS:
      appCtx.onMoon = false;
      appCtx.onMars = true;
      setEnvironmentTransitionActive(false);
      break;
    case ENV.OCEAN:
      appCtx.onMoon = false;
      appCtx.onMars = false;
      setEnvironmentTransitionActive(false);
      break;
  }
}

// Lightweight debug overlay (top-left, unobtrusive)
function _updateEnvDebug() {
  const debugEnabled = typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('envDebug') === '1';
  if (!debugEnabled) {
    _envDebugEl?.remove();
    _envDebugEl = null;
    return;
  }
  if (!_envDebugEl) {
    _envDebugEl = document.getElementById('envDebug');
    if (!_envDebugEl) {
      _envDebugEl = document.createElement('div');
      _envDebugEl.id = 'envDebug';
      _envDebugEl.style.cssText =
      'position:fixed;top:4px;left:4px;z-index:9999;' +
      'font:10px monospace;color:rgba(255,255,255,0.5);' +
      'pointer-events:none;text-shadow:0 0 2px #000';
      document.body.appendChild(_envDebugEl);
    }
  }
  _envDebugEl.textContent = 'ENV:' + (_activeEnv || 'INIT');
}

Object.defineProperty(appCtx, 'ENV', {
  value: ENV,
  enumerable: true,
  configurable: false,
  writable: false
});
Object.assign(appCtx, { getEnv, isEnv, setEnvironmentTransitionActive, switchEnv });

export { ENV, getEnv, isEnv, setEnvironmentTransitionActive, switchEnv };
