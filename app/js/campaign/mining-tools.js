import { createFieldEffortRecorder } from './field-effort-recorder.js';
import { createBuildingCollisionQuery } from '../physics/building-collision.js?v=5';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { inspectWildlifeObservation } from './wildlife-sight.js';
import { fieldDistance } from './field-study-contract.js';
import { miningTarget } from './mining-career.js';
import { createMiningCarrier } from './mining-carrier.js';
export function createMiningTools(
  runtime,
  qualified,
  presentation,
  { getState, isCurrent = () => true } = {}
) {
  const recorder = createFieldEffortRecorder(),
    carrier = createMiningCarrier(runtime, qualified, presentation),
    query = createBuildingCollisionQuery(runtime),
    u = qualified.metersPerUnit;
  let disposed = false,
    binding = null,
    frozen = null,
    samples = [],
    route = [],
    lastRouteSeconds = -1;
  const state = () => getState(),
    active = () => state().active;
  const role = (a) =>
    a.phase === 'assay'
      ? 'assay-' + miningTarget(a)
      : a.phase === 'cut'
        ? 'cut'
        : a.phase === 'deliver'
          ? 'delivery'
          : null;
  function clear() {
    recorder.clear();
    carrier.detach();
    binding = null;
    frozen = null;
    samples = [];
    route = [];
    lastRouteSeconds = -1;
  }
  function current() {
    if (disposed) return null;
    const a = active();
    if (
      binding &&
      (binding.runId !== a.runId ||
        binding.revision !== state().revision ||
        binding.method !== role(a))
    )
      clear();
    return recorder.snapshot();
  }
  function ensure() {
    if (disposed || !isCurrent()) throw Error('The quarry instruments are closed.');
  }
  function observer() {
    const w = runtime.Walk?.state?.walker,
      g = w && runtime.SurfaceQuery.walkAt?.(w.x, w.z, { currentY: w.y }),
      id = miningTarget(active()),
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
  function corridor(faceId) {
    const face = qualified.points[faceId];
    if (!face) return { clear: false, reason: 'Choose a face.' };
    const nodes = [
        { x: face.x, z: face.z + 2 / u },
        qualified.points.dispatch,
        qualified.points.bench,
        { x: qualified.points.bench.x + 1.1 / u, z: qualified.points.bench.z },
      ],
      checks = [];
    for (let j = 1; j < nodes.length; j++) {
      const a = nodes[j - 1],
        b = nodes[j],
        count = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) * u) / 0.5));
      for (let i = 0; i <= count; i++) {
        const t = i / count,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t,
          g = runtime.SurfaceQuery.walkAt?.(x, z),
          y = g?.position?.y,
          water = runtime.SurfaceQuery.waterAt?.(x, z),
          collision =
            Number.isFinite(y) &&
            query(x, z, 0.65 / u, {
              actorBaseY: y,
              actorHeight: 1.2 / u,
              acceptCollision: (c) => c.building !== presentation.cartProxy,
            });
        if (
          !Number.isFinite(y) ||
          (water?.feature && water.position.y > y - 0.1 / u) ||
          collision?.collision
        )
          return {
            clear: false,
            reason: 'Keep a dry supported carrier corridor clear of solid obstacles.',
          };
        checks.push({ x, z, y });
      }
    }
    return { clear: true, clearanceMeters: 0.65, supportedSamples: checks.length };
  }
  function start({ restart = false } = {}) {
    ensure();
    const existing = current();
    if (existing && !restart) {
      if (
        binding.method === 'delivery' &&
        !existing.complete &&
        !existing.interrupted &&
        !carrier.snapshot().attached
      )
        carrier.attach();
      return existing;
    }
    const a = active(),
      method = role(a),
      s = observer();
    if (!method || !s.supported || !s.walking || s.liveGps || (method !== 'delivery' && !s.near))
      throw Error('Stand beside the working instrument on supported ground.');
    clear();
    const seconds = method === 'cut' ? 4 : method === 'delivery' ? 3 : 5;
    binding = { runId: a.runId, revision: state().revision, method };
    if (method.startsWith('assay-')) {
      presentation.placeLine(miningTarget(a));
      presentation.setProbe(0);
      if (!presentation.readProbe().contact) {
        clear();
        throw Error('Clear the actual assay probe path before sampling.');
      }
    }
    if (method === 'cut') {
      presentation.beginCut(a.plan.cellIds, 4);
      if (!presentation.readCutter().contact) {
        clear();
        throw Error('Place the actual cutter against the marked volume.');
      }
    }
    if (method === 'delivery') {
      if (!presentation.cargo.children.length) presentation.loadCarrier(a.plan.cellIds);
      carrier.attach();
    }
    const finish = qualified.points.bench;
    recorder.start(
      {
        runId: a.runId,
        habitatId: a.site.id + ':' + method,
        method: 'mining-' + method,
        seconds,
        metersPerUnit: u,
        stationary: method !== 'delivery',
        sensor: true,
        sensorMessage:
          method === 'delivery'
            ? 'Keep the loaded carrier attached on a clear supported route.'
            : method === 'cut'
              ? 'Keep the actual cutter in contact with the marked cells.'
              : 'Keep the assay probe aligned with a clear core contact.',
        contains:
          method === 'delivery'
            ? undefined
            : (p) =>
                Math.hypot(
                  p.x - qualified.points[miningTarget(a)].x,
                  p.z - qualified.points[miningTarget(a)].z
                ) *
                  u <=
                3,
        gates:
          method === 'delivery'
            ? [
                { id: 'dispatch', ...qualified.points.dispatch, radiusMeters: 0.7 },
                {
                  id: 'bench',
                  x: finish.x,
                  z: finish.z,
                  radiusMeters: 1.6,
                  accept: () => presentation.readScale().onPan,
                },
              ]
            : [],
      },
      s.position
    );
    return current();
  }
  function captureRoute(r, force = false) {
    const p = carrier.snapshot().position;
    if (!force && r.activeSeconds - lastRouteSeconds < 0.2) return;
    if (route.length && r.activeSeconds <= route.at(-1).activeSeconds) return;
    const position = earthCoordinateFrame(runtime.LOC, runtime.SCALE).toGeographic(p.x, p.z);
    route.push({
      position,
      heightMeters: p.y * u,
      activeSeconds: r.activeSeconds,
      supported: true,
      carrierBlocked: false,
    });
    lastRouteSeconds = r.activeSeconds;
  }
  function tick(dt) {
    if (disposed || !isCurrent()) return;
    let r = current();
    if (!r || r.complete || r.interrupted) return;
    const a = active(),
      method = binding.method,
      s = observer();
    let aligned = false;
    if (method.startsWith('assay-')) {
      presentation.setProbe(Math.min(4, Math.floor(r.activeSeconds)));
      const p = presentation.readProbe(false);
      aligned =
        p.contact &&
        p.assay?.cellId === miningTarget(a) + ':1:' + Math.min(4, Math.floor(r.activeSeconds));
    } else if (method === 'cut') {
      presentation.stepCut(r.activeSeconds, 4);
      aligned = presentation.readCutter().contact;
    } else {
      carrier.tick(dt);
      const c = carrier.snapshot();
      aligned = c.attached && !c.blocked;
      if (!route.length) captureRoute(r, true);
    }
    recorder.tick(dt, {
      ...s,
      supported: s.supported && (method === 'delivery' || s.near),
      sensorAligned: aligned,
    });
    r = recorder.snapshot();
    if (method.startsWith('assay-')) {
      const index = samples.length;
      if (index < 5 && r.activeSeconds >= index + 0.75) {
        presentation.setProbe(index);
        const p = presentation.readProbe();
        if (p.contact && p.assay)
          samples.push({
            ...p.assay,
            tipMeters: p.tipMeters,
            contact: true,
            activeSeconds: r.activeSeconds,
          });
      }
    } else if (method === 'cut') {
      presentation.stepCut(r.activeSeconds, 4);
      const p = presentation.readCutter();
      if (p.contact && !samples.some((s) => s.cellId === p.cellId) && r.activeSeconds > 0)
        samples.push({ ...p, activeSeconds: r.activeSeconds });
    } else if (aligned && r.activeSeconds > 0) captureRoute(r, r.complete);
    if (r.complete) {
      if (method.startsWith('assay-')) {
        if (samples.length !== 5) return;
        frozen = {
          faceId: miningTarget(a),
          truthType: 'modeled-virtual-line-assay',
          samples: structuredClone(samples),
          effort: r,
        };
      } else if (method === 'cut') {
        if (a.plan.cellIds.some((id) => !samples.some((s) => s.cellId === id))) return;
        frozen = {
          truthType: 'working-cutter-contact',
          contacts: structuredClone(samples),
          effort: r,
        };
      } else {
        const pan = presentation.readScale();
        if (!pan.onPan) return;
        let distanceMeters = 0;
        for (let i = 1; i < route.length; i++)
          distanceMeters += Math.hypot(
            fieldDistance(route[i - 1].position, route[i].position),
            route[i].heightMeters - route[i - 1].heightMeters
          );
        frozen = {
          truthType: 'walked-carrier-delivery',
          effort: r,
          route: structuredClone(route),
          distanceMeters,
          onPan: true,
          wheelClearancesMeters: pan.wheelClearancesMeters,
          cellIds: pan.lots.map((l) => l.cellId),
          massGrams: pan.massGrams,
        };
      }
    }
  }
  function prepare(command) {
    ensure();
    const a = active();
    if (command.type === 'inspect') {
      const id = miningTarget(a),
        object = presentation.faces.get(id),
        visible = !!inspectWildlifeObservation(runtime, [object]),
        features = [
          ...new Set(
            presentation.formation.cells.filter((c) => c.faceId === id).map((c) => c.features)
          ),
        ].sort();
      return {
        type: 'inspect',
        inspection: { faceId: id, visible, features, truthType: 'visible-authored-formation' },
      };
    }
    if (['assay', 'cut', 'deliver'].includes(command.type)) {
      const r = current();
      if (!r?.complete || r.interrupted || !frozen)
        throw Error(
          'Complete the working instrument or carrier delivery before saving this record.'
        );
      return {
        type: command.type,
        [command.type === 'deliver' ? 'delivery' : command.type]: structuredClone(frozen),
      };
    }
    if (command.type === 'plan') {
      const faceId = command.cellIds?.[0]?.split(':')[0],
        returnRoute = corridor(faceId);
      if (!returnRoute.clear) throw Error(returnRoute.reason);
      return { ...command, returnRoute };
    }
    if (command.type === 'restore') {
      const returnRoute = corridor(a.zone);
      if (!returnRoute.clear) throw Error(returnRoute.reason);
      return {
        type: 'restore',
        restoration: { ...presentation.prepareRestoration(a), returnRouteClear: returnRoute.clear },
      };
    }
    return command;
  }
  return {
    start,
    tick,
    prepare,
    corridor,
    carrier,
    previewCut(ids) {
      ensure();
      if (active().phase === 'plan') presentation.highlightCut(ids);
    },
    clear() {
      ensure();
      clear();
    },
    snapshot() {
      if (disposed) return { closed: true, window: null };
      const r = current();
      return {
        window: r
          ? {
              ...r,
              ready: !!frozen,
              method: binding.method,
              data: frozen ? structuredClone(frozen) : null,
            }
          : null,
        carrier: carrier.snapshot(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      recorder.dispose();
      carrier.dispose();
      binding = frozen = null;
      samples = route = [];
    },
  };
}
