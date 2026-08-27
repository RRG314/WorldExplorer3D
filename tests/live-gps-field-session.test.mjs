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

const safeApproach = Object.freeze({
  targetId: 'field:photograph:cell:0:0:0',
  stableSurface: true,
  buildingClear: true,
  barrierEvidence: 'generated-point-clears-loaded-building-volumes',
  accessEvidence: 'unknown',
  accessClaim: false
});

function consentedSession(options = {}) {
  return createLiveGpsFieldSession({
    startedAt: 1_000,
    consentGranted: true,
    consentedAt: 900,
    consentSource: 'live-gps-permission-panel',
    secureContext: true,
    ...options
  });
}

test('credits plausible accurate walking distance without retaining a route', () => {
  const session = consentedSession({ sessionId: 'walk-test' });
  ingestLiveGpsFieldFix(session, { latitude: 39.2904, longitude: -76.6122, accuracy: 6, receivedAt: 1_000 }, { speedMps: 1.2 });
  const accepted = ingestLiveGpsFieldFix(session, { latitude: 39.29049, longitude: -76.6122, accuracy: 6, receivedAt: 9_000 }, { speedMps: 1.3 });
  assert.equal(accepted.qualified, true);
  assert.ok(accepted.creditedMeters >= 8 && accepted.creditedMeters <= 12);
  assert.equal('rawSamples' in session, false);
  assert.equal('route' in session, false);
  assert.equal(session.privacy.rawRouteStored, false);
  assert.equal(session.privacy.rawFixHistoryStored, false);
  assert.ok(session.trustedDistanceMeters > 0);
});

test('holds field credit for poor accuracy and vehicle speed', () => {
  const session = consentedSession();
  const inaccurate = ingestLiveGpsFieldFix(session, { latitude: 39, longitude: -76, accuracy: 60, receivedAt: 1_000 }, { speedMps: 1 });
  const fast = ingestLiveGpsFieldFix(session, { latitude: 39.001, longitude: -76, accuracy: 5, receivedAt: 2_000 }, { speedMps: 12 });
  assert.equal(inaccurate.qualified, false);
  assert.equal(fast.qualified, false);
  assert.equal(session.trustedDistanceMeters, 0);
  assert.equal(evaluateLiveGpsFieldProximity(session, 8, { ...readyRuntime, accuracyMeters: 60 }, safeApproach).state, 'accuracy-hold');
  assert.equal(evaluateLiveGpsFieldProximity(session, 8, { ...readyRuntime, speedMps: 12 }, safeApproach).state, 'unsafe-speed');
});

test('requires consent, secure context, foreground GPS, and modeled approach evidence', () => {
  const session = consentedSession();
  const far = evaluateLiveGpsFieldProximity(session, 120, readyRuntime, safeApproach);
  const close = evaluateLiveGpsFieldProximity(session, 20, readyRuntime, safeApproach);
  const hidden = evaluateLiveGpsFieldProximity(session, 5, { ...readyRuntime, visibilityPaused: true }, safeApproach);
  const blocked = evaluateLiveGpsFieldProximity(session, 5, readyRuntime, { ...safeApproach, buildingClear: false });
  const missingConsent = createLiveGpsFieldSession({ startedAt: 1_000, secureContext: true });
  const insecure = createLiveGpsFieldSession({ startedAt: 1_000, consentGranted: true, secureContext: false });
  assert.equal(far.eligible, false);
  assert.equal(far.state, 'distant');
  assert.equal(close.eligible, true);
  assert.equal(close.state, 'interactable');
  assert.equal(hidden.eligible, false);
  assert.equal(hidden.pauseReason, 'screen-hidden');
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.state, 'access-blocked');
  assert.equal(evaluateLiveGpsFieldProximity(missingConsent, 5, readyRuntime, safeApproach).pauseReason, 'consent-required');
  assert.equal(evaluateLiveGpsFieldProximity(insecure, 5, readyRuntime, safeApproach).pauseReason, 'insecure-context');
  assert.equal(liveGpsFieldSessionSnapshot(session, readyRuntime, 6_000).eligible, true);
});

test('uses interaction hysteresis and never grants a competitive or location reward', () => {
  const session = consentedSession();
  const entered = evaluateLiveGpsFieldProximity(session, 27.5, readyRuntime, safeApproach);
  const jittered = evaluateLiveGpsFieldProximity(session, 33.5, readyRuntime, safeApproach);
  const exited = evaluateLiveGpsFieldProximity(session, 34.5, readyRuntime, safeApproach);
  assert.equal(entered.state, 'interactable');
  assert.equal(jittered.state, 'interactable');
  assert.equal(exited.state, 'approach');
  assert.deepEqual(jittered.rewardEligibility, {
    personalVirtualRecord: true,
    competitive: false,
    locationReward: false,
    reason: 'access-unknown-and-no-server-receipt'
  });
  const snapshot = liveGpsFieldSessionSnapshot(session, readyRuntime, 6_000);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.consent.granted, true);
  assert.equal(snapshot.privacy.rawRouteStored, false);
  assert.equal(snapshot.rewardPolicy.competitive, false);
  assert.equal(snapshot.rewardPolicy.locationReward, false);
});
