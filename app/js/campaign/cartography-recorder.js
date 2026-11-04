import { copyFieldRecord as copy, fieldDistance } from './field-study-contract.js';
import { CARTOGRAPHY_PROTOCOL } from './cartography-career.js';
// One volatile recorder driven by the existing gameplay tick. No movement writes.
export function createCartographyRecorder({
  clock = () => performance.now(),
  wallClock = () => Date.now(),
} = {}) {
  let r = null,
    last = 0,
    previous = null;
  const reset = () => {
    r = null;
    previous = null;
  };
  const valid = (s) =>
    s?.supported &&
    s.mode === 'walk' &&
    !s.liveGps &&
    s.position &&
    Number.isFinite(s.heightMeters);
  const point = (s, t) => ({
    position: copy(s.position),
    heightMeters: s.heightMeters,
    surfaceKind: s.surfaceKind,
    supported: true,
    activeSeconds: t,
  });
  function start(config, s) {
    if (!valid(s) || s.paused || s.hidden)
      throw Error('Start from the supported route control in outdoor walking mode.');
    r = {
      ...copy(config),
      protocol: CARTOGRAPHY_PROTOCOL,
      startedAt: wallClock(),
      completedAt: 0,
      activeSeconds: 0,
      excludedSeconds: 0,
      samples: [point(s, 0)],
      ready: false,
      interrupted: false,
      reason: 'Survey recording; follow the connected route to the next control.',
    };
    last = clock();
    previous = copy(s);
  }
  function tick(dt, s) {
    if (!r || r.ready || r.interrupted) return;
    const now = clock(),
      elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    if (s?.paused || s?.hidden) {
      r.excludedSeconds += elapsed;
      return;
    }
    if (
      !valid(s) ||
      s.runId !== r.runId ||
      s.legIndex !== r.legIndex ||
      s.siteId !== r.siteId ||
      s.sceneId !== r.sceneId
    ) {
      r.interrupted = true;
      r.reason = 'Return to the previous control and restart this unfinished leg.';
      return;
    }
    const seconds = Math.min(Math.max(0, Number(dt) || 0), elapsed, 0.25),
      d = fieldDistance(previous.position, s.position);
    if (d > 4 || d > Math.max(0.3, seconds * 8)) {
      r.interrupted = true;
      r.reason = 'Movement changed discontinuously. Restart at the previous control.';
      return;
    }
    r.activeSeconds += seconds;
    r.excludedSeconds += Math.max(0, elapsed - seconds);
    previous = copy(s);
    const anchor = r.samples.at(-1),
      span = fieldDistance(anchor.position, s.position),
      arrived = fieldDistance(s.position, r.destination) < 0.7;
    if (span >= 0.75 || (arrived && span > 0.02)) {
      if (r.samples.length >= 256) {
        r.interrupted = true;
        r.reason = 'This leg exceeded the survey sample limit. Restart at the previous control.';
        return;
      }
      r.samples.push(point(s, r.activeSeconds));
    }
    if (arrived && r.activeSeconds >= 1 && r.samples.length >= 3) {
      r.ready = true;
      r.completedAt = wallClock();
      r.reason = 'Leg measured. Open this control to save the reading.';
    }
  }
  return {
    start,
    tick,
    clear: reset,
    snapshot: () => (r ? copy(r) : null),
    prepare() {
      if (!r?.ready || r.interrupted)
        throw Error(r?.reason || 'Start and walk this leg from the previous control.');
      return copy(r);
    },
    dispose: reset,
  };
}
