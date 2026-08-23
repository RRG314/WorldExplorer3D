import { haversineMeters } from './model.js?v=1';

const LIVE_GPS_FIELD_POLICY = Object.freeze({
  maximumInteractionAccuracyMeters: 35,
  maximumEligibleSpeedMps: 3.6,
  maximumFixGapMs: 20_000,
  minimumDistanceSegmentMeters: 2,
  maximumDistanceSegmentMeters: 80,
  revealRadiusMeters: 180,
  nearbyRadiusMeters: 80,
  approachRadiusMeters: 45,
  interactionRadiusMeters: 28
});

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createLiveGpsFieldSession(options = {}) {
  const startedAt = finite(options.startedAt, Date.now());
  return {
    schemaVersion: 1,
    sessionId: String(options.sessionId || `field-${Math.round(startedAt).toString(36)}`),
    startedAt,
    lastQualifiedFix: null,
    trustedDistanceMeters: 0,
    acceptedDistanceSegments: 0,
    rejectedDistanceSegments: 0,
    qualifiedFixes: 0,
    inaccurateFixes: 0,
    unsafeSpeedFixes: 0
  };
}

function ingestLiveGpsFieldFix(session, fix, context = {}) {
  if (!session) throw new TypeError('A Live GPS field session is required.');
  const accuracy = finite(fix?.accuracy, Infinity);
  const speedMps = Math.max(0, finite(context.speedMps ?? fix?.speed, 0));
  const receivedAt = finite(fix?.receivedAt ?? fix?.timestamp, Date.now());
  const qualified = accuracy <= LIVE_GPS_FIELD_POLICY.maximumInteractionAccuracyMeters &&
    speedMps <= LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps;

  if (accuracy > LIVE_GPS_FIELD_POLICY.maximumInteractionAccuracyMeters) session.inaccurateFixes += 1;
  if (speedMps > LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps) session.unsafeSpeedFixes += 1;

  const previous = session.lastQualifiedFix;
  let creditedMeters = 0;
  if (qualified && previous) {
    const elapsedMs = Math.max(0, receivedAt - previous.receivedAt);
    const segmentMeters = haversineMeters(previous, fix);
    const accuracyAllowance = Math.max(12, accuracy + previous.accuracy);
    const plausibleLimit = Math.min(
      LIVE_GPS_FIELD_POLICY.maximumDistanceSegmentMeters,
      accuracyAllowance + LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps * Math.max(1, elapsedMs / 1000) * 1.8
    );
    if (elapsedMs <= LIVE_GPS_FIELD_POLICY.maximumFixGapMs &&
        segmentMeters >= LIVE_GPS_FIELD_POLICY.minimumDistanceSegmentMeters &&
        segmentMeters <= plausibleLimit) {
      creditedMeters = segmentMeters;
      session.trustedDistanceMeters += segmentMeters;
      session.acceptedDistanceSegments += 1;
    } else if (segmentMeters >= LIVE_GPS_FIELD_POLICY.minimumDistanceSegmentMeters) {
      session.rejectedDistanceSegments += 1;
    }
  }
  if (qualified) {
    session.lastQualifiedFix = {
      latitude: Number(fix.latitude), longitude: Number(fix.longitude),
      accuracy, receivedAt
    };
    session.qualifiedFixes += 1;
  }
  return Object.freeze({ qualified, creditedMeters: Number(creditedMeters.toFixed(1)), accuracyMeters: accuracy, speedMps });
}

function fieldPauseReason(runtime = {}) {
  if (runtime.active !== true) return 'gps-inactive';
  if (runtime.permissionDenied) return 'permission-denied';
  if (runtime.visibilityPaused) return 'screen-hidden';
  if (runtime.signalLost) return 'signal-lost';
  if (runtime.recentering) return 'recentering';
  if (runtime.following !== true) return 'gps-paused';
  if (runtime.boundaryState === 'hard-pause') return 'world-boundary';
  if (runtime.hasFix !== true) return 'waiting-for-fix';
  if (finite(runtime.accuracyMeters, Infinity) > LIVE_GPS_FIELD_POLICY.maximumInteractionAccuracyMeters) return 'accuracy-hold';
  if (finite(runtime.speedMps, 0) > LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps) return 'unsafe-speed';
  return null;
}

function proximityMessage(state, distanceMeters, pauseReason) {
  if (pauseReason === 'accuracy-hold') return 'GPS accuracy is too broad for this stop. Hold position outdoors while it improves.';
  if (pauseReason === 'unsafe-speed') return 'Walking rewards are held at vehicle speed. Stop safely and continue on foot.';
  if (pauseReason === 'screen-hidden') return 'Field progress is paused while World Explorer is hidden.';
  if (pauseReason === 'signal-lost' || pauseReason === 'waiting-for-fix') return 'Waiting for a fresh GPS fix. Your position and reward are held.';
  if (pauseReason) return 'Live GPS field progress is paused. Resume GPS-follow to continue.';
  if (state === 'interactable') return 'You are close enough. Hold position to complete this field stop.';
  if (state === 'approach') return `${Math.ceil(distanceMeters)} m away. Approach the marked field stop.`;
  if (state === 'nearby') return `${Math.ceil(distanceMeters)} m away. This field stop is nearby.`;
  return `${Math.ceil(distanceMeters)} m away. Walk toward the bearing to reveal this stop.`;
}

function evaluateLiveGpsFieldProximity(session, distanceMeters, runtime = {}) {
  const distance = Math.max(0, finite(distanceMeters, Infinity));
  const pauseReason = fieldPauseReason(runtime);
  let state = 'distant';
  if (pauseReason === 'accuracy-hold') state = 'accuracy-hold';
  else if (pauseReason === 'unsafe-speed') state = 'unsafe-speed';
  else if (pauseReason) state = 'access-blocked';
  else if (distance <= LIVE_GPS_FIELD_POLICY.interactionRadiusMeters) state = 'interactable';
  else if (distance <= LIVE_GPS_FIELD_POLICY.approachRadiusMeters) state = 'approach';
  else if (distance <= LIVE_GPS_FIELD_POLICY.nearbyRadiusMeters) state = 'nearby';
  const eligible = state === 'interactable';
  return Object.freeze({
    authority: 'live-gps-field-v1',
    movementClass: eligible || !pauseReason ? 'gps_walk' : pauseReason === 'unsafe-speed' ? 'gps_fast' : 'gps_walk',
    state,
    eligible,
    pauseReason,
    distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null,
    interactionRadiusMeters: LIVE_GPS_FIELD_POLICY.interactionRadiusMeters,
    message: proximityMessage(state, distance, pauseReason),
    trustedDistanceMeters: Number(finite(session?.trustedDistanceMeters, 0).toFixed(1))
  });
}

function liveGpsFieldSessionSnapshot(session, runtime = {}, now = Date.now()) {
  return Object.freeze({
    schemaVersion: 1,
    sessionId: session?.sessionId || null,
    startedAt: finite(session?.startedAt, null),
    durationSeconds: session?.startedAt ? Math.max(0, Math.round((now - session.startedAt) / 1000)) : 0,
    active: runtime.active === true,
    eligible: fieldPauseReason(runtime) === null,
    pauseReason: fieldPauseReason(runtime),
    movementClass: finite(runtime.speedMps, 0) > LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps ? 'gps_fast' : 'gps_walk',
    trustedDistanceMeters: Number(finite(session?.trustedDistanceMeters, 0).toFixed(1)),
    qualifiedFixes: Number(session?.qualifiedFixes || 0),
    acceptedDistanceSegments: Number(session?.acceptedDistanceSegments || 0),
    rejectedDistanceSegments: Number(session?.rejectedDistanceSegments || 0),
    inaccurateFixes: Number(session?.inaccurateFixes || 0),
    unsafeSpeedFixes: Number(session?.unsafeSpeedFixes || 0)
  });
}

export {
  LIVE_GPS_FIELD_POLICY,
  createLiveGpsFieldSession,
  evaluateLiveGpsFieldProximity,
  ingestLiveGpsFieldFix,
  liveGpsFieldSessionSnapshot
};
