import { copyFieldRecord as copy } from './field-study-contract.js';
import { METEOROLOGY_PROTOCOL, METEOROLOGY_CALIBRATION } from './meteorology-career.js';
// Volatile explicit instrument window. Only the existing gameplay tick can
// advance the working rig and its effort, through the same accepted seconds.
export function createMeteorologyRecorder({
  clock = () => performance.now(),
  wallClock = () => Date.now(),
} = {}) {
  let run = null,
    last = 0,
    disposed = false;
  const point = (p) => p && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]));
  function start(config, sample, read) {
    if (
      disposed ||
      !config?.runId ||
      !config.siteId ||
      !['a', 'b'].includes(config.stationId) ||
      !['baseline', 'verification'].includes(config.visit) ||
      !Number.isFinite(config.referenceTime) ||
      !point(sample?.observer) ||
      !sample.supported ||
      !Number.isFinite(config.metersPerUnit) ||
      config.metersPerUnit <= 0
    )
      throw Error('Stand at the supported weather station before deploying the sensor.');
    const initial = read();
    if (!initial?.sample || !point(initial.sensorPosition) || !point(initial.groundPosition))
      throw Error('Wait for the working weather instrument to load.');
    run = {
      ...copy(config),
      protocol: METEOROLOGY_PROTOCOL,
      truthType: 'virtual-weather-instruments',
      calibration: METEOROLOGY_CALIBRATION,
      startedAt: wallClock(),
      completedAt: 0,
      activeSeconds: 0,
      excludedSeconds: 0,
      observer: copy(sample.observer),
      sensorPosition: copy(initial.sensorPosition),
      groundPosition: copy(initial.groundPosition),
      heightMeters: initial.heightMeters,
      samples: [{ ...copy(initial.sample), activeSeconds: 0 }],
      ready: false,
      interrupted: false,
      reason: 'Sensor deployed; keep the observer at this station.',
    };
    last = clock();
  }
  function tick(dt, sample, { step = () => {}, read = () => ({}) } = {}) {
    if (!run || disposed || run.ready || run.interrupted) return;
    const r = run,
      now = clock(),
      elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    if (
      !point(sample?.observer) ||
      sample.runId !== r.runId ||
      sample.siteId !== r.siteId ||
      sample.stationId !== r.stationId ||
      sample.sceneId !== r.sceneId ||
      sample.liveGps ||
      sample.mode !== 'walk'
    ) {
      r.interrupted = true;
      r.reason = 'The station or travel mode changed. Restart this unfinished reading.';
      return;
    }
    if (sample.paused || sample.hidden || !sample.supported) {
      r.excludedSeconds += elapsed;
      r.reason = 'Reading paused until this station has supported walking.';
      return;
    }
    if (
      Math.hypot(
        sample.observer.x - r.observer.x,
        sample.observer.y - r.observer.y,
        sample.observer.z - r.observer.z
      ) *
        r.metersPerUnit >
      2.5
    ) {
      r.interrupted = true;
      r.reason = 'The observer moved away. Restart at the marked station.';
      return;
    }
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25);
    r.excludedSeconds += Math.max(0, elapsed - seconds);
    if (!seconds) return;
    try {
      step(seconds);
      r.activeSeconds += seconds;
      if (r.samples.length < 3 && r.activeSeconds >= [0, 4, 8][r.samples.length]) {
        const value = read();
        if (!value?.sample) throw Error('Missing sensor geometry');
        r.samples.push({ ...copy(value.sample), activeSeconds: r.activeSeconds });
      }
      r.ready = r.activeSeconds >= 8 && r.samples.length === 3;
      if (r.ready) {
        r.completedAt = wallClock();
        r.reason = 'Working sensor reading ready to save.';
      } else r.reason = r.samples.length + '/3 rotor, vane and replay sky samples';
    } catch {
      r.interrupted = true;
      r.reason = 'The sensor geometry became unavailable. Reopen this station and restart.';
    }
  }
  return {
    start,
    tick,
    snapshot: () => (run ? copy(run) : null),
    result() {
      if (!run?.ready || run.interrupted)
        throw Error('Complete the supported working sensor reading first.');
      return copy(run);
    },
    clear() {
      run = null;
    },
    dispose() {
      disposed = true;
      run = null;
    },
  };
}
