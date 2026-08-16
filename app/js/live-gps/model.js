const LIVE_GPS_POLICY = Object.freeze({
  staleAfterMs: 15_000,
  poorAccuracyMeters: 100,
  snapAccuracyLimitMeters: 30,
  snapDistanceMeters: 8,
  minimumDeadZoneMeters: 3,
  maximumDeadZoneMeters: 12,
  warningRadiusMeters: 9_000,
  recenterRadiusMeters: 10_000,
  hardPauseRadiusMeters: 11_000,
  signalLostAfterMs: 10_000,
  rawSampleLimit: 60
});

const EARTH_RADIUS_METERS = 6_371_000;

function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLongitude(longitude) {
  let value = finiteNumber(longitude);
  if (!Number.isFinite(value)) return NaN;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function validGeographicPoint(point) {
  const latitude = finiteNumber(point?.latitude);
  const longitude = finiteNumber(point?.longitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function haversineMeters(a, b) {
  if (!validGeographicPoint(a) || !validGeographicPoint(b)) return Infinity;
  const toRad = Math.PI / 180;
  const latA = a.latitude * toRad;
  const latB = b.latitude * toRad;
  const dLat = latB - latA;
  const dLon = (b.longitude - a.longitude) * toRad;
  const value = Math.sin(dLat * 0.5) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon * 0.5) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function geographicBearingDegrees(a, b) {
  if (!validGeographicPoint(a) || !validGeographicPoint(b)) return null;
  const toRad = Math.PI / 180;
  const latA = a.latitude * toRad;
  const latB = b.latitude * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const y = Math.sin(dLon) * Math.cos(latB);
  const x = Math.cos(latA) * Math.sin(latB) -
    Math.sin(latA) * Math.cos(latB) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function interpolateLongitude(from, to, amount) {
  let delta = normalizeLongitude(to) - normalizeLongitude(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLongitude(from + delta * amount);
}

function normalizeBrowserPosition(position, receivedAt = Date.now()) {
  const coords = position?.coords || position || {};
  const timestamp = finiteNumber(position?.timestamp, finiteNumber(coords.timestamp, receivedAt));
  return {
    latitude: finiteNumber(coords.latitude),
    longitude: normalizeLongitude(coords.longitude),
    accuracy: Math.max(0, finiteNumber(coords.accuracy, Infinity)),
    altitude: Number.isFinite(Number(coords.altitude)) ? Number(coords.altitude) : null,
    altitudeAccuracy: Number.isFinite(Number(coords.altitudeAccuracy)) ? Number(coords.altitudeAccuracy) : null,
    heading: Number.isFinite(Number(coords.heading)) ? ((Number(coords.heading) % 360) + 360) % 360 : null,
    speed: Number.isFinite(Number(coords.speed)) && Number(coords.speed) >= 0 ? Number(coords.speed) : null,
    timestamp,
    receivedAt: finiteNumber(receivedAt, Date.now())
  };
}

function boundaryStateForDistance(distanceMeters) {
  if (distanceMeters >= LIVE_GPS_POLICY.hardPauseRadiusMeters) return 'hard-pause';
  if (distanceMeters >= LIVE_GPS_POLICY.recenterRadiusMeters) return 'recenter-ready';
  if (distanceMeters >= LIVE_GPS_POLICY.warningRadiusMeters) return 'warning';
  return 'inside';
}

function movementClassForSpeed(speedMps) {
  if (!(speedMps >= 0.6)) return 'stationary';
  if (speedMps < 2.2) return 'walking';
  if (speedMps < 4.2) return 'running';
  return 'fast';
}

function createLiveGpsModel(options = {}) {
  const origin = validGeographicPoint(options.origin) ? {
    latitude: Number(options.origin.latitude),
    longitude: normalizeLongitude(options.origin.longitude)
  } : null;
  return {
    origin,
    lastAccepted: null,
    filtered: null,
    pendingJump: null,
    rawSamples: [],
    lastReceivedAt: 0,
    speedMps: 0,
    headingDegrees: null,
    boundaryDistanceMeters: 0,
    boundaryState: 'inside',
    counters: {
      received: 0,
      accepted: 0,
      invalid: 0,
      stale: 0,
      poorAccuracy: 0,
      jumpRejected: 0,
      jumpConfirmed: 0,
      deadZoneHeld: 0
    }
  };
}

function setLiveGpsOrigin(model, point) {
  if (!model || !validGeographicPoint(point)) return false;
  model.origin = {
    latitude: Number(point.latitude),
    longitude: normalizeLongitude(point.longitude)
  };
  if (model.filtered) {
    model.boundaryDistanceMeters = haversineMeters(model.origin, model.filtered);
    model.boundaryState = boundaryStateForDistance(model.boundaryDistanceMeters);
  } else {
    model.boundaryDistanceMeters = 0;
    model.boundaryState = 'inside';
  }
  return true;
}

function resetLiveGpsAtOrigin(model, point) {
  if (!setLiveGpsOrigin(model, point)) return false;
  const normalized = {
    ...point,
    latitude: Number(point.latitude),
    longitude: normalizeLongitude(point.longitude),
    accuracy: Math.max(0, finiteNumber(point.accuracy, 0))
  };
  model.lastAccepted = { ...normalized };
  model.filtered = { ...normalized };
  model.pendingJump = null;
  model.speedMps = 0;
  model.boundaryDistanceMeters = 0;
  model.boundaryState = 'inside';
  return true;
}

function rememberRawSample(model, fix) {
  model.rawSamples.push(fix);
  if (model.rawSamples.length > LIVE_GPS_POLICY.rawSampleLimit) {
    model.rawSamples.splice(0, model.rawSamples.length - LIVE_GPS_POLICY.rawSampleLimit);
  }
}

function ingestLiveGpsFix(model, position, now = Date.now()) {
  if (!model) throw new TypeError('Live GPS model is required.');
  const fix = normalizeBrowserPosition(position, now);
  model.counters.received += 1;
  model.lastReceivedAt = fix.receivedAt;
  rememberRawSample(model, fix);

  if (!validGeographicPoint(fix)) {
    model.counters.invalid += 1;
    return { accepted: false, reason: 'invalid', fix };
  }
  if (Math.max(0, now - fix.timestamp) > LIVE_GPS_POLICY.staleAfterMs) {
    model.counters.stale += 1;
    return { accepted: false, reason: 'stale', fix };
  }
  if (fix.accuracy > LIVE_GPS_POLICY.poorAccuracyMeters) {
    model.counters.poorAccuracy += 1;
    return { accepted: false, reason: 'poor-accuracy', fix };
  }

  const previous = model.lastAccepted;
  let dtSeconds = previous ? Math.max(0.001, (fix.timestamp - previous.timestamp) / 1000) : 1;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) dtSeconds = 1;
  const movementMeters = previous ? haversineMeters(previous, fix) : 0;

  if (previous) {
    const jumpLimit = Math.max(
      75,
      2.5 * (Math.max(0, previous.accuracy) + Math.max(0, fix.accuracy)) + 35 * dtSeconds
    );
    if (movementMeters > jumpLimit) {
      const confirmationRadius = Math.max(60, 2 * (fix.accuracy + (model.pendingJump?.accuracy || fix.accuracy)));
      const confirmed = model.pendingJump && haversineMeters(model.pendingJump, fix) <= confirmationRadius;
      if (!confirmed) {
        model.pendingJump = { ...fix };
        model.counters.jumpRejected += 1;
        return { accepted: false, reason: 'jump-quarantined', fix, movementMeters, jumpLimit };
      }
      model.counters.jumpConfirmed += 1;
    }
  }
  model.pendingJump = null;

  const filteredBefore = model.filtered;
  const distanceFromFiltered = filteredBefore ? haversineMeters(filteredBefore, fix) : Infinity;
  const deadZoneMeters = Math.max(
    LIVE_GPS_POLICY.minimumDeadZoneMeters,
    Math.min(LIVE_GPS_POLICY.maximumDeadZoneMeters, fix.accuracy * 0.35)
  );

  const derivedSpeed = previous ? movementMeters / dtSeconds : 0;
  const observedSpeed = fix.speed ?? derivedSpeed;
  const boundedObservedSpeed = Math.max(0, Math.min(55, observedSpeed));
  model.speedMps = previous
    ? model.speedMps * 0.72 + boundedObservedSpeed * 0.28
    : boundedObservedSpeed;

  if (!filteredBefore) {
    model.filtered = { ...fix };
  } else if (distanceFromFiltered < deadZoneMeters) {
    model.counters.deadZoneHeld += 1;
  } else {
    const motionClass = movementClassForSpeed(model.speedMps);
    const tauSeconds = motionClass === 'stationary' ? 4 : motionClass === 'fast' ? 0.75 : 2.25;
    const quality = Math.max(0.2, Math.min(1, 8 / Math.max(1, fix.accuracy)));
    const alpha = Math.max(0.08, Math.min(1, (1 - Math.exp(-dtSeconds / tauSeconds)) * quality));
    model.filtered = {
      ...fix,
      latitude: filteredBefore.latitude + (fix.latitude - filteredBefore.latitude) * alpha,
      longitude: interpolateLongitude(filteredBefore.longitude, fix.longitude, alpha),
      accuracy: filteredBefore.accuracy + (fix.accuracy - filteredBefore.accuracy) * alpha
    };
  }

  if (fix.heading !== null && boundedObservedSpeed >= 0.6) {
    model.headingDegrees = fix.heading;
  } else if (previous && movementMeters >= 8) {
    model.headingDegrees = geographicBearingDegrees(previous, fix);
  }

  model.lastAccepted = { ...fix };
  model.counters.accepted += 1;
  if (!model.origin) setLiveGpsOrigin(model, fix);
  model.boundaryDistanceMeters = haversineMeters(model.origin, model.filtered || fix);
  model.boundaryState = boundaryStateForDistance(model.boundaryDistanceMeters);

  return {
    accepted: true,
    reason: distanceFromFiltered < deadZoneMeters ? 'dead-zone-hold' : 'accepted',
    fix,
    filtered: model.filtered,
    movementMeters,
    speedMps: model.speedMps,
    movementClass: movementClassForSpeed(model.speedMps),
    boundaryDistanceMeters: model.boundaryDistanceMeters,
    boundaryState: model.boundaryState
  };
}

function liveGpsModelSnapshot(model, now = Date.now()) {
  const accuracy = finiteNumber(model?.lastAccepted?.accuracy, null);
  return {
    hasOrigin: !!model?.origin,
    hasFix: !!model?.filtered,
    accuracyMeters: accuracy,
    speedMps: Number(finiteNumber(model?.speedMps, 0).toFixed(2)),
    movementClass: movementClassForSpeed(finiteNumber(model?.speedMps, 0)),
    headingDegrees: Number.isFinite(model?.headingDegrees) ? Number(model.headingDegrees.toFixed(1)) : null,
    lastFixAgeMs: model?.lastReceivedAt ? Math.max(0, now - model.lastReceivedAt) : null,
    boundaryDistanceMeters: Number(finiteNumber(model?.boundaryDistanceMeters, 0).toFixed(1)),
    boundaryState: model?.boundaryState || 'inside',
    counters: { ...(model?.counters || {}) },
    retainedRawSamples: model?.rawSamples?.length || 0
  };
}

export {
  LIVE_GPS_POLICY,
  boundaryStateForDistance,
  createLiveGpsModel,
  geographicBearingDegrees,
  haversineMeters,
  ingestLiveGpsFix,
  liveGpsModelSnapshot,
  movementClassForSpeed,
  normalizeBrowserPosition,
  resetLiveGpsAtOrigin,
  setLiveGpsOrigin,
  validGeographicPoint
};
