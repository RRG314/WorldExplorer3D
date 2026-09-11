export function createPerfSettingsApi({ appCtx, constants, state }) {
  const {
    PERF_MODE_BASELINE,
    PERF_MODE_RDT,
    PERF_QUALITY_TIER_BALANCED,
    PERF_QUALITY_TIER_PERFORMANCE,
    PERF_QUALITY_TIER_QUALITY
  } = constants;
  const { getPerfAutoQualityTier } = state;

  function exposeMutableGlobal(name, getter, setter) {
    Object.defineProperty(appCtx, name, {
      configurable: true,
      enumerable: true,
      get: getter,
      set: setter
    });
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures (private browsing / blocked storage).
    }
  }

  function normalizePerfMode(mode) {
    return mode === PERF_MODE_BASELINE ? PERF_MODE_BASELINE : PERF_MODE_RDT;
  }

  function normalizePerfQualityTier(tier) {
    if (tier === PERF_QUALITY_TIER_PERFORMANCE) return PERF_QUALITY_TIER_PERFORMANCE;
    if (tier === PERF_QUALITY_TIER_QUALITY) return PERF_QUALITY_TIER_QUALITY;
    return PERF_QUALITY_TIER_BALANCED;
  }

  function getPerfQualityProfile(tier = getPerfAutoQualityTier()) {
    const normalized = normalizePerfQualityTier(tier);
    if (normalized === PERF_QUALITY_TIER_PERFORMANCE) {
      return { tier: normalized, label: 'Performance', budgetScale: 0.82, lodScale: 0.90 };
    }
    if (normalized === PERF_QUALITY_TIER_QUALITY) {
      return { tier: normalized, label: 'Quality', budgetScale: 1.10, lodScale: 1.08 };
    }
    return { tier: PERF_QUALITY_TIER_BALANCED, label: 'Balanced', budgetScale: 1.0, lodScale: 1.0 };
  }

  return {
    exposeMutableGlobal,
    getPerfQualityProfile,
    normalizePerfMode,
    normalizePerfQualityTier,
    readStorage,
    writeStorage
  };
}
