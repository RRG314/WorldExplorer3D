import { createFieldEffortRecorder } from './field-effort-recorder.js';
import { createAcceleratorExperimentClient } from './accelerator-experiment-client.js';
import {
  acceleratorTarget,
  acceleratorInstrumentPose,
  acceleratorDisplayPath,
} from './accelerator-career.js';
import { compactAcceleratorExperiment } from './accelerator-experiments.js';
import { hitSample } from '../../vendor/collision-lab/models.mjs';
import { acceleratorStudy } from './accelerator-studies.js';

// Volatile working instruments use the one research plugin's normal frame.
// The occupied interior owns architecture; this owns only its removable display
// and worker. Interior abort releases them before its scene is destroyed.
export function createAcceleratorTools(runtime, { getState, near, isCurrent }) {
  const T = globalThis.THREE,
    recorder = createFieldEffortRecorder();
  let binding = null,
    client = null,
    window = null,
    sequence = 0,
    disposed = false;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  function clear() {
    sequence++;
    recorder.clear();
    if (window?.group) {
      window.group.parent?.remove(window.group);
      window.group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
    window = null;
  }
  function release() {
    clear();
    client?.dispose();
    client = null;
    binding?.controller.signal.removeEventListener('abort', release);
    binding = null;
  }
  function ensure() {
    if (disposed || !isCurrent()) throw Error('This instrument visit closed.');
    const active = runtime.activeInterior;
    if (!active?.cern || !active.cern.current())
      throw Error('Enter the marked CERN training facility.');
    if (binding !== active.cern) {
      release();
      binding = active.cern;
      binding.controller.signal.addEventListener('abort', release, { once: true });
    }
    if (!client)
      client = createAcceleratorExperimentClient({
        isCurrent: (scope) =>
          !disposed &&
          isCurrent() &&
          binding?.current() &&
          (!scope || (scope.revision === getState().revision && scope.generation === sequence)),
      });
    return active.cern.visit;
  }
  function meshPose(method, inputs, station) {
    const pose = acceleratorInstrumentPose(method, inputs);
    for (const [key, angle] of Object.entries(pose.angles)) station.knobs[key].rotation.z = angle;
    if (method === 'focus')
      station.quadrupoles.forEach((m, i) => {
        m.rotation.x = i % 2 && inputs.alternating ? Math.PI / 2 : 0;
      });
    const actual = { ...inputs };
    for (const [key, knob] of Object.entries(station.knobs))
      actual[key] =
        method === 'bend'
          ? (knob.rotation.z * 3) / Math.PI
          : method === 'rf'
            ? (knob.rotation.z * 180) / Math.PI
            : method === 'focus'
              ? (knob.rotation.z * 2) / Math.PI
              : knob.rotation.z / Math.PI;
    if (method === 'focus') actual.alternating = station.quadrupoles[1].rotation.x !== 0;
    return actual;
  }
  function readPose(method, inputs, station) {
    const pose = acceleratorInstrumentPose(method, inputs);
    for (const key of Object.keys(pose.angles)) pose.angles[key] = station.knobs[key].rotation.z;
    if (method === 'focus') pose.alternating = station.quadrupoles[1].rotation.x !== 0;
    if (method === 'track')
      pose.selected = window.hits.filter((m) => m.userData.selected).map((m) => m.userData.hitId);
    return pose;
  }
  return {
    async run(inputs) {
      const visit = ensure(),
        a = getState().active,
        method = acceleratorTarget(a);
      if (method === 'signals' && !binding.detector)
        throw Error(
          binding.error
            ? 'The detector display could not load. Leave and re-enter the facility to retry.'
            : 'The detector display is still loading. Wait before opening its readouts.'
        );
      if (
        !near(method) ||
        !['bend', 'rf', 'focus', 'signals', 'track', 'mass', 'population'].includes(method)
      )
        throw Error('Walk to the current experiment station.');
      clear();
      const revision = getState().revision,
        generation = sequence,
        station = visit.stationMeshes[method],
        actualInputs = meshPose(method, inputs, station),
        group = new T.Group();
      group.name = 'Working Collision Lab instrument';
      station.group.add(group);
      window = { method, revision, group, pending: true, result: null, frozen: null, hits: [] };
      try {
        if (method === 'track') {
          for (const h of hitSample(acceleratorStudy(a.variantId).caseIndex)) {
            const selected = inputs.selected.includes(h.id),
              mesh = new T.Mesh(
                new T.SphereGeometry(0.055, 8, 6),
                new T.MeshBasicMaterial({ color: selected ? 0xe7ca75 : 0x7fb8c6, fog: false })
              );
            mesh.position.set(h.x - 1, 0.3 + h.y, 0.1);
            mesh.userData = { hitId: h.id, selected };
            group.add(mesh);
            window.hits.push(mesh);
          }
          actualInputs.selected = window.hits
            .filter((m) => m.userData.selected)
            .map((m) => m.userData.hitId);
        }
        const result = await client.run({
          studyId: a.variantId,
          method,
          inputs: actualInputs,
          generation,
          revision,
        });
        if (
          !isCurrent() ||
          generation !== sequence ||
          revision !== getState().revision ||
          !near(method)
        )
          throw new DOMException(
            'This instrument response belongs to an earlier visit.',
            'AbortError'
          );
        window.pending = false;
        window.result = result;
        window.inputs = actualInputs;
        window.station = station;
        const points = acceleratorDisplayPath(result),
          geometry = new T.BufferGeometry().setFromPoints(points.map((p) => new T.Vector3(...p))),
          path = new T.Line(geometry, new T.LineBasicMaterial({ color: 0xe2c27a, fog: false })),
          particle = new T.Mesh(
            new T.SphereGeometry(0.065, 10, 8),
            new T.MeshBasicMaterial({ color: result.accepted ? 0x83d2ab : 0xefb06f, fog: false })
          );
        group.add(path, particle);
        if (method === 'focus') {
          const vertices = [],
            history = result.plot.history;
          for (let h = 1; h < history.length; h++)
            for (let i = 0; i < 64; i++)
              for (const sample of [history[h - 1], history[h]])
                vertices.push(
                  -1 + (sample.s / 5) * 2,
                  0.2 + sample.rays[i][0] * 20,
                  sample.rays[i][1] * 20
                );
          const geometry = new T.BufferGeometry();
          geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
          group.add(
            new T.LineSegments(
              geometry,
              new T.LineBasicMaterial({
                color: 0x78afb4,
                transparent: true,
                opacity: 0.6,
                fog: false,
              })
            )
          );
        }
        particle.position.set(...points[0]);
        window.points = points;
        window.particle = particle;
        if (method === 'signals' && binding.detector)
          binding.detector.setLayer(
            actualInputs.revealed.length === 1
              ? ['tracking', 'ecal', 'hcal', 'muon'][actualInputs.revealed[0]]
              : 'all'
          );
        binding.lighting.apply(group);
        recorder.start(
          {
            runId: a.runId,
            habitatId: 'cern:' + method,
            method: 'accelerator-' + method,
            seconds: 3,
            metersPerUnit: runtime.METERS_PER_WORLD_UNIT,
            stationary: true,
            sensor: true,
            trackDistance: false,
            contains: () => near(method),
            sensorMessage: 'Remain beside the supported working instrument.',
          },
          runtime.Walk.state.walker
        );
        return result;
      } catch (error) {
        if (generation === sequence) clear();
        throw error;
      }
    },
    tick(dt) {
      if (!window || window.pending || window.frozen || disposed) return;
      if (!isCurrent() || !binding?.current() || window.revision !== getState().revision) {
        release();
        return;
      }
      const actor = runtime.Walk?.state?.walker;
      recorder.tick(dt, {
        position: actor,
        walking: runtime.getCurrentTravelMode?.() === 'walk',
        liveGps: runtime.getLiveGpsSnapshot?.().active === true,
        paused: runtime.paused,
        hidden: document.hidden,
        supported: actor?.onGround === true && near(window.method),
        sensorAligned: near(window.method),
      });
      const e = recorder.snapshot();
      if (!e) return;
      const q = window.points[Math.min(120, Math.floor((e.activeSeconds / 3) * 120))];
      window.particle.position.set(...q);
      if (e.complete) {
        window.frozen = copy({
          experiment: compactAcceleratorExperiment(window.result),
          pose: readPose(window.method, window.inputs, window.station),
          effort: e,
          display: {
            version: 1,
            method: window.method,
            samples: window.points.length,
            position: window.particle.position.toArray(),
            expectedPosition: window.points.at(-1),
          },
          ...(window.result.dataVerification
            ? { dataVerification: window.result.dataVerification }
            : {}),
        });
      }
    },
    reading: () => window?.result || null,
    record() {
      if (!window?.frozen || window.revision !== getState().revision)
        throw Error('Finish the supported three-second working display first.');
      return copy(window.frozen);
    },
    accepted() {
      clear();
    },
    snapshot: () => ({
      window: window
        ? {
            method: window.method,
            pending: window.pending,
            ready: !!window.frozen,
            accepted: window.result?.accepted,
            readings: window.result?.readings,
            effort: recorder.snapshot(),
            measurement: window.frozen ? copy(window.frozen) : null,
          }
        : null,
      worker: client?.snapshot() || null,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      recorder.dispose();
    },
  };
}
