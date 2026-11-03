import { createWorldPhotoCapture } from './three-views-capture.js';
import { researchPhotoId } from './research-media.js';
export function inspectFieldPhoto(runtime, subject) {
  if (
    runtime.getEnv?.() !== 'EARTH' ||
    runtime.getCurrentTravelMode?.() !== 'walk' ||
    runtime.worldLoading ||
    runtime.activeInterior ||
    runtime.getLiveGpsSnapshot?.().active
  )
    throw Error('Use the outdoor walking camera with Live GPS off.');
  const T = globalThis.THREE,
    camera = runtime.camera,
    visible = (object) => {
      for (let p = object; p; p = p.parent) {
        if (p === runtime.Walk?.state?.characterMesh || !p.visible) return false;
      }
      return object.material?.visible !== false;
    };
  if (!subject?.objects?.length || !subject.objects.every(visible))
    throw Error('The required field subject is no longer exposed.');
  camera.updateMatrixWorld();
  runtime.scene.updateMatrixWorld(true);
  const bounds = new T.Box3();
  for (const object of subject.objects) bounds.union(new T.Box3().setFromObject(object));
  const center = bounds.getCenter(new T.Vector3()),
    projected = center.clone().project(camera),
    from = camera.getWorldPosition(new T.Vector3()),
    range = from.distanceTo(center) * (runtime.METERS_PER_WORLD_UNIT || 1.11);
  if (
    projected.z < -1 ||
    projected.z > 1 ||
    Math.abs(projected.x) > 0.65 ||
    Math.abs(projected.y) > 0.65
  )
    throw Error('Aim the centre of the screen at the highlighted field subject.');
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new T.Vector3(x, y, z).project(camera));
  const dx = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)),
    dy = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y));
  if (Math.hypot(dx, dy) < 0.055)
    throw Error('Move closer so the subject is large enough to study.');
  const ray = new T.Raycaster(),
    samples = [];
  let clearCount = 0;
  // Inspect each requested object separately: a coil has an empty centre, and
  // an orientation photograph must include the physical north marker too.
  for (const object of subject.objects) {
    const targetBounds = new T.Box3().setFromObject(object),
      target = targetBounds.getCenter(new T.Vector3()).project(camera);
    if (Math.abs(target.x) > 0.85 || Math.abs(target.y) > 0.85) continue;
    const a = targetBounds.min.clone().project(camera),
      b = targetBounds.max.clone().project(camera);
    let clear = false;
    for (const x of [-0.3, 0, 0.3])
      for (const y of [-0.3, 0, 0.3]) {
        if (clear) continue;
        ray.setFromCamera(
          new T.Vector2(target.x + x * Math.abs(b.x - a.x), target.y + y * Math.abs(b.y - a.y)),
          camera
        );
        ray.near = 0.02;
        ray.far = from.distanceTo(center) + 2;
        const hit = ray
          .intersectObjects(runtime.scene.children, true)
          .find(
            (row) =>
              visible(row.object) &&
              !row.object.isSprite &&
              row.object.material?.depthTest !== false &&
              !(row.object.material?.transparent && row.object.material.opacity < 0.2)
          );
        samples.push({
          target: object.name,
          hit: hit?.object?.name,
          ancestors: hit
            ? (() => {
                const out = [];
                for (let p = hit.object; p; p = p.parent) out.push(p.name || p.type);
                return out.slice(0, 8);
              })()
            : []
        });
        if (hit) {
          for (let p = hit.object; p; p = p.parent)
            if (p === object) {
              clear = true;
              break;
            }
        }
      }
    if (clear) clearCount++;
  }
  if (!clearCount || (subject.requireAll && clearCount !== subject.objects.length)) {
    const error = Error(
      'The subject or its north marker is obscured. Move for a clear view before taking the photograph.'
    );
    error.fieldPhotoDiagnostics = {
      subjectId: subject.id,
      range,
      clearCount,
      objects: subject.objects.map((o) => o.name),
      samples
    };
    throw error;
  }
  return {
    view: {
      subjectId: subject.id,
      visible: true,
      environment: 'EARTH',
      travelMode: 'walk',
      liveGps: false,
      range,
      capturedAt: Date.now(),
      bearing: Math.atan2(center.x - from.x, center.z - from.z),
      position: { x: from.x, y: from.y, z: from.z }
    }
  };
}
export function createFieldPhotoTool(
  runtime,
  qualified,
  presentation,
  { careerId, getState, save, isCurrent }
) {
  const shutter = createWorldPhotoCapture(runtime, {
    systemId: 'research.field-camera',
    owner: 'research-careers'
  });
  let busy = false,
    disposed = false,
    lastError = null;
  const enter = () => {
    for (let i = 0; i < 3 && runtime.Walk?.state?.view !== 'first'; i++)
      runtime.Walk?.toggleView?.();
  };
  return {
    get busy() {
      return busy;
    },
    enter,
    snapshot: () => ({ busy, lastError }),
    async take(slot) {
      if (busy || disposed || !isCurrent()) throw Error('The field camera is not ready.');
      busy = true;
      try {
        enter(); // An explicit shutter action uses the existing eye-level view owner.
        const active = getState().active,
          subject = presentation.photoSubjects?.[slot];
        if (active.phase !== 'photographs' || !subject)
          throw Error('This step does not request a photograph.');
        const result = await shutter.capture(slot === 'layer' ? 'context' : 'detail', () =>
          inspectFieldPhoto(runtime, subject)
        );
        if (disposed || !isCurrent() || getState().active.runId !== active.runId)
          throw Error('The field course changed. Take the photograph again.');
        const capture = {
          id: researchPhotoId(careerId, active.runId, slot),
          runId: active.runId,
          slot,
          at: result.view.capturedAt,
          width: result.photo.width,
          height: result.photo.height,
          fingerprint: result.view.fingerprint,
          view: result.view
        };
        lastError = null;
        await save({ type: 'photograph', slot, capture }, { photoAttachment: result.photo });
      } catch (error) {
        lastError = { message: error.message, details: error.fieldPhotoDiagnostics || null };
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose() {
      disposed = true;
      shutter.dispose();
    }
  };
}
