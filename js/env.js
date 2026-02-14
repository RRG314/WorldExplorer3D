import { ctx as appCtx } from "./shared-context.js?v=52"; // ============================================================================
// env.js - Centralized Environment State Manager
// ============================================================================
// Single source of truth for which environment is active.
// Only ONE environment can be active at a time.
// All transitions go through switchEnv() which syncs legacy flags.
//
// Render layer order:
//   EARTH:        main renderLoop → update() → renderer.render(scene, camera)
//   SPACE_FLIGHT: animateSpaceFlight() → spaceFlight.renderer.render(...)
//   MOON:         main renderLoop → update() → renderer.render(scene, camera)

const ENV = Object.freeze({
  EARTH: 'EARTH',
  SPACE_FLIGHT: 'SPACE_FLIGHT',
  MOON: 'MOON'
});

let _activeEnv = null; // null until first switchEnv
let _transitioning = false; // guard against re-entrant transitions
let _envDebugEl = null; // debug HUD element

// Valid transitions: which env can switch to which
const _validTransitions = {
  null: [ENV.EARTH],
  EARTH: [ENV.SPACE_FLIGHT, ENV.MOON],
  SPACE_FLIGHT: [ENV.EARTH, ENV.MOON],
  MOON: [ENV.SPACE_FLIGHT, ENV.EARTH]
};

function getEnv() {
  return _activeEnv;
}

function isEnv(env) {
  return _activeEnv === env;
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

  // Building blocks are an Earth/Moon interaction; disable during space flight.
  if (newEnv === ENV.SPACE_FLIGHT && typeof appCtx.setBuildModeEnabled === 'function') {
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
      appCtx.travelingToMoon = false;
      break;
    case ENV.SPACE_FLIGHT:
      // travelingToMoon is set by the caller before switchEnv
      // onMoon stays whatever it was (could be leaving Earth or Moon)
      break;
    case ENV.MOON:
      appCtx.onMoon = true;
      appCtx.travelingToMoon = false;
      break;
  }
}

// Lightweight debug overlay (top-left, unobtrusive)
function _updateEnvDebug() {
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

Object.assign(appCtx, { ENV, getEnv, isEnv, switchEnv });

export { ENV, getEnv, isEnv, switchEnv };