import { marineGeometryLineClear } from '../ocean/geometry-line-of-sight.js';
import { parentHullCollision } from '../ocean/parent-vessel.js';
import { oceanParentPosition } from '../ocean/stream-runtime.js';
import { COMMON_DOLPHIN } from '../ocean/cetacean-rules.js';

// Read-only views of the existing life owner. Generated stand-ins cannot
// qualify as identified animals; no spawn/update/disposal authority lives here.
export function marineVisualSubjects(mode) {
  const fish = (mode?.fishEntities || []).map((f) => ({
    ...f,
    kind: 'fish',
    minimumDistanceMeters: 5,
    maximumDistanceMeters: 25,
  }));
  const dolphins = (mode?.cetaceans || []).map((a) => ({
    ...a,
    kind: 'dolphin',
    speciesId: COMMON_DOLPHIN.speciesId,
    speciesLabel: COMMON_DOLPHIN.label,
    minimumDistanceMeters: 50,
    maximumDistanceMeters: 160,
  }));
  return [...fish, ...dolphins].filter(
    (a) => a.visualState === 'licensed' && a.individualId && a.assetId && a.mesh?.visible
  );
}
export function createMarineObservationView(
  ctx,
  {
    THREE = globalThis.THREE,
    clock = () => performance.now(),
    documentRef = globalThis.document,
  } = {}
) {
  const ray = new THREE.Raycaster(),
    eye = new THREE.Vector3(),
    center = new THREE.Vector3(),
    edge = new THREE.Vector3(),
    right = new THREE.Vector3(),
    direction = new THREE.Vector3();
  let last = -Infinity,
    key = '',
    records = [];
  function occlusionRects() {
    if (!documentRef) return [];
    return [
      ...documentRef.querySelectorAll(
        '#hudBox,#hudMap,#hudUtilities,#floatMenuContainer,dialog[open]'
      ),
    ]
      .filter((node) => {
        const css = getComputedStyle(node);
        return css.display !== 'none' && css.visibility !== 'hidden' && !node.hidden;
      })
      .map((node) => node.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
  }
  function read({ force = false } = {}) {
    const mode = ctx.oceanMode,
      camera = mode?.camera,
      actor = mode?.submarine,
      now = clock(),
      nextKey = `${mode?.scene?.uuid || ''}:${camera?.uuid || ''}:${mode?.frameOrigin?.lat || ''}:${mode?.frameOrigin?.lon || ''}`;
    if (!mode?.active || !camera || !actor || mode.diver?.active) {
      records = [];
      return records;
    }
    if (!force && key === nextKey && now - last < 150) return records;
    last = now;
    key = nextKey;
    records = [];
    const u = ctx.METERS_PER_WORLD_UNIT || 1,
      canvas = mode.canvas || mode.renderer?.domElement,
      box = canvas?.getBoundingClientRect?.() || {
        left: 0,
        top: 0,
        width: globalThis.innerWidth || 1280,
        height: globalThis.innerHeight || 800,
      },
      rects = occlusionRects(),
      parent = oceanParentPosition(mode, ctx.SCALE),
      plan = mode.habitat?.plan;
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(eye);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const nearby = marineVisualSubjects(mode)
      .map((a) => ({
        a,
        d:
          Math.hypot(
            a.mesh.position.x - actor.position.x,
            a.mesh.position.y - actor.position.y,
            a.mesh.position.z - actor.position.z
          ) * u,
      }))
      .filter(({ a, d }) => d >= a.minimumDistanceMeters && d <= a.maximumDistanceMeters)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12);
    for (const { a, d } of nearby) {
      const p = a.mesh.position,
        radius = Math.max(0.1, Number(a.radius) || 0.3);
      center.copy(p).project(camera);
      if (center.z <= -1 || center.z >= 1 || Math.abs(center.x) > 0.9 || Math.abs(center.y) > 0.85)
        continue;
      edge.copy(p).addScaledVector(right, radius).project(camera);
      const diameterPixels = Math.abs(edge.x - center.x) * box.width;
      if (diameterPixels < 6) continue;
      const x = box.left + ((center.x + 1) * box.width) / 2,
        y = box.top + ((1 - center.y) * box.height) / 2;
      if (rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
      const length = eye.distanceTo(p),
        fog = mode.scene?.fog;
      if (fog?.isFogExp2 && Math.exp(-((fog.density * length) ** 2)) < 0.12) continue;
      const target = {
        id: 'marine-visual-target',
        x: p.x,
        y: p.y,
        z: p.z,
        radius: Math.min(12, radius),
      };
      if (!marineGeometryLineClear(plan, mode.habitat?.sampleSeabedHeight, eye, target)) continue;
      let hullClear = true;
      for (let i = 1, n = Math.ceil(length / 1.5); i < n; i++) {
        const t = i / n,
          q = {
            x: eye.x + (p.x - eye.x) * t,
            y: eye.y + (p.y - eye.y) * t,
            z: eye.z + (p.z - eye.z) * t,
          };
        if (
          parentHullCollision(
            ctx.oceanVoyage?.current?.ship,
            q,
            0.05,
            mode.waterSurface?.sample(q.x, q.z)?.surfaceY || 0,
            parent
          )
        ) {
          hullClear = false;
          break;
        }
      }
      if (!hullClear) continue;
      if (actor.mesh) {
        direction.copy(p).sub(eye).normalize();
        ray.set(eye, direction);
        ray.far = Math.max(0, length - radius * 0.5);
        const hidden = ray.intersectObject(actor.mesh, true).some((hit) => {
          const material = Array.isArray(hit.object.material)
            ? hit.object.material[hit.face?.materialIndex || 0]
            : hit.object.material;
          return material?.visible !== false && !(material?.transparent && material.opacity < 0.5);
        });
        if (hidden) continue;
      }
      records.push({
        truthType: 'simulated-licensed-animal',
        visible: true,
        lineClear: true,
        individualId: a.individualId,
        speciesId: a.speciesId,
        speciesLabel: a.speciesLabel || a.speciesId,
        assetId: a.assetId,
        kind: a.kind,
        observerPosition: { ...actor.position },
        waterSurfaceY: mode.waterSurface?.sample(p.x, p.z)?.surfaceY || 0,
        depthMeters: Math.max(0, ((mode.waterSurface?.sample(p.x, p.z)?.surfaceY || 0) - p.y) * u),
        position: { x: p.x, y: p.y, z: p.z },
        distanceMeters: d,
        minimumDistanceMeters: a.minimumDistanceMeters,
        diameterPixels,
        observedAt: Date.now(),
      });
    }
    return records;
  }
  return {
    read,
    clear() {
      records = [];
      last = -Infinity;
      key = '';
    },
  };
}
