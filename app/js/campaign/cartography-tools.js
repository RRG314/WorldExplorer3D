import { inspectCartographyAccess } from './cartography-access.js';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { createCartographyRecorder } from './cartography-recorder.js';
import { cartographyTarget } from './cartography-career.js';
import {
  createNavigationRoute,
  clearNavigation,
  navigationDestinationSnapshot,
} from '../game/navigation-ui.js?v=2';
import { findTraversalRoute } from '../world/traversal.js?v=4';
export function createCartographyTools(
  runtime,
  qualified,
  presentation,
  { getState, isCurrent } = {}
) {
  const recorder = createCartographyRecorder(),
    u = qualified.metersPerUnit,
    frame = earthCoordinateFrame(runtime.LOC, runtime.SCALE),
    prior = navigationDestinationSnapshot(),
    world = runtime._worldLoadSequence,
    owner = 'cartography:' + getState().active.runId;
  let disposed = false,
    legKey = null,
    lastTarget = null;
  const active = () => getState().active;
  function sample() {
    const a = active(),
      w = runtime.Walk?.state?.walker,
      s = w && runtime.SurfaceQuery.walkAt(w.x, w.z, { currentY: w.y, sampleRenderedMesh: true });
    return {
      runId: a.runId,
      siteId: a.site.id,
      legIndex: a.phase === 'leg-one' ? 0 : 1,
      sceneId: runtime.scene.uuid,
      position: w ? frame.toGeographic(w.x, w.z) : null,
      heightMeters: Number(s?.position?.y) * u,
      surfaceKind: s?.kind || 'terrain',
      supported:
        !!w &&
        Number.isFinite(s?.position?.y) &&
        Math.abs(w.y - s.position.y) * u < 2.5 &&
        !runtime.worldLoading &&
        !runtime.activeInterior,
      mode: runtime.getCurrentTravelMode?.(),
      liveGps: !!runtime.getLiveGpsSnapshot?.().active,
      paused: !!runtime.paused,
      hidden: document.hidden,
    };
  }
  function current() {
    const a = active(),
      key = ['leg-one', 'leg-two'].includes(a.phase) ? a.runId + ':' + a.phase : null;
    if (key !== legKey) {
      recorder.clear();
      legKey = key;
    }
    return recorder.snapshot();
  }
  function start() {
    if (disposed || !isCurrent()) throw Error('This survey is closed.');
    current();
    const a = active(),
      i = a.phase === 'leg-one' ? 0 : a.phase === 'leg-two' ? 1 : -1;
    if (i < 0) throw Error('Choose a route leg to record.');
    const s = sample(),
      from = a.site.points[a.site.plan.legs[i].from];
    const p = frame.toWorld(from.lat, from.lon),
      w = runtime.Walk?.state?.walker;
    if (!w || Math.hypot(w.x - p.x, w.z - p.z) * u > 0.8)
      throw Error('Return within 0.8 m of the previous control to start this leg.');
    recorder.start(
      {
        runId: a.runId,
        siteId: a.site.id,
        sceneId: runtime.scene.uuid,
        legIndex: i,
        destination: a.site.points[a.site.plan.legs[i].to],
      },
      s
    );
  }
  function guide(id = cartographyTarget(active())) {
    const w = runtime.Walk?.state?.walker,
      p = qualified.points[id];
    if (!w || !p) return false;
    if (!findTraversalRoute(w.x, w.z, p.x, p.z, { mode: 'walk', maxAnchorDistance: 16 / u })) {
      runtime.showToast?.('No connected walking route is loaded from here.');
      return false;
    }
    createNavigationRoute(w.x, w.z, p.x, p.z, true, {
      owner,
      label: 'Survey control ' + ({ origin: 'O', a: 'A', b: 'B', entry: 'E' }[id] || id),
    });
    lastTarget = id;
    return true;
  }
  function inspection() {
    return inspectCartographyAccess(runtime, qualified, active());
  }

  return {
    start,
    guide,
    controls: () => presentation.controls(active()),
    inspection,
    prepare(command) {
      if (disposed || !isCurrent()) throw Error('This survey changed.');
      current();
      return {
        ...command,
        ...(command.type === 'controls'
          ? { controls: presentation.controls(active()) }
          : command.type === 'measure'
            ? { reading: recorder.prepare() }
            : command.type === 'access'
              ? { inspection: inspection() }
              : {}),
      };
    },
    tick(dt) {
      if (disposed || !isCurrent()) return;
      current();
      const a = active();
      if (legKey) {
        if (!recorder.snapshot()) {
          const s = sample(),
            from = a.site.points[a.site.plan.legs[a.phase === 'leg-one' ? 0 : 1].from],
            p = frame.toWorld(from.lat, from.lon),
            w = runtime.Walk?.state?.walker;
          if (w && !s.paused && !s.hidden && Math.hypot(w.x - p.x, w.z - p.z) * u <= 0.8) start();
        }
        recorder.tick(dt, sample());
      }
    },
    snapshot() {
      return { window: current(), target: cartographyTarget(active()), lastGuidance: lastTarget };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      recorder.dispose();
      if (navigationDestinationSnapshot()?.owner === owner) {
        clearNavigation(owner);
        const w = runtime.Walk?.state?.walker;
        if (prior && w && world === runtime._worldLoadSequence)
          createNavigationRoute(w.x, w.z, prior.x, prior.z, true, {
            owner: prior.owner,
            label: prior.label,
          });
      }
    },
  };
}
