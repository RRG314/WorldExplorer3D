import { haversineMeters } from './model.js?v=1';

const LIVE_GPS_FIELD_POLICY = Object.freeze({
  schemaVersion: 2,
  foregroundOnly: true,
  rawRouteStored: false,
  competitiveRewards: false,
  serverLocationReceipt: false,
  offlineAfterWorldLoad: true,
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
    schemaVersion: LIVE_GPS_FIELD_POLICY.schemaVersion,
    sessionId: String(options.sessionId || `field-${Math.round(startedAt).toString(36)}`),
    startedAt,
    consent: Object.freeze({
      granted: options.consentGranted === true,
      grantedAt: options.consentGranted === true ? finite(options.consentedAt, startedAt) : null,
      source: String(options.consentSource || 'live-gps-permission-panel')
    }),
    secureContext: options.secureContext === true,
    privacy: Object.freeze({
      rawRouteStored: false,
      rawFixHistoryStored: false,
      currentQualifiedFixEphemeral: true,
      retention: 'aggregate-distance-and-quality-counters-only'
    }),
    rewardPolicy: Object.freeze({
      personalVirtualRecord: true,
      competitive: false,
      locationReward: false,
      reason: 'no-server-location-receipt'
    }),
    movementSource: 'live-gps',
    currentQuality: null,
    proximityTargetId: null,
    proximityState: 'distant',
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
  const qualified = session.consent?.granted === true && session.secureContext === true &&
    accuracy <= LIVE_GPS_FIELD_POLICY.maximumInteractionAccuracyMeters &&
    speedMps <= LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps;

  if (accuracy > LIVE_GPS_FIELD_POLICY.maximumInteractionAccuracyMeters) session.inaccurateFixes += 1;
  if (speedMps > LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps) session.unsafeSpeedFixes += 1;
  session.currentQuality = Object.freeze({ accuracyMeters: accuracy, speedMps, receivedAt });

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
  return Object.freeze({
    qualified,
    creditedMeters: Number(creditedMeters.toFixed(1)),
    accuracyMeters: accuracy,
    speedMps,
    personalRecordEligible: qualified,
    competitiveRewardEligible: false
  });
}

function fieldPauseReason(runtime = {}, session = null) {
  if (session && session.consent?.granted !== true) return 'consent-required';
  if (session && session.secureContext !== true) return 'insecure-context';
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
  if (pauseReason === 'consent-required') return 'Live GPS consent is required before field progress can begin.';
  if (pauseReason === 'insecure-context') return 'Live GPS field progress requires the secure HTTPS app.';
  if (pauseReason === 'accuracy-hold') return 'GPS accuracy is too broad for this stop. Hold position outdoors while it improves.';
  if (pauseReason === 'unsafe-speed') return 'Walking field progress is held at vehicle speed. Stop safely and continue on foot.';
  if (pauseReason === 'screen-hidden') return 'Field progress is paused while World Explorer is hidden.';
  if (pauseReason === 'signal-lost' || pauseReason === 'waiting-for-fix') return 'Waiting for a fresh GPS fix. Your position and field progress are held.';
  if (pauseReason) return 'Live GPS field progress is paused. Resume GPS-follow to continue.';
  if (state === 'access-blocked') return 'This field stop has no safe modeled approach. Choose another stop and stay on a permitted public route.';
  if (state === 'interactable') return 'You are close enough. Hold position on a permitted public route to complete this virtual field stop.';
  if (state === 'approach') return `${Math.ceil(distanceMeters)} m away. Approach only by a permitted public route and follow local signs.`;
  if (state === 'nearby') return `${Math.ceil(distanceMeters)} m away. This field stop is nearby.`;
  return `${Math.ceil(distanceMeters)} m away. Walk toward the bearing to reveal this stop.`;
}

function evaluateLiveGpsFieldProximity(session, distanceMeters, runtime = {}, targetEvidence = {}) {
  const distance = Math.max(0, finite(distanceMeters, Infinity));
  const pauseReason = fieldPauseReason(runtime, session);
  const targetId = String(targetEvidence?.targetId || 'field-target');
  const retainedInteraction = session?.proximityTargetId === targetId &&
    session?.proximityState === 'interactable' &&
    distance <= LIVE_GPS_FIELD_POLICY.interactionRadiusMeters + 6;
  let state = 'distant';
  if (pauseReason === 'accuracy-hold') state = 'accuracy-hold';
  else if (pauseReason === 'unsafe-speed') state = 'unsafe-speed';
  else if (pauseReason) state = 'access-blocked';
  else if (retainedInteraction || distance <= LIVE_GPS_FIELD_POLICY.interactionRadiusMeters) state = 'interactable';
  else if (distance <= LIVE_GPS_FIELD_POLICY.approachRadiusMeters) state = 'approach';
  else if (distance <= LIVE_GPS_FIELD_POLICY.nearbyRadiusMeters) state = 'nearby';
  const accessEvidence = String(targetEvidence?.accessEvidence || 'unknown');
  const stableSurface = targetEvidence?.stableSurface === true;
  const buildingClear = targetEvidence?.buildingClear === true;
  const approachReady = stableSurface && buildingClear;
  if (!pauseReason && !approachReady) state = 'access-blocked';
  const eligible = state === 'interactable';
  if (session) {
    session.proximityTargetId = targetId;
    session.proximityState = state;
  }
  return Object.freeze({
    authority: 'live-gps-field-v2',
    movementClass: eligible || !pauseReason ? 'gps_walk' : pauseReason === 'unsafe-speed' ? 'gps_fast' : 'gps_walk',
    state,
    eligible,
    pauseReason,
    distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null,
    interactionRadiusMeters: LIVE_GPS_FIELD_POLICY.interactionRadiusMeters,
    interactionExitRadiusMeters: LIVE_GPS_FIELD_POLICY.interactionRadiusMeters + 6,
    message: proximityMessage(state, distance, pauseReason),
    trustedDistanceMeters: Number(finite(session?.trustedDistanceMeters, 0).toFixed(1)),
    approachEvidence: Object.freeze({
      stableSurface,
      buildingClear,
      barrierEvidence: String(targetEvidence?.barrierEvidence || 'not-asserted'),
      accessEvidence,
      accessClaim: false,
      guidance: 'Stay on a permitted public route and follow local signs.'
    }),
    rewardEligibility: Object.freeze({
      personalVirtualRecord: eligible,
      competitive: false,
      locationReward: false,
      reason: accessEvidence === 'unknown' ? 'access-unknown-and-no-server-receipt' : 'no-server-location-receipt'
    })
  });
}

function liveGpsFieldSessionSnapshot(session, runtime = {}, now = Date.now()) {
  const pauseReason = fieldPauseReason(runtime, session);
  return Object.freeze({
    schemaVersion: LIVE_GPS_FIELD_POLICY.schemaVersion,
    sessionId: session?.sessionId || null,
    startedAt: finite(session?.startedAt, null),
    durationSeconds: session?.startedAt ? Math.max(0, Math.round((now - session.startedAt) / 1000)) : 0,
    active: runtime.active === true,
    eligible: pauseReason === null,
    pauseReason,
    movementClass: finite(runtime.speedMps, 0) > LIVE_GPS_FIELD_POLICY.maximumEligibleSpeedMps ? 'gps_fast' : 'gps_walk',
    movementSource: session?.movementSource || 'live-gps',
    foreground: runtime.visibilityPaused !== true,
    accuracyMeters: finite(runtime.accuracyMeters ?? session?.currentQuality?.accuracyMeters, null),
    speedMps: finite(runtime.speedMps ?? session?.currentQuality?.speedMps, null),
    trustedDistanceMeters: Number(finite(session?.trustedDistanceMeters, 0).toFixed(1)),
    qualifiedFixes: Number(session?.qualifiedFixes || 0),
    acceptedDistanceSegments: Number(session?.acceptedDistanceSegments || 0),
    rejectedDistanceSegments: Number(session?.rejectedDistanceSegments || 0),
    inaccurateFixes: Number(session?.inaccurateFixes || 0),
    unsafeSpeedFixes: Number(session?.unsafeSpeedFixes || 0),
    consent: session?.consent || Object.freeze({ granted: false, grantedAt: null, source: 'none' }),
    privacy: session?.privacy || Object.freeze({ rawRouteStored: false, rawFixHistoryStored: false }),
    rewardPolicy: session?.rewardPolicy || Object.freeze({ personalVirtualRecord: true, competitive: false, locationReward: false }),
    policy: LIVE_GPS_FIELD_POLICY,
    offlinePolicy: 'local-field-records-available-after-world-load'
  });
}

export {
  LIVE_GPS_FIELD_POLICY,
  createLiveGpsFieldSession,
  evaluateLiveGpsFieldProximity,
  ingestLiveGpsFieldFix,
  liveGpsFieldSessionSnapshot
};
