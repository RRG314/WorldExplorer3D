// Bounded observation probes use rendered mesh geometry. Photography keeps its
// stricter framing/shutter owner; ordinary watches do not recalculate the whole
// world's matrices or cast a nine-ray photograph check every update.
export function wildlifeOccluders(runtime, { excludeObserver = false } = {}) {
  const out = [],
    avatar = runtime.Walk?.state?.characterMesh;
  runtime.scene.traverseVisible((object) => {
    if (!object.isMesh) return;
    for (let p = object; p; p = p.parent) if (excludeObserver && p === avatar) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (
      materials.some(
        (m) =>
          m && m.visible !== false && m.depthTest !== false && !(m.transparent && m.opacity < 0.2)
      )
    )
      out.push(object);
  });
  return out;
}
function targetPoints(objects) {
  const T = globalThis.THREE,
    targets = [];
  for (const root of objects) {
    let shown = true;
    for (let p = root; p; p = p.parent) if (!p.visible) shown = false;
    if (!shown) continue;
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (!object.isMesh || object.userData.defaultAnimalFallback) return;
      const box = new T.Box3().setFromObject(object),
        size = box.getSize(new T.Vector3());
      targets.push({ point: box.getCenter(new T.Vector3()), volume: size.x * size.y * size.z });
    });
  }
  return targets
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 4)
    .map((row) => row.point);
}
function belongs(object, roots) {
  for (let p = object; p; p = p.parent) if (roots.includes(p)) return true;
  return false;
}
export function wildlifeSightLine(runtime, { objects, origin, accept, occluders, diagnostics }) {
  const T = globalThis.THREE,
    ray = new T.Raycaster(),
    from = new T.Vector3(origin.x, origin.y, origin.z);
  for (const point of targetPoints(objects)) {
    const delta = point.clone().sub(from),
      range = delta.length() * (runtime.METERS_PER_WORLD_UNIT || 1.11);
    if (!accept(point, range, delta)) {
      diagnostics?.push({ range, accepted: false, point: { x: point.x, y: point.y, z: point.z } });
      continue;
    }
    ray.set(from, delta.normalize());
    ray.near = 0.05;
    ray.far = from.distanceTo(point) + 0.1;
    const hit = ray.intersectObjects(occluders, false)[0];
    diagnostics?.push({
      range,
      accepted: true,
      point: { x: point.x, y: point.y, z: point.z },
      hit: hit
        ? {
            name: hit.object.name,
            type: hit.object.type,
            distance: hit.distance,
            ancestry: (() => {
              const out = [];
              for (let p = hit.object; p; p = p.parent) out.push(p.name || p.type);
              return out.slice(0, 7);
            })()
          }
        : null
    });
    if (hit && belongs(hit.object, objects)) return { range, point };
  }
  return null;
}
export function inspectWildlifeObservation(
  runtime,
  objects,
  occluders = wildlifeOccluders(runtime, { excludeObserver: true })
) {
  const T = globalThis.THREE,
    camera = runtime.camera;
  camera.updateMatrixWorld();
  const origin = camera.getWorldPosition(new T.Vector3());
  return wildlifeSightLine(runtime, {
    objects,
    origin,
    occluders,
    accept: (point, range) => {
      const p = point.clone().project(camera);
      return (
        range >= 0.4 &&
        range <= 18 &&
        p.z >= -1 &&
        p.z <= 1 &&
        Math.abs(p.x) < 0.9 &&
        Math.abs(p.y) < 0.9
      );
    }
  });
}
