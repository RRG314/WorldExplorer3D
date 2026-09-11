import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSpecification, checkSourceCoverage, launchBlockers } from '../../scripts/embodied-society/specification.mjs';
const config = JSON.parse(await readFile(new URL('../../research/embodied-society/pilot.config.json', import.meta.url), 'utf8'));
test('the disabled proposal is valid but does not authorize execution', () => {
  assert.deepEqual(validateSpecification(config), []);
  assert.equal(config.acceptance.canLaunch, false);
  assert.ok(launchBlockers().length > 0);
});
test('unsafe edits or false readiness claims are rejected by the specification check', () => {
  for (const mutate of [
    c => c.enabled = true,
    c => c.environment.productionAccess = true,
    c => c.environment.firebaseProjectId = 'worldexplorer3d-d9b83',
    c => c.budget.modelSpendUsd = 10,
    c => c.budget.wallMinutes = Infinity,
    c => c.population.initial = 8,
    c => c.population.sharedHiddenContext = true,
    c => c.engineering.enabled = true,
    c => c.engineering.sandboxAttestation = 'claimed',
    c => c.observer.publicEnabled = true,
    c => c.acceptance.bodyAdapterVerified = true
  ]) {
    const copy = structuredClone(config); mutate(copy);
    assert.ok(validateSpecification(copy).length > 0);
  }
});
test('missing configuration cannot silently grant permission', () => {
  assert.ok(validateSpecification({}).length > 0);
  assert.ok(validateSpecification(null).length > 0);
});
test('all 179 numbered source requirements are indexed and four archives match their hashes', async () => {
  assert.deepEqual(await checkSourceCoverage(), []);
});
