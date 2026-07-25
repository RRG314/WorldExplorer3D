import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixtureUrl = new URL('./fixtures/release-4.1-recovery-scenarios.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));

assert.equal(fixture.schemaVersion, 1);
assert.equal(fixture.coordinateConvention?.local, 'metres in the active EarthSession frame; +x east, +z south');
assert.ok(Array.isArray(fixture.scenarios));
assert.equal(fixture.scenarios.length, 5);

const ids = new Set();
for (const scenario of fixture.scenarios) {
  assert.match(scenario.id, /^[a-z0-9_]+$/);
  assert.ok(!ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`);
  ids.add(scenario.id);
  assert.ok(scenario.owner);
  assert.ok(Number.isFinite(scenario.location?.lat));
  assert.ok(Number.isFinite(scenario.location?.lon));
  assert.ok(Array.isArray(scenario.journey?.localWaypoints));
  assert.ok(scenario.journey.localWaypoints.length > 0);
  assert.ok(scenario.journey.localWaypoints.every((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.z)
  ));
  assert.ok(Array.isArray(scenario.invariants));
  assert.ok(scenario.invariants.length >= 3);
  assert.equal(scenario.implementationExceptionAllowed, false);
  assert.match(scenario.evidenceCheckpoint, /^[0-9a-f]{40}$/);
  const serialized = JSON.stringify(scenario);
  assert.doesNotMatch(serialized, /app\/js\/rewrite|shared-context|cityOverride|locationException/i);
}

assert.deepEqual(
  new Set(fixture.scenarios.map((scenario) => scenario.category)),
  new Set([
    'surface_occupancy',
    'render_presentation',
    'terrain_confidence',
    'runtime_lifecycle',
    'evidence_quality'
  ])
);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: fixture.schemaVersion,
  scenarios: fixture.scenarios.map(({ id, category, owner }) => ({ id, category, owner }))
}, null, 2));
