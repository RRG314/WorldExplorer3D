import { createHydrologyRecorder } from './hydrology-recorder.js';
import {
  HYDROLOGY_PROTOCOL,
  HYDROLOGY_STUDIES,
  hydrologyTarget,
  hydrologyReading,
} from './hydrology-career.js';
export function createHydrologyTools(
  runtime,
  qualified,
  presentation,
  { getState, isCurrent } = {}
) {
  const recorder = createHydrologyRecorder(),
    u = qualified.metersPerUnit;
  let disposed = false;
  const active = () => getState().active,
    actor = () => runtime.Walk?.state?.walker;
  function enter() {
    for (let i = 0; i < 3 && runtime.Walk?.state?.view !== 'first'; i++)
      runtime.Walk?.toggleView?.();
  }
  function sample() {
    const a = active(),
      p = actor(),
      surface = p && runtime.SurfaceQuery.walkAt?.(p.x, p.z, { currentY: p.y }),
      supported =
        !!p &&
        Number.isFinite(surface?.position?.y) &&
        Math.abs(p.y - surface.position.y) * u <= 2.5 &&
        !runtime.worldLoading &&
        !runtime.activeInterior;
    return {
      observer: p ? { x: p.x, y: p.y, z: p.z } : null,
      runId: a.runId,
      siteId: a.site.id,
      stationId: hydrologyTarget(a),
      sceneId: runtime.scene.uuid,
      supported,
      mode: runtime.getCurrentTravelMode?.(),
      paused: !!runtime.paused,
      hidden: document.hidden,
      liveGps: !!runtime.getLiveGpsSnapshot?.().active,
    };
  }
  function start() {
    if (disposed || !isCurrent()) throw Error('The water instruments are closed.');
    const a = active(),
      id = hydrologyTarget(a),
      s = sample(),
      kind = a.phase === 'trace' ? 'trace' : 'measure';
    if (!['trace', 'measure', 'revisit'].includes(a.phase))
      throw Error('This step does not request a new reading.');
    const p = qualified.points[id];
    if (!s.observer || Math.hypot(s.observer.x - p.x, s.observer.z - p.z) * u > 3)
      throw Error('Stand on this marked dry bank.');
    enter();
    presentation.begin(kind, id);
    recorder.start(
      {
        kind,
        runId: a.runId,
        siteId: a.site.id,
        stationId: id,
        sceneId: runtime.scene.uuid,
        metersPerUnit: u,
        protocol: HYDROLOGY_PROTOCOL,
        truthType: kind === 'trace' ? 'visible-virtual-stream' : 'virtual-stream-instruments',
        visit: a.phase === 'revisit' ? 'return' : 'baseline',
        condition: a.phase === 'revisit' ? HYDROLOGY_STUDIES[a.variantId].condition : 'baseline',
      },
      s
    );
  }
  function currentWindow() {
    const a = active(),
      r = recorder.snapshot();
    if (
      r &&
      (r.runId !== a.runId ||
        r.stationId !== hydrologyTarget(a) ||
        r.kind !== (a.phase === 'trace' ? 'trace' : 'measure') ||
        r.visit !== (a.phase === 'revisit' ? 'return' : 'baseline') ||
        !['trace', 'measure', 'revisit'].includes(a.phase))
    ) {
      recorder.clear();
      return null;
    }
    return r;
  }
  function tick(dt) {
    if (disposed || !isCurrent() || !currentWindow()) return;
    recorder.tick(dt, sample(), {
      step: (seconds) => presentation.stepInstrument(seconds),
      read: () => presentation.read(),
    });
  }
  return {
    enter,
    start,
    tick,
    get busy() {
      return false;
    },
    snapshot() {
      const window = currentWindow();
      return {
        window,
        reading: window?.ready && window.kind === 'measure' ? hydrologyReading(window) : null,
      };
    },
    prepare(command) {
      if (disposed || !isCurrent()) throw Error('The water study changed.');
      currentWindow();
      const a = active(),
        r = ['trace', 'measure'].includes(command.type) ? recorder.result() : null;
      if (r && (r.runId !== a.runId || r.stationId !== hydrologyTarget(a)))
        throw Error('Use this station’s current measured reading.');
      return {
        ...command,
        ...(command.type === 'trace'
          ? { trace: r }
          : command.type === 'measure'
            ? { reading: r }
            : {}),
      };
    },
    dispose() {
      disposed = true;
      recorder.dispose();
    },
  };
}
