import { copyFieldRecord as copy } from './field-study-contract.js';
import { marinePoint } from './marine-study-contract.js';

// A volatile instrument driven only by the existing marine frame owner. No
// timers, animals, renderer, durable writes or rewards are owned here.
export function createMarineObservationRecorder({
  clock = () => performance.now(),
  wallClock = () => Date.now(),
} = {}) {
  let run = null,
    previous = null,
    lastTick = 0,
    disposed = false;
  const distance = (a, b, u) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * u;
  function start(config, sample) {
    if (
      disposed ||
      !config?.runId ||
      !config.voyageId ||
      !config.subId ||
      !['surface', 'habitat', 'follow'].includes(config.kind) ||
      !config.method ||
      !Number.isFinite(config.seconds) ||
      config.seconds < 8 ||
      config.seconds > 60 ||
      !Number.isFinite(config.metersPerUnit) ||
      config.metersPerUnit <= 0 ||
      !marinePoint(sample?.position) ||
      sample.supported !== true ||
      (config.kind === 'follow' && !config.individualId) ||
      (config.method === 'habitat-transect-v1' &&
        (!Array.isArray(config.gates) ||
          config.gates.length !== 2 ||
          !config.gates.every(marinePoint)))
    )
      throw Error('Bring the observation instrument to a supported viewing station.');
    const at = wallClock();
    lastTick = clock();
    previous = { ...sample.position };
    run = {
      config: copy(config),
      startedAt: at,
      completedAt: 0,
      activeSeconds: 0,
      excludedSeconds: 0,
      startPosition: { ...sample.position },
      endPosition: { ...sample.position },
      maximumDriftMeters: 0,
      distanceMeters: 0,
      gateIndex: 0,
      observations: [],
      contexts: [],
      trajectory: [],
      ready: false,
      interrupted: false,
      reason: 'Observation started',
    };
  }
  function tick(dt, sample = {}) {
    if (!run || run.ready || run.interrupted || disposed) return;
    const r = run,
      c = r.config,
      at = wallClock(),
      now = clock(),
      elapsed = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (
      (c.sceneId && sample.sceneId !== c.sceneId) ||
      sample.voyageId !== c.voyageId ||
      sample.subId !== c.subId ||
      sample.shared ||
      sample.liveGps ||
      !marinePoint(sample.position)
    ) {
      r.interrupted = true;
      r.reason = 'The vessel or observation mode changed. Restart this unfinished window.';
      return;
    }
    const moved = distance(sample.position, previous, c.metersPerUnit);
    previous = { ...sample.position };
    r.endPosition = { ...sample.position };
    r.maximumDriftMeters = Math.max(
      r.maximumDriftMeters,
      distance(sample.position, r.startPosition, c.metersPerUnit)
    );
    if (sample.paused || sample.hidden || sample.supported !== true) {
      r.excludedSeconds += elapsed;
      r.reason = 'Observation paused until the viewing station is supported.';
      return;
    }
    if (moved > Math.max(1, elapsed * 8)) {
      r.interrupted = true;
      r.reason = 'The observer moved too far for a continuous watch.';
      return;
    }
    if (
      c.kind !== 'follow' &&
      c.method !== 'habitat-transect-v1' &&
      (r.maximumDriftMeters > 2 || Math.abs(sample.speedMetersPerSecond || 0) > 0.5)
    ) {
      r.interrupted = true;
      r.reason = 'The stationary viewpoint moved. Begin a fresh matched watch.';
      return;
    }
    const valid = (sample.observations || []).filter(
      (o) =>
        o &&
        o.truthType === 'simulated-licensed-animal' &&
        o.visible === true &&
        o.lineClear === true &&
        typeof o.individualId === 'string' &&
        o.individualId.length <= 180 &&
        typeof o.speciesId === 'string' &&
        marinePoint(o.position) &&
        Number.isFinite(o.distanceMeters) &&
        Number.isFinite(o.minimumDistanceMeters) &&
        o.distanceMeters >= o.minimumDistanceMeters &&
        o.minimumDistanceMeters >= 3 &&
        o.distanceMeters <= 160
    );
    const subject =
      c.kind === 'follow' ? valid.find((o) => o.individualId === c.individualId) : null;
    if (c.kind === 'follow' && !subject) {
      r.excludedSeconds += elapsed;
      r.reason = 'Keep the same individual in clear view at a respectful distance.';
      return;
    }
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25);
    r.excludedSeconds += Math.max(0, elapsed - seconds);
    if (!seconds) return;
    r.activeSeconds += seconds;
    r.distanceMeters += moved;
    if (
      c.method === 'habitat-transect-v1' &&
      r.gateIndex < c.gates.length &&
      distance(sample.position, c.gates[r.gateIndex], c.metersPerUnit) <= 2
    )
      r.gateIndex++;
    for (const item of valid) {
      const old = r.observations.find((o) => o.individualId === item.individualId);
      if (!old && r.observations.length < 64)
        r.observations.push({ ...copy(item), firstSeenAt: at, lastSeenAt: at });
      else if (old) old.lastSeenAt = at;
    }
    if (
      r.contexts.length < 3 &&
      (!r.contexts.length || r.activeSeconds - r.contexts.at(-1).activeSeconds >= 3)
    )
      r.contexts.push({ activeSeconds: r.activeSeconds, at, ...copy(sample.context || {}) });
    if (
      subject &&
      (!r.trajectory.length || r.activeSeconds - r.trajectory.at(-1).activeSeconds >= 2.5)
    ) {
      r.trajectory.push({
        individualId: subject.individualId,
        position: { ...subject.position },
        at,
        activeSeconds: r.activeSeconds,
        distanceMeters: subject.distanceMeters,
      });
      if (r.trajectory.length > 4) r.trajectory.shift();
    }
    const trajectoryDistance = r.trajectory
      .slice(1)
      .reduce(
        (sum, p, i) => sum + distance(p.position, r.trajectory[i].position, c.metersPerUnit),
        0
      );
    const complete =
      r.activeSeconds >= c.seconds &&
      (c.method !== 'habitat-transect-v1' || (r.gateIndex === 2 && r.distanceMeters >= 12)) &&
      (c.kind !== 'follow' || (r.trajectory.length >= 3 && trajectoryDistance >= 1));
    if (complete) {
      r.ready = true;
      r.completedAt = at;
      r.reason = 'Observation window is ready to file';
    } else
      r.reason =
        c.kind === 'follow'
          ? 'Same individual in clear view'
          : c.method === 'habitat-transect-v1'
            ? `Transect gates ${r.gateIndex}/2`
            : 'Matched watch in progress';
  }
  return {
    start,
    tick,
    snapshot: () => (run ? copy(run) : null),
    result() {
      if (!run?.ready || run.interrupted)
        throw Error('Complete this supported observation window before filing it.');
      return copy(run);
    },
    reset() {
      run = null;
      previous = null;
    },
    dispose() {
      disposed = true;
      run = null;
      previous = null;
    },
  };
}
