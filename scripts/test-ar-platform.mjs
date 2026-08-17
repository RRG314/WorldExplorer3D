import assert from 'node:assert/strict';
import { AR_CAPABILITY_LEVELS, detectArCapabilities, isTrustedArContext } from '../app/js/ar/capabilities.js?v=1';
import { evaluateArEligibility, getArEligibilityRegistrySnapshot } from '../app/js/ar/eligibility.js?v=1';
import { compileWaterfowlChallenge, createWaterfowlChallengeSession } from '../app/js/ar/field-challenge.js?v=1';
import { createEnvironmentFixture } from '../app/js/discovery/environment-context.js?v=1';

assert.equal(isTrustedArContext({ isSecureContext: false, location: { hostname: 'localhost' } }), true);
assert.equal((await detectArCapabilities({ secureContext: false, scope: {}, navigatorObject: {} })).level, AR_CAPABILITY_LEVELS.VIEWER);
assert.equal((await detectArCapabilities({ secureContext: true, scope: {}, navigatorObject: { mediaDevices: { getUserMedia() {} } } })).level, AR_CAPABILITY_LEVELS.CAMERA);
assert.equal((await detectArCapabilities({ secureContext: true, scope: {}, navigatorObject: { xr: { isSessionSupported: async (mode) => mode === 'immersive-ar' } } })).level, AR_CAPABILITY_LEVELS.SPATIAL);

const river = createEnvironmentFixture('river');
const downtown = createEnvironmentFixture('downtown');
const baseContext = { environmentName: 'EARTH', position: { x: 0, z: 0 }, travelMode: 'walk', liveGpsSnapshot: { active: false } };
assert.equal(evaluateArEligibility({ type: 'field-challenge' }, { ...baseContext, environment: river }).allowed, true);
assert.equal(evaluateArEligibility({ type: 'field-challenge' }, { ...baseContext, environment: downtown }).allowed, false);
assert.equal(evaluateArEligibility({ type: 'field-challenge' }, { ...baseContext, environment: river, travelMode: 'car' }).reason, 'stop-vehicle-first');
assert.equal(evaluateArEligibility({ type: 'field-challenge' }, { ...baseContext, environment: river, liveGpsSnapshot: { active: true, speedMps: 3.1 } }).reason, 'moving-too-fast');

const companion = { instanceId: 'companion:one', catalogId: 'trail-hound', name: 'Scout' };
assert.equal(evaluateArEligibility({ type: 'companion', companion }, { ...baseContext, companions: [companion] }).allowed, true);
assert.equal(evaluateArEligibility({ type: 'companion', companion }, { ...baseContext, companions: [] }).reason, 'companion-not-owned');
assert.equal(evaluateArEligibility({ type: 'specimen', record: { catalogId: 'granite-field-sample' } }, baseContext).allowed, true);
assert.equal(evaluateArEligibility({ type: 'specimen', record: { catalogId: 'brass-transit-token' } }, baseContext).reason, 'model-unavailable');

const plan = compileWaterfowlChallenge({ environment: river, ...baseContext });
const repeated = compileWaterfowlChallenge({ environment: river, ...baseContext });
assert.equal(plan.eligible, true);
assert.deepEqual(plan.actors, repeated.actors, 'same accepted habitat must reproduce the same virtual encounter');
assert.equal(plan.actors.length, 4);
assert.equal(plan.virtualTargetsOnly, true);
assert.equal(plan.realAnimalImpact, false);
assert.equal(plan.occurrenceClaim, false);
assert.equal(plan.interactionMode, 'touch-photo-survey');

const session = createWaterfowlChallengeSession(plan);
for (const actor of plan.actors) assert.equal(session.photograph(actor.id), true);
assert.equal(session.snapshot().completed, true);
assert.equal(session.snapshot().photographed, 4);
assert.equal(session.photograph(plan.actors[0].id), false, 'a target can only be recorded once');

const registry = getArEligibilityRegistrySnapshot();
assert.deepEqual(registry.types, ['companion', 'specimen', 'field-challenge']);
assert.equal(registry.deferred.includes('detector-sweep'), true);

console.log(JSON.stringify({ ok: true, capabilityLevels: Object.values(AR_CAPABILITY_LEVELS), fieldActors: plan.actors.length, registry }, null, 2));
