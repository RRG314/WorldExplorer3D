import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycleScope } from '../app/js/runtime/lifecycle-scope.js';
import { createSpaceLaunchReadiness } from '../app/js/space/launch-readiness.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pauses = new Set(['manual_pause', 'planetary_transition']);
  const context = {
    spaceFlight: { active: true, _sessionId: 1, mode: 'launching', destination: 'moon', speed: 73 },
    spaceJourney: { journeyId: 'first', phase: 'launch' },
    setPauseReason(reason, active) { if (active) pauses.add(reason); else pauses.delete(reason); }
  };
  const scopes = [];
  const start = () => {
    const scope = createLifecycleScope('launch-readiness-test'); scopes.push(scope);
    return { scope, readiness: createSpaceLaunchReadiness(context, scope, context.spaceFlight._sessionId) };
  };
  t.after(() => scopes.forEach(scope => scope.dispose()));
  return { context, pauses, start };
}

test('unchanged flight completes preparation and releases only its own pause resource', t => {
  const { context, pauses, start } = setup(t), { scope, readiness } = start();
  let calls = 0;
  readiness.schedule({ onReady() { calls++; context.spaceJourney.phase = 'ascent'; } });
  t.mock.timers.tick(999); assert.equal(context.spaceFlight.mode, 'launching'); assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1); assert.equal(context.spaceFlight.mode, 'flying');
  assert.equal(context.spaceJourney.phase, 'ascent');
  assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition']);
  assert.equal(scope.snapshot().resourceCount, 0);
});

test('retarget during launch unpauses the session without replacing the newer course', t => {
  const { context, pauses, start } = setup(t), { readiness } = start();
  let calls = 0; readiness.schedule({ onReady() { calls++; context.spaceJourney.phase = 'ascent'; context.spaceFlight.speed = 0; } });
  const replacement = { journeyId: 'jupiter-trip', phase: 'approach' };
  context.spaceFlight.destination = 'jupiter'; context.spaceJourney = replacement;
  t.mock.timers.tick(1000);
  assert.equal(calls, 0); assert.equal(context.spaceJourney, replacement);
  assert.equal(context.spaceFlight.mode, 'flying'); assert.equal(context.spaceFlight.speed, 73);
  assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition']);
});

test('same-destination replacement and progressed launch phase retain their newer state', t => {
  const { context, start } = setup(t);
  for (const replacement of [{ journeyId: 'second', phase: 'launch' }, { journeyId: 'first', phase: 'approach' }]) {
    context.spaceJourney = { journeyId: 'first', phase: 'launch' };
    const { readiness } = start(); let calls = 0;
    readiness.schedule({ onReady() { calls++; } }); context.spaceJourney = replacement;
    t.mock.timers.tick(1000); assert.equal(calls, 0); assert.equal(context.spaceJourney, replacement);
  }
});

test('a superseded callback cannot release the next flight pause or change its mode', t => {
  const { context, pauses, start } = setup(t), first = start();
  let calls = 0; first.readiness.schedule({ onReady() { calls++; } });
  context.spaceFlight._sessionId = 2;
  const next = start();
  t.mock.timers.tick(1000);
  assert.equal(calls, 0); assert.equal(context.spaceFlight.mode, 'launching');
  assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition', 'space_launch:2']);
  first.scope.dispose(); assert.equal(pauses.has('space_launch:2'), true);
  next.scope.dispose(); assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition']);
});

test('cancelled startup releases its pause and timer before any callback runs', t => {
  const { pauses, start } = setup(t), { readiness, scope } = start(); let calls = 0;
  readiness.schedule({ onReady() { calls++; } }); scope.dispose('cancelled-entry');
  t.mock.timers.tick(1000); assert.equal(calls, 0); assert.equal(scope.snapshot().resourceCount, 0);
  assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition']);
});

test('entering the nested ship during preparation does not strand the launch pause', t => {
  const { context, pauses, start } = setup(t), { readiness } = start(); let calls = 0;
  readiness.schedule({ onReady() { calls++; } }); context.spaceFlight.active = false;
  t.mock.timers.tick(1000); assert.equal(calls, 0); assert.equal(context.spaceFlight.mode, 'flying');
  assert.deepEqual([...pauses], ['manual_pause', 'planetary_transition']);
  context.spaceFlight.active = true; assert.equal(pauses.has('space_launch:1'), false);
});
