// A bounded tag for a deterministic visual individual in one simulated cohort.
// This is neither a real animal identity nor a fishing-stock identifier.
export function marineIndividualId(contextId, speciesId, ordinal) {
  let hash = 2166136261;
  for (const char of String(contextId || 'local')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `virtual:${String(speciesId).slice(0, 100)}:${(hash >>> 0).toString(16)}:${ordinal}`;
}
