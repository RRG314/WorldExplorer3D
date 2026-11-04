import { copyFieldRecord as copy } from './field-study-contract.js';
// The field plugin supplies this tick. Motion and elapsed effort share one
// accepted clock; no timer, renderer, storage or avatar movement is owned here.
export function createHydrologyRecorder({
  clock = () => performance.now(),
  wallClock = Date.now,
} = {}) {
  let run = null,
    last = 0,
    disposed = false;
  const point = (p) => p && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]));
  function start(config, sample) {
    if (
      disposed ||
      !config?.runId ||
      !config.siteId ||
      !['trace', 'measure'].includes(config.kind) ||
      !point(sample?.observer) ||
      !sample.supported ||
      !Number.isFinite(config.metersPerUnit) ||
      config.metersPerUnit <= 0
    )
      throw Error('Stand on the supported dry bank before starting the instrument.');
    run = {
      ...copy(config),
      startedAt: wallClock(),
      completedAt: 0,
      at: 0,
      activeSeconds: 0,
      excludedSeconds: 0,
      observer: { ...sample.observer },
      ready: false,
      interrupted: false,
      reason: 'Instrument started',
      lanes: [],
      optical: [],
      section: null,
      from: null,
      to: null,
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
      !point(sample.observer) ||
      sample.runId !== r.runId ||
      sample.siteId !== r.siteId ||
      sample.stationId !== r.stationId ||
      sample.sceneId !== r.sceneId ||
      sample.liveGps ||
      sample.mode !== 'walk'
    ) {
      r.interrupted = true;
      r.reason = 'The site or observer mode changed. Restart this unfinished reading.';
      return;
    }
    if (sample.paused || sample.hidden || !sample.supported) {
      r.excludedSeconds += elapsed;
      r.reason = 'Paused until the bank and instrument are supported.';
      return;
    }
    const drift =
      Math.hypot(
        sample.observer.x - r.observer.x,
        sample.observer.y - r.observer.y,
        sample.observer.z - r.observer.z
      ) * r.metersPerUnit;
    if (drift > 2.5) {
      r.interrupted = true;
      r.reason = 'The bank viewpoint moved. Restart this unfinished reading.';
      return;
    }
    if (r.kind === 'trace' && read().clearView !== true) {
      r.excludedSeconds += elapsed;
      r.reason = 'Aim at the visible stream float; effort begins only with a clear view.';
      return;
    }
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25);
    r.excludedSeconds += Math.max(0, elapsed - seconds);
    if (!seconds) return;
    const before = r.activeSeconds;
    r.activeSeconds += seconds;
    step(seconds);
    const value = read();
    if (r.kind === 'trace') {
      if (value.clearView !== true || !point(value.position)) {
        r.interrupted = true;
        r.reason = 'Keep the visible reach and its moving float in view.';
        return;
      }
      r.from ||= copy(value.position);
      r.to = copy(value.position);
      const moved =
        Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y, r.to.z - r.from.z) * r.metersPerUnit;
      if (r.activeSeconds >= 2 && moved >= 0.15) {
        r.ready = true;
        r.clearView = true;
      }
    } else {
      if (
        !value.section ||
        !Array.isArray(value.lanes) ||
        value.lanes.length !== 3 ||
        !Array.isArray(value.paths) ||
        value.paths.length !== 9
      ) {
        r.interrupted = true;
        r.reason = 'The instrument geometry is unavailable. Restart after it loads.';
        return;
      }
      r.section ||= copy(value.section);
      if (!['left', 'right', 'surface', 'bed'].every((k) => point(r.section[k]))) {
        r.interrupted = true;
        r.reason = 'The measured channel section became unavailable.';
        return;
      }
      r.widthMeters =
        Math.hypot(
          r.section.right.x - r.section.left.x,
          r.section.right.y - r.section.left.y,
          r.section.right.z - r.section.left.z
        ) * r.metersPerUnit;
      r.depthMeters = (r.section.surface.y - r.section.bed.y) * r.metersPerUnit;
      for (const [i, lane] of value.lanes.entries()) {
        if (!point(lane.start) || !point(lane.end) || !Number.isFinite(lane.progress)) {
          r.interrupted = true;
          r.reason = 'A float measurement became unavailable.';
          return;
        }
        r.lanes[i] ||= {
          index: i,
          startPosition: copy(lane.start),
          endPosition: copy(lane.end),
          startedAt: 0,
          finishedAt: null,
          previousProgress: 0,
        };
        const row = r.lanes[i];
        if (row.finishedAt === null && lane.progress >= 1) {
          const fraction = (1 - row.previousProgress) / (lane.progress - row.previousProgress || 1);
          row.finishedAt = before + Math.max(0, Math.min(1, fraction)) * seconds;
        }
        row.previousProgress = lane.progress;
      }
      if (r.optical.length < 3 && r.activeSeconds >= [0, 3, 6][r.optical.length])
        r.optical.push({ activeSeconds: r.activeSeconds, paths: copy(value.paths) });
      r.ready =
        r.activeSeconds >= 8 &&
        r.lanes.every((l) => Number.isFinite(l.finishedAt)) &&
        r.optical.length === 3;
    }
    if (r.ready) {
      r.completedAt = r.at = wallClock();
      r.reason = 'Matched instrument reading ready to save';
    } else
      r.reason =
        r.kind === 'trace'
          ? 'Trace the moving float through the visible reach'
          : `${r.lanes.filter((l) => Number.isFinite(l.finishedAt)).length}/3 metre transits · ${r.optical.length}/3 optical readings`;
  }
  return {
    start,
    tick,
    snapshot: () => (run ? copy(run) : null),
    result() {
      if (!run?.ready || run.interrupted)
        throw Error('Complete the supported instrument reading first.');
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
