const PLAYER_CONDITION_STORAGE_KEY = 'world-explorer:player-condition:v1';
const PLAYER_CONDITION_SCHEMA_VERSION = 1;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function conditionBand(condition = 1) {
  const value = clamp01(condition);
  if (value <= 0.05) return 'incapacitated';
  if (value <= 0.25) return 'critical';
  if (value <= 0.6) return 'injured';
  return 'healthy';
}

function createPlayerConditionModel(options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const now = options.now || (() => Date.now());
  let condition = 1;
  const listeners = new Set();
  try {
    const saved = JSON.parse(storage?.getItem?.(PLAYER_CONDITION_STORAGE_KEY) || 'null');
    if (saved?.schemaVersion === PLAYER_CONDITION_SCHEMA_VERSION) condition = clamp01(saved.condition);
  } catch (_) {}

  function save(reason = 'condition-change') {
    try {
      storage?.setItem?.(PLAYER_CONDITION_STORAGE_KEY, JSON.stringify({
        schemaVersion: PLAYER_CONDITION_SCHEMA_VERSION,
        condition,
        reason: String(reason || ''),
        updatedAt: Number(now()) || Date.now()
      }));
    } catch (_) {}
  }

  function set(value, reason = 'condition-set', settings = {}) {
    const before = condition;
    condition = clamp01(value);
    if (settings.persist !== false) save(reason);
    const change = Object.freeze({ before, after: condition, delta: condition - before, band: conditionBand(condition), reason });
    if (settings.notify !== false && before !== condition) listeners.forEach((listener) => listener(change));
    return change;
  }

  function applyImpact(force = 0, reason = 'impact') {
    return set(condition - Math.max(0, Number(force) || 0) / 100, reason);
  }

  function restore(amount = 0, reason = 'recovery') {
    return set(condition + Math.max(0, Number(amount) || 0), reason);
  }

  function snapshot() {
    return Object.freeze({
      type: 'PlayerCondition',
      schemaVersion: PLAYER_CONDITION_SCHEMA_VERSION,
      condition,
      percent: Math.round(condition * 100),
      band: conditionBand(condition),
      incapacitated: condition <= 0.05
    });
  }

  return Object.freeze({
    applyImpact,
    hydrate(value, reason = 'signed-in-hydration') { return set(value, reason, { persist: true, notify: false }); },
    restore,
    set,
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}

function ensurePlayerConditionAuthority(appContext = {}, options = {}) {
  if (!appContext.playerConditionAuthority?.snapshot) {
    appContext.playerConditionAuthority = createPlayerConditionModel(options);
  }
  return appContext.playerConditionAuthority;
}

export {
  PLAYER_CONDITION_SCHEMA_VERSION,
  PLAYER_CONDITION_STORAGE_KEY,
  conditionBand,
  createPlayerConditionModel,
  ensurePlayerConditionAuthority
};
