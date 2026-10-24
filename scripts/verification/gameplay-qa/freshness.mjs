// Source hashes remain authoritative for component tests. Browser observations
// also age out, since devices, providers and runtime conditions can change.
// Known failures stay visible until a deliberate retry or relevant input change.
export function observationCurrent(receipt, kind, now = Date.now()) {
  if (kind !== 'browser' || receipt?.status !== 'passed') return true;
  const age = now - Date.parse(receipt.observedAt);
  return Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
}
