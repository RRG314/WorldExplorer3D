import { createFieldEffortRecorder } from './field-effort-recorder.js';
import { astronomyTarget, astronomyFrameRole, astronomyExposurePlan } from './astronomy-career.js';
import {
  astronomyAxis,
  astronomySeparation,
  syntheticDetectorFrame,
  encodeDetectorFrame,
} from './astronomy-instrument.js';
export function createAstronomyTools(
  runtime,
  qualified,
  presentation,
  { getState, isCurrent = () => true } = {}
) {
  const recorder = createFieldEffortRecorder(),
    u = qualified.metersPerUnit;
  let disposed = false,
    binding = null,
    frozen = null,
    seed = null;
  const active = () => getState().active;
  function clear() {
    recorder.clear();
    binding = null;
    frozen = null;
    seed = null;
  }
  function currentWindow() {
    if (disposed) return null;
    const a = active(),
      role = astronomyFrameRole(a);
    if (
      binding &&
      (binding.runId !== a.runId ||
        binding.role !== role ||
        binding.revision !== getState().revision)
    )
      clear();
    return recorder.snapshot();
  }
  function observer() {
    const w = runtime.Walk?.state?.walker,
      g = w && runtime.SurfaceQuery.walkAt?.(w.x, w.z, { currentY: w.y }),
      id = astronomyTarget(active()),
      p = qualified.points[id];
    return {
      position: w ? { x: w.x, z: w.z } : null,
      supported:
        !!w &&
        w.onGround === true &&
        Number.isFinite(g?.position?.y) &&
        Math.abs(w.y - g.position.y) * u <= 2.5 &&
        !runtime.worldLoading &&
        !runtime.activeInterior,
      walking: runtime.getEnv?.() === 'EARTH' && runtime.getCurrentTravelMode?.() === 'walk',
      liveGps: !!runtime.getLiveGpsSnapshot?.().active,
      paused: !!runtime.paused,
      hidden: document.hidden,
      near: !!w && !!p && Math.hypot(w.x - p.x, w.z - p.z) * u <= 3,
    };
  }
  function ensure() {
    if (disposed || !isCurrent()) throw Error('The observing instruments are closed.');
  }
  function start({ restart = false } = {}) {
    ensure();
    const existing = currentWindow();
    if (existing && !restart) return existing;
    const a = active(),
      role = astronomyFrameRole(a),
      s = observer(),
      plan = astronomyExposurePlan(a, role);
    if (!role || !s.near || !s.supported || !s.walking || s.liveGps)
      throw Error('Stand on supported ground beside this observing station.');
    const optics = presentation.prepare(role),
      aligned =
        astronomySeparation(
          optics.axis,
          astronomyAxis(plan.pointing.azimuth, plan.pointing.altitude)
        ) <= 0.025;
    if (!aligned || (role === 'dark' ? !optics.covered : !optics.clear))
      throw Error(
        role === 'dark'
          ? 'Close the real detector cover before the reference exposure.'
          : 'The telescope aperture is obstructed or out of alignment.'
      );
    clear();
    seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    binding = { runId: a.runId, role, revision: getState().revision };
    recorder.start(
      {
        runId: a.runId,
        habitatId: a.site.id + ':' + role,
        method: 'astronomy-exposure',
        seconds: plan.seconds,
        metersPerUnit: u,
        stationary: true,
        sensor: true,
        contains: (p) => {
          const c = qualified.points[astronomyTarget(a)];
          return Math.hypot(p.x - c.x, p.z - c.z) * u <= 3;
        },
      },
      s.position
    );
    return currentWindow();
  }
  function tick(dt) {
    if (disposed || !isCurrent()) return;
    const r = currentWindow();
    if (!r || r.complete || r.interrupted) return;
    const a = active(),
      role = binding.role,
      plan = astronomyExposurePlan(a, role),
      s = observer(),
      optics = presentation.readOptics(plan.seconds - r.activeSeconds <= 0.25),
      aligned =
        astronomySeparation(
          optics.axis,
          astronomyAxis(plan.pointing.azimuth, plan.pointing.altitude)
        ) <= 0.025 && (role === 'dark' ? optics.covered : optics.clear);
    recorder.tick(dt, { ...s, supported: s.supported && s.near, sensorAligned: aligned });
    const result = recorder.snapshot();
    if (result.complete) {
      const final = presentation.readOptics(true),
        pointing = { azimuth: final.azimuth, altitude: final.altitude };
      const image = syntheticDetectorFrame({
        target: a.target,
        location: a.site.location,
        referenceTime: a.referenceTime,
        pointing,
        seconds: plan.seconds,
        seed,
        shutter: plan.shutter,
        hotPixel: plan.hotPixel,
      });
      frozen = {
        instrumentId: a.site.id,
        role,
        axis: final.axis,
        opticalState:
          role === 'dark' && final.covered
            ? 'covered-reference'
            : role !== 'dark' && final.clear
              ? 'open-and-clear'
              : 'blocked',
        effort: result,
        image: encodeDetectorFrame(image),
      };
      presentation.showFrame(frozen.image);
    }
  }
  function prepare(command) {
    ensure();
    const a = active();
    if (command.type === 'align') {
      const s = observer(),
        r = presentation.readOptics(true);
      if (!s.near || !s.supported || !r.clear)
        throw Error('Stand beside the supported telescope with a clear aperture.');
      return {
        type: 'align',
        alignment: {
          instrumentId: a.site.id,
          clear: r.clear,
          axis: r.axis,
          azimuth: r.azimuth,
          altitude: r.altitude,
        },
      };
    }
    if (command.type === 'expose') {
      const r = currentWindow();
      if (!r?.complete || r.interrupted || !frozen || frozen.opticalState === 'blocked')
        throw Error('Finish the aligned exposure before saving its pixels.');
      return { type: 'expose', exposure: structuredClone(frozen) };
    }
    return command;
  }
  return {
    start,
    tick,
    prepare,
    turn(azimuthDelta, altitudeDelta) {
      ensure();
      return presentation.turn(azimuthDelta, altitudeDelta);
    },
    clear() {
      ensure();
      clear();
      const a = active(),
        last = a.frames.dark || a.frames.comparison || a.frames.primary;
      presentation.showFrame(last?.image || null);
    },
    snapshot() {
      if (disposed) return { closed: true, window: null };
      const a = active(),
        r = currentWindow(),
        optics = presentation.readOptics();
      return {
        optics,
        errorDegrees: astronomySeparation(optics.axis, a.catalogDirection),
        window: r
          ? {
              ...r,
              ready: !!frozen && frozen.opticalState !== 'blocked',
              role: binding.role,
              image: frozen ? structuredClone(frozen.image) : null,
            }
          : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      recorder.dispose();
      binding = frozen = null;
    },
  };
}
