// Volatile instruments for an explicit observation. The existing gameplay
// owner's normal update supplies ticks; no timer, render loop or writes live here.
export function createFieldEffortRecorder({
  clock = () => performance.now(),
  wallClock = () => Date.now()
} = {}) {
  let recording = null,
    lastTick = 0,
    previous = null,
    disposed = false;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function start(config, position) {
    if (
      disposed ||
      !config?.runId ||
      !config.habitatId ||
      !config.method ||
      !Number.isFinite(config.seconds) ||
      config.seconds <= 0 ||
      !Number.isFinite(config.metersPerUnit) ||
      config.metersPerUnit <= 0 ||
      !Number.isFinite(position?.x) ||
      !Number.isFinite(position?.z)
    )
      throw Error('The observation instrument is not ready.');
    const now = wallClock();
    lastTick = clock();
    previous = { x: position.x, z: position.z };
    recording = {
      config,
      runId: config.runId,
      habitatId: config.habitatId,
      method: config.method,
      startedAt: now,
      endedAt: 0,
      activeSeconds: 0,
      distanceMeters: 0,
      observerDistanceMeters: 0,
      routeGates: [],
      observations: new Map(),
      triggerKeys: new Set(),
      supported: true,
      liveGps: false,
      interrupted: false,
      reason: '',
      complete: false,
      excludedSeconds: 0,
      sensor: { aligned: false }
    };
  }
  function tick(dt, sample = {}) {
    if (!recording || recording.complete || disposed) return;
    const r = recording,
      nowTick = clock(),
      elapsed = Math.max(0, (nowTick - lastTick) / 1000);
    lastTick = nowTick;
    const p = sample.position;
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) {
      r.reason = 'Wait for supported walking position.';
      return;
    }
    const distance = Math.hypot(p.x - previous.x, p.z - previous.z) * r.config.metersPerUnit;
    previous = { x: p.x, z: p.z };
    if (sample.liveGps || sample.walking === false) {
      r.interrupted = true;
      r.reason = 'The walking mode changed. Restart this observation.';
      return;
    }
    if (sample.paused || sample.hidden || sample.supported !== true) {
      r.excludedSeconds += elapsed;
      r.reason = sample.supported === false ? 'Return to supported ground.' : 'Observation paused.';
      return;
    }
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25);
    if (!seconds) return;
    r.excludedSeconds += Math.max(0, elapsed - seconds);
    if (distance > Math.max(1, elapsed * 8)) {
      r.interrupted = true;
      r.reason = 'The position changed too far for this observation. Restart at the marker.';
      return;
    }
    r.observerDistanceMeters += distance;
    if (r.config.trackDistance !== false) r.distanceMeters += distance;
    if (r.config.stationary && r.distanceMeters > 0.8) {
      r.interrupted = true;
      r.reason = 'A stationary watch must stay in one place. Restart at the marker.';
      return;
    }
    if (r.config.contains && !r.config.contains(p)) {
      r.interrupted = true;
      r.reason = 'Stay inside the marked transect. Restart at its start.';
      return;
    }
    if (r.interrupted) return;
    const gates = r.config.gates || [],
      next = gates[r.routeGates.length];
    if (
      next &&
      Math.hypot(p.x - next.x, p.z - next.z) * r.config.metersPerUnit <= (next.radiusMeters || 0.7)
    )
      r.routeGates.push(next.id);
    r.sensor.aligned = sample.sensorAligned === true;
    if (r.config.sensor && !r.sensor.aligned) {
      r.excludedSeconds += seconds;
      r.reason = 'Align the mounted camera with its marked detection path.';
      return;
    }
    r.activeSeconds += seconds;
    r.reason = 'Observing';
    const now = wallClock();
    for (const row of sample.observations || []) {
      if (!row?.id || !row.taxon || (r.observations.size >= 16 && !r.observations.has(row.id)))
        continue;
      const prior = r.observations.get(row.id),
        key = row.triggerKey;
      if (r.config.sensor && (!key || r.triggerKeys.has(key))) {
        if (prior) prior.lastAt = now;
        continue;
      }
      if (key) r.triggerKeys.add(key);
      if (prior) {
        prior.lastAt = now;
        if (r.config.sensor) prior.detections++;
      } else
        r.observations.set(row.id, {
          id: row.id,
          taxon: row.taxon,
          source: row.source,
          behavior: row.behavior || null,
          truthType: 'virtual-training-observation',
          visible: row.visible === true,
          firstAt: now,
          lastAt: now,
          detections: 1
        });
    }
    const routeComplete = r.routeGates.length === gates.length;
    if (r.activeSeconds + 1e-8 >= r.config.seconds && routeComplete) {
      r.activeSeconds = Math.max(r.config.seconds, r.activeSeconds);
      r.complete = true;
      r.endedAt = now;
      r.reason = 'Observation ready to record.';
    }
  }
  function snapshot() {
    if (!recording) return null;
    const { config, observations, triggerKeys, ...r } = recording;
    return {
      ...copy(r),
      activeSeconds: Number(r.activeSeconds.toFixed(6)),
      distanceMeters: Number(r.distanceMeters.toFixed(6)),
      observerDistanceMeters: Number(r.observerDistanceMeters.toFixed(6)),
      targetSeconds: config.seconds,
      observations: [...observations.values()].sort((a, b) => a.id.localeCompare(b.id)).map(copy)
    };
  }
  return {
    start,
    tick,
    snapshot,
    clear() {
      recording = null;
      previous = null;
    },
    dispose() {
      disposed = true;
      recording = null;
      previous = null;
    }
  };
}

// The detector shares the observation's accepted active clock. Frame stalls
// must not turn one virtual trajectory into extra camera events.
export function createFieldMotionRecorder({
  metersPerUnit = 1,
  cooldownSeconds = 1.8,
  minimumMotionMeters = 0.006
} = {}) {
  const subjects = new Map();
  return {
    observe(id, position, seen, activeSeconds) {
      if (
        !id ||
        !Number.isFinite(activeSeconds) ||
        activeSeconds < 0 ||
        !Number.isFinite(position?.x) ||
        !Number.isFinite(position?.z)
      )
        return null;
      if (!subjects.has(id) && subjects.size >= 16) return null;
      const previous = subjects.get(id),
        moved =
          previous &&
          Math.hypot(position.x - previous.x, position.z - previous.z) * metersPerUnit >
            minimumMotionMeters;
      const trigger =
        seen &&
        moved &&
        (previous.triggerAt === null ||
          activeSeconds - previous.triggerAt + 1e-8 >= cooldownSeconds);
      const next = {
        x: position.x,
        z: position.z,
        triggerAt: trigger ? activeSeconds : (previous?.triggerAt ?? null),
        sequence: (previous?.sequence || 0) + (trigger ? 1 : 0)
      };
      subjects.set(id, next);
      return trigger ? `${id}:${next.sequence}` : null;
    },
    clear() {
      subjects.clear();
    }
  };
}
