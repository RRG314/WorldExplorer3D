import { createMeteorologyRecorder } from './meteorology-recorder.js';
import { meteorologyTarget, METEOROLOGY_STUDIES } from './meteorology-career.js';
import { meteorologySourceSnapshot } from './meteorology-source.js';
export function createMeteorologyTools(
  runtime,
  qualified,
  presentation,
  { getState, isCurrent } = {}
) {
  const recorder = createMeteorologyRecorder(),
    u = qualified.metersPerUnit;
  let disposed = false,
    source = null,
    sourceRun = null;
  const active = () => getState().active;
  function enter() {
    for (let i = 0; i < 3 && runtime.Walk?.state?.view !== 'first'; i++)
      runtime.Walk?.toggleView?.();
  }
  function readSource(refresh = false) {
    const a = active();
    if (refresh || !source || sourceRun !== a.runId) {
      source = meteorologySourceSnapshot(runtime);
      sourceRun = a.runId;
    }
    return structuredClone(source);
  }
  function sample() {
    const a = active(),
      p = runtime.Walk?.state?.walker,
      s = p && runtime.SurfaceQuery.walkAt?.(p.x, p.z, { currentY: p.y });
    return {
      runId: a.runId,
      siteId: a.site.id,
      stationId: meteorologyTarget(a),
      sceneId: runtime.scene.uuid,
      observer: p ? { x: p.x, y: p.y, z: p.z } : null,
      supported:
        !!p &&
        Number.isFinite(s?.position?.y) &&
        Math.abs(p.y - s.position.y) * u <= 2.5 &&
        !runtime.worldLoading &&
        !runtime.activeInterior,
      paused: !!runtime.paused,
      hidden: document.hidden,
      liveGps: !!runtime.getLiveGpsSnapshot?.().active,
      mode: runtime.getCurrentTravelMode?.(),
    };
  }
  function currentWindow() {
    const a = active(),
      r = recorder.snapshot(),
      visit = a.phase === 'verify' ? 'verification' : 'baseline';
    if (
      r &&
      (r.runId !== a.runId ||
        r.stationId !== meteorologyTarget(a) ||
        r.visit !== visit ||
        !['deploy', 'compare', 'verify'].includes(a.phase))
    ) {
      recorder.clear();
      return null;
    }
    return r;
  }
  function start() {
    if (disposed || !isCurrent()) throw Error('The weather instruments are closed.');
    const a = active(),
      s = sample(),
      id = meteorologyTarget(a),
      p = qualified.points[id];
    if (
      !['deploy', 'compare', 'verify'].includes(a.phase) ||
      !s.observer ||
      Math.hypot(s.observer.x - p.x, s.observer.z - p.z) * u > 3
    )
      throw Error('Stand beside this marked weather instrument.');
    enter();
    presentation.begin(id);
    recorder.start(
      {
        runId: a.runId,
        siteId: a.site.id,
        stationId: id,
        sceneId: runtime.scene.uuid,
        metersPerUnit: u,
        visit: a.phase === 'verify' ? 'verification' : 'baseline',
        referenceTime:
          METEOROLOGY_STUDIES[a.variantId].referenceTime + (a.phase === 'verify' ? 3600000 : 0),
      },
      s,
      () => presentation.read()
    );
  }
  return {
    enter,
    start,
    source: readSource,
    get busy() {
      return false;
    },
    tick(dt) {
      if (disposed || !isCurrent() || !currentWindow()) return;
      recorder.tick(dt, sample(), {
        step: (seconds) => presentation.stepInstrument(seconds),
        read: () => presentation.read(),
      });
    },
    snapshot() {
      return {
        window: currentWindow(),
        source: active().phase === 'source' ? readSource() : active().source,
      };
    },
    prepare(command) {
      if (disposed || !isCurrent()) throw Error('The weather study changed.');
      currentWindow();
      return {
        ...command,
        ...(command.type === 'source-check'
          ? { source: readSource() }
          : command.type === 'measure'
            ? { reading: recorder.result() }
            : {}),
      };
    },
    dispose() {
      disposed = true;
      source = null;
      recorder.dispose();
    },
  };
}
