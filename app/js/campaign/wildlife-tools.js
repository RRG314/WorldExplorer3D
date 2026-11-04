import { createFieldEffortRecorder, createFieldMotionRecorder } from './field-effort-recorder.js';
import { createFieldPhotoTool, inspectFieldPhoto } from './field-photo-tool.js';
import { WILDLIFE_METHODS, WILDLIFE_STUDIES } from './wildlife-career.js';

import {
  wildlifeOccluders,
  wildlifeSightLine,
  inspectWildlifeObservation
} from './wildlife-sight.js';
// A mounted sensor uses a cone and solid mesh sightlines, without a second
// render camera. Sprites are labels, never geometry occluders.
export function inspectWildlifeSensor(
  runtime,
  sensor,
  subject,
  occluders = wildlifeOccluders(runtime),
  diagnostics = null
) {
  if (!sensor.aligned) return null;
  const object = subject.object;
  for (let p = object; p; p = p.parent) if (!p.visible) return null;
  const result = wildlifeSightLine(runtime, {
    objects: [object.userData.curatedAnimalAttachment?.visual || object],
    origin: sensor.origin,
    occluders,
    diagnostics,
    accept: (point, range, delta) => {
      const bearing = Math.atan2(delta.x, delta.z),
        angle = Math.atan2(Math.sin(bearing - sensor.bearing), Math.cos(bearing - sensor.bearing));
      return (
        range >= 1 &&
        range <= 14 &&
        Math.abs(angle) <= Math.PI / 6 &&
        Math.abs(Math.atan2(delta.y, Math.hypot(delta.x, delta.z))) <= Math.PI / 5
      );
    }
  });
  return result
    ? {
        range: result.range,
        position: { x: object.position.x, y: object.position.y, z: object.position.z }
      }
    : null;
}
export function createWildlifeTools(runtime, qualified, presentation, context) {
  const { getState, save, isCurrent } = context,
    u = qualified.metersPerUnit,
    recorder = createFieldEffortRecorder();
  const photo = createFieldPhotoTool(runtime, qualified, presentation, {
    ...context,
    accepts: (active, slot) =>
      active.phase === 'survey' &&
      active.method === 'track-photo' &&
      slot === `habitat-${active.habitatIndex === 0 ? 'a' : 'b'}`
  });
  let disposed = false,
    busy = false,
    lastError = '',
    sampleElapsed = 0,
    lastObservations = [],
    lastSensorAligned = false;
  const motion = createFieldMotionRecorder({ metersPerUnit: u });
  const actor = () => runtime.Walk?.state?.walker;
  const active = () => getState().active;
  const habitat = () => (active().habitatIndex === 0 ? 'a' : 'b');
  function current() {
    if (disposed || !isCurrent()) throw Error('The wildlife instruments are no longer active.');
  }
  function visibleSubjects(id, occluders = wildlifeOccluders(runtime, { excludeObserver: true })) {
    return presentation
      .subjects()
      .filter((row) => row.id.startsWith(`research-wildlife:${active().runId}:${id}:`))
      .filter((row) =>
        inspectWildlifeObservation(
          runtime,
          [row.object.userData.curatedAnimalAttachment?.visual || row.object],
          occluders
        )
      );
  }
  async function inspectLead() {
    current();
    photo.enter();
    const a = active(),
      study = WILDLIFE_STUDIES[a.variantId];
    let lead;
    if (study.lead === 'animal') {
      const subject = visibleSubjects('a')[0];
      if (!subject)
        throw Error(
          'Face the deer in the wooded plot with a clear view. Keep a respectful distance.'
        );
      lead = { id: subject.id, kind: 'animal', assetId: subject.assetId, taxon: subject.taxon };
    } else {
      inspectFieldPhoto(runtime, presentation.photoSubjects['habitat-a']);
      lead = {
        id: `research-wildlife:${a.runId}:a:sign`,
        kind: 'track',
        taxon: 'hoofed-mammal-sign'
      };
    }
    await save({
      type: 'inspect',
      lead: { ...lead, visible: true, truthType: 'virtual-training-observation', at: Date.now() }
    });
  }
  function align() {
    current();
    const id = habitat(),
      direction = runtime.camera.getWorldDirection(new globalThis.THREE.Vector3());
    const bearing = Math.atan2(direction.x, direction.z),
      p = qualified.points[id],
      s = presentation.sensors[id],
      toward = Math.atan2(p.x - s.origin.x, p.z - 7 / u - s.origin.z),
      angle = Math.atan2(Math.sin(bearing - toward), Math.cos(bearing - toward));
    if (Math.abs(angle) > Math.PI / 7)
      throw Error(
        'Aim at the animal path beyond the finish marker, then align the mounted sensor.'
      );
    presentation.alignSensor(id, bearing);
    return 'Sensor aligned · 60° cone · 14 m range. Moving virtual animals trigger detections.';
  }
  function start() {
    current();
    const a = active(),
      id = habitat(),
      method = WILDLIFE_METHODS[a.method],
      p = actor(),
      center = qualified.points[id],
      route = presentation.routes[id];
    if (a.phase !== 'survey' || !method || !p)
      throw Error('Choose your observation protocol first.');
    const transect = method.minimumDistance > 0;
    if (transect && Math.hypot(p.x - route.start.x, p.z - route.start.z) * u > 0.35)
      throw Error('Begin inside the START stakes, then walk straight to FINISH.');
    if (!transect && Math.hypot(p.x - center.x, p.z - center.z) * u > 1.25)
      throw Error('Begin at the centre of this observation plot.');
    if (a.method === 'trail-camera' && !presentation.sensors[id].aligned)
      throw Error('Align the mounted sensor before starting its detection window.');
    recorder.start(
      {
        runId: a.runId,
        habitatId: id,
        method: a.method,
        seconds: method.seconds,
        metersPerUnit: u,
        stationary: a.method === 'stationary-watch',
        trackDistance: a.method !== 'trail-camera',
        sensor: a.method === 'trail-camera',
        gates: transect
          ? [
              { id: 'start', ...route.start, radiusMeters: 0.35 },
              { id: 'finish', ...route.finish, radiusMeters: 0.35 }
            ]
          : [],
        contains: transect
          ? (point) =>
              Math.abs(point.x - center.x) * u <= 0.9 && Math.abs(point.z - center.z) * u <= 3.6
          : null
      },
      p
    );
    lastObservations = [];
    motion.clear();
    sampleElapsed = 1;
    lastError = '';
    photo.enter();
  }
  function tick(dt) {
    if (disposed || !isCurrent()) return;
    const a = active(),
      id = habitat(),
      prior = recorder.snapshot();
    if (prior && (prior.runId !== a.runId || prior.habitatId !== id || a.phase !== 'survey')) {
      recorder.clear();
      lastObservations = [];
      return;
    }
    if (!prior || prior.complete || prior.interrupted) return;
    const p = actor(),
      paused = runtime.paused === true || document.hidden,
      walk =
        runtime.getCurrentTravelMode?.() === 'walk' &&
        !runtime.activeInterior &&
        runtime.getEnv?.() === 'EARTH' &&
        !runtime.worldLoading;
    const surface = p && runtime.SurfaceQuery?.walkAt?.(p.x, p.z, { currentY: p.y }),
      supported =
        Number.isFinite(surface?.position?.y) && Math.abs(p.y - surface.position.y) * u <= 2.5;
    sampleElapsed += Math.max(0, dt);
    if (!paused && walk && supported && sampleElapsed >= 0.12) {
      sampleElapsed = 0;
      lastObservations = [];
      lastSensorAligned = false;
      const occluders = wildlifeOccluders(runtime, {
        excludeObserver: a.method !== 'trail-camera'
      });
      if (a.method === 'track-photo') {
        if (inspectWildlifeObservation(runtime, presentation.signObservations[id], occluders)) {
          lastObservations = [
            {
              id: `research-wildlife:${a.runId}:${id}:sign`,
              taxon: id === 'a' ? 'hoofed-mammal-sign' : 'canid-sign',
              source: 'visible-track',
              behavior: 'persistent-sign',
              visible: true
            }
          ];
        }
      } else if (a.method === 'trail-camera') {
        const sensor = presentation.sensors[id];
        lastSensorAligned = sensor.aligned;
        for (const subject of presentation
          .subjects()
          .filter((row) => row.id.startsWith(`research-wildlife:${a.runId}:${id}:`))) {
          const seen = inspectWildlifeSensor(runtime, sensor, subject, occluders);
          const triggerKey = motion.observe(
            subject.id,
            subject.object.position,
            !!seen,
            prior.activeSeconds
          );
          if (triggerKey)
            lastObservations.push({
              id: subject.id,
              taxon: subject.taxon,
              source: 'virtual-motion-trigger',
              behavior: 'moving-through-cone',
              visible: false,
              triggerKey
            });
        }
      } else
        lastObservations = visibleSubjects(id, occluders).map((row) => ({
          id: row.id,
          taxon: row.taxon,
          source: 'visible-animal',
          behavior: row.object.userData.curatedAnimalActivity === 'walk' ? 'walking' : 'standing',
          visible: true
        }));
    }
    recorder.tick(dt, {
      position: p,
      walking: walk,
      liveGps: runtime.getLiveGpsSnapshot?.().active === true,
      paused: runtime.paused === true,
      hidden: document.hidden,
      supported,
      sensorAligned: lastSensorAligned,
      observations: lastObservations
    });
  }
  async function record() {
    current();
    const effort = recorder.snapshot();
    if (!effort?.complete || effort.interrupted)
      throw Error('Finish the measured observation before recording it.');
    if (effort.method === 'trail-camera') {
      effort.instrumentVersion = 2;
      const s = presentation.sensors[effort.habitatId];
      effort.sensor = {
        ...effort.sensor,
        bearing: s.bearing,
        origin: { ...s.origin },
        horizontalFovDegrees: 60,
        rangeMeters: 14,
        truthType: 'virtual-motion-sensor'
      };
    }
    await save({ type: 'survey', effort });
    recorder.clear();
  }
  async function perform(kind, slot) {
    if (busy) throw Error('Wait for the current field record.');
    busy = true;
    try {
      lastError = '';
      if (kind === 'inspect') await inspectLead();
      else if (kind === 'record') await record();
      else if (kind === 'photo') await photo.take(slot);
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      busy = false;
    }
  }
  return {
    enter: photo.enter,
    start,
    align,
    tick,
    perform,
    get busy() {
      return busy || photo.busy;
    },
    snapshot: () => ({
      busy: busy || photo.busy,
      effort: recorder.snapshot(),
      lastError,
      sensorAligned: presentation.sensors[habitat()]?.aligned === true
    }),
    dispose() {
      disposed = true;
      recorder.dispose();
      photo.dispose();
    }
  };
}
