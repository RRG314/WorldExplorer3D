import assert from 'node:assert/strict';
import {
  CONTACT_RESOLUTION_SECONDS,
  createResponderResponseModel,
  outcomeForLevel,
  responderAgencyProfile,
  responderCountForLevel
} from '../app/js/urban-sandbox/responder-model.js';

assert.equal(responderAgencyProfile('Ranger service').id, 'ranger');
assert.equal(responderAgencyProfile('Campus safety').id, 'campus');
assert.equal(responderAgencyProfile('Baltimore civic response').id, 'civic');
assert.equal(responderCountForLevel(1, false), 1);
assert.equal(responderCountForLevel(2, false), 2);
assert.equal(responderCountForLevel(3, true), 1);
assert.equal(outcomeForLevel(1).type, 'warning');
assert.equal(outcomeForLevel(2).type, 'citation');
assert.equal(outcomeForLevel(3).type, 'recovery');

const civic = {
  phase: 'observed',
  level: 1,
  lastEvent: { id: 'civic-event:1' }
};
const model = createResponderResponseModel({ mobile: false });
assert.equal(model.update(.1, { civic, activeCount: 0 }).phase, 'queued');
civic.phase = 'reporting';
assert.equal(model.update(.1, { civic, activeCount: 0 }).phase, 'queued');
civic.phase = 'searching';
const dispatch = model.update(.1, { civic, activeCount: 0, nearestDistance: Infinity });
assert.equal(dispatch.phase, 'dispatched');
assert.equal(dispatch.dispatchCount, 1);
assert.equal(model.update(.1, { civic, activeCount: 1, nearestDistance: 70 }).phase, 'dispatched');
assert.equal(model.update(.1, { civic, activeCount: 1, nearestDistance: 22 }).phase, 'pursuit');
assert.equal(model.update(.1, { civic, activeCount: 1, nearestDistance: 8, actorMoving: true }).phase, 'pursuit');
assert.equal(model.update(.1, { civic, activeCount: 1, nearestDistance: 8, actorWithinSearch: false }).phase, 'searching');

let resolved = null;
for (let elapsed = 0; elapsed <= CONTACT_RESOLUTION_SECONDS + .25; elapsed += .25) {
  const result = model.update(.25, { civic, activeCount: 1, nearestDistance: 8, actorMoving: false });
  if (result.resolution) resolved = result.resolution;
}
assert.equal(resolved?.type, 'warning');
civic.phase = 'clear';
assert.equal(model.update(.1, { civic, activeCount: 1 }).phase, 'returning');
assert.equal(model.update(.1, { civic, activeCount: 0 }).phase, 'idle');

const escalation = createResponderResponseModel({ mobile: false });
const escalated = escalation.update(.1, {
  civic: { phase: 'searching', level: 3, lastEvent: { id: 'civic-event:2' } },
  activeCount: 0
});
assert.equal(escalated.dispatchCount, 2);

console.log(JSON.stringify({
  ok: true,
  contract: 'urban-responder-model-v1',
  contactResolutionSeconds: CONTACT_RESOLUTION_SECONDS,
  desktopMaximumUnits: escalated.dispatchCount,
  mobileMaximumUnits: responderCountForLevel(3, true),
  outcomes: [1, 2, 3].map((level) => outcomeForLevel(level).type)
}, null, 2));
