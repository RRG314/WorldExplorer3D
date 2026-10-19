import assert from 'node:assert/strict';

export const TRANSFER_FIELDS = Object.freeze(['localTransferBytes', 'externalRequests', 'externalTransferBytes']);

function values(sample) {
  for (const key of TRANSFER_FIELDS) assert.ok(Number.isSafeInteger(sample?.[key]) && sample[key] >= 0, `Invalid transfer counter: ${key}`);
  return sample;
}

export function transferDifference(current, previous) {
  values(current); values(previous);
  const difference = Object.fromEntries(TRANSFER_FIELDS.map(key => [key, current[key] - previous[key]]));
  return values(difference);
}

// A cold world load, bounded travel window, and each subsequent world load are
// different operations. Keep the same ceiling for every operation, and retain
// the whole-session total. Never discard a successful provider's response.
export function transferPhases({ startup, beforeReloads, reloads, total }) {
  values(startup); values(beforeReloads); values(total);
  assert.ok(Array.isArray(reloads), 'Reload transfer samples are required');
  const phases = [
    { id: 'cold-world', ...Object.fromEntries(TRANSFER_FIELDS.map(key => [key, startup[key]])) },
    { id: 'bounded-travel', ...transferDifference(beforeReloads, startup) },
    ...reloads.map((sample, index) => ({ id: `reload-${index + 1}`, ...values(sample) }))
  ];
  const accounted = Object.fromEntries(TRANSFER_FIELDS.map(key => [key, phases.reduce((sum, phase) => sum + phase[key], 0)]));
  phases.push({ id: 'finalization', ...transferDifference(total, accounted) });
  for (const key of TRANSFER_FIELDS) assert.equal(phases.reduce((sum, phase) => sum + phase[key], 0), total[key]);
  return phases;
}

export function transferWithinBudget(sample, limit) {
  values(sample);
  return sample.localTransferBytes <= limit.maximumLocalTransferBytes &&
    sample.externalRequests <= limit.maximumExternalRequests &&
    sample.externalTransferBytes <= limit.maximumExternalTransferBytes;
}
