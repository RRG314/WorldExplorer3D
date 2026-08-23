import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLiveGpsFieldSession,
  evaluateLiveGpsFieldProximity,
  ingestLiveGpsFieldFix,
  liveGpsFieldSessionSnapshot
} from '../app/js/live-gps/field-session-authority.js';

const readyRuntime = Object.freeze({
  active: true,
  following: true,
  visibilityPaused: false,
  signalLost: false,
  permissionDenied: false,
  recentering: false,
  boundaryState: 'inside',
  hasFix: true,
  accuracyMeters: 7,
  speedMps: 1.4
});

test('credits plausible accurate walking distance without retaining a route', () => {
  const session = createLiveGpsFieldSession({ startedAt: 1_000, sessionId: 'walk-test' });
  ingestLiveGpsFieldFix(session, { latitude: 39.2904, longitude: -76.6122, accuracy: 6, receivedAt: 1_000 }, { speedMps: 1.2 });
  const accepted = ingestLiveGpsFieldFix(session, { latitude: 39.29049, longitude: -76.6122, accuracy: 6, receivedAt: 9_000 }, { speedMps: 1.3 });
  assert.equal(accepted.qualified, true);
  assert.ok(accepted.creditedMeters >= 8 && accepted.creditedMeters <= 12);
  assert.equal('rawSamples' in session, false);
  assert.ok(session.trustedDistanceMeters > 0);
});

test('holds field credit for poor accuracy and vehicle speed', () => {
  const session = createLiveGpsFieldSession({ startedAt: 1_000 });
  const inaccurate = ingestLiveGpsFieldFix(session, { latitude: 39, longitude: -76, accuracy: 60, receivedAt: 1_000 }, { speedMps: 1 });
  const fast = ingestLiveGpsFieldFix(session, { latitude: 39.001, longitude: -76, accuracy: 5, receivedAt: 2_000 }, { speedMps: 12 });
  assert.equal(inaccurate.qualified, false);
  assert.equal(fast.qualified, false);
  assert.equal(session.trustedDistanceMeters, 0);
  assert.equal(evaluateLiveGpsFieldProximity(session, 8, { ...readyRuntime, accuracyMeters: 60 }).state, 'accuracy-hold');
  assert.equal(evaluateLiveGpsFieldProximity(session, 8, { ...readyRuntime, speedMps: 12 }).state, 'unsafe-speed');
});

test('requires a fresh foreground GPS walking session for interaction', () => {
  const session = createLiveGpsFieldSession({ startedAt: 1_000 });
  const far = evaluateLiveGpsFieldProximity(session, 120, readyRuntime);
  const close = evaluateLiveGpsFieldProximity(session, 20, readyRuntime);
  const hidden = evaluateLiveGpsFieldProximity(session, 5, { ...readyRuntime, visibilityPaused: true });
  assert.equal(far.eligible, false);
  assert.equal(far.state, 'distant');
  assert.equal(close.eligible, true);
  assert.equal(close.state, 'interactable');
  assert.equal(hidden.eligible, false);
  assert.equal(hidden.pauseReason, 'screen-hidden');
  assert.equal(liveGpsFieldSessionSnapshot(session, readyRuntime, 6_000).eligible, true);
});
